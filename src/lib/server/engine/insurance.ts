/**
 * 保险预检引擎 —— 不依赖 LLM
 *
 * 输入：保单 + 就诊记录（逐项费用）
 * 输出：逐项可赔付判断 + 预计赔付金额 + 缺失材料清单
 */
import { getPolicyById } from '../db/insurance';
import type { AnalyzedItem, InsuranceCheckItem, InsuranceCheckResult, InsurancePolicy } from './types';

/** 构建 InsurancePolicy 对象（从 DB 或内存） */
export function buildPolicyFromData(data: {
  id: string;
  company: string;
  productName: string;
  policyNumber?: string;
  effectiveDate?: string;
  expiryDate?: string;
  waitingPeriod?: number;
  deductible?: number;
  reimbursementRate?: number;
  annualLimit?: number;
  structuredTerms?: string;
}): InsurancePolicy {
  let exclusions: string[] = [];
  let coverageItems: string[] = [];

  if (data.structuredTerms) {
    try {
      const terms = JSON.parse(data.structuredTerms);
      exclusions = terms.exclusions || [];
      coverageItems = terms.coverage_items || [];
    } catch { /* ignore */ }
  }

  return {
    id: data.id,
    company: data.company,
    productName: data.productName,
    policyNumber: data.policyNumber,
    effectiveDate: data.effectiveDate || '',
    expiryDate: data.expiryDate || '',
    waitingPeriod: data.waitingPeriod || 30,
    deductible: data.deductible || 200,
    reimbursementRate: data.reimbursementRate || 0.6,
    annualLimit: data.annualLimit || 15000,
    exclusions,
    coverageItems
  };
}

/**
 * 对就诊记录逐项进行保险预检
 */
export function checkInsurance(
  policy: InsurancePolicy,
  items: AnalyzedItem[],
  visitDate: string
): InsuranceCheckResult {
  const resultItems: InsuranceCheckItem[] = [];
  const warnings: string[] = [];

  // 检查保单是否有效
  const today = new Date();
  const visit = new Date(visitDate);

  if (policy.expiryDate && new Date(policy.expiryDate) < today) {
    warnings.push('保单已过期');
  }

  if (policy.effectiveDate && new Date(policy.effectiveDate) > visit) {
    warnings.push('就诊日期早于保单生效日期');
  }

  // 等待期检查
  if (policy.effectiveDate) {
    const effectiveDate = new Date(policy.effectiveDate);
    const waitingEnd = new Date(effectiveDate);
    waitingEnd.setDate(waitingEnd.getDate() + policy.waitingPeriod);

    if (visit < waitingEnd) {
      warnings.push(`就诊日期在等待期内（等待期${policy.waitingPeriod}天，截止${waitingEnd.toISOString().split('T')[0]}）`);
    }
  }

  // 逐项判断
  for (const item of items) {
    const checkItem = checkSingleItem(policy, item);
    resultItems.push(checkItem);
  }

  // 汇总计算
  const totalCoverable = resultItems
    .filter(it => it.coverable)
    .reduce((sum, it) => sum + it.amount, 0);

  const totalEstimatedPayout = Math.min(
    Math.max(0, (totalCoverable - policy.deductible) * policy.reimbursementRate),
    policy.annualLimit
  );

  return {
    policy,
    items: resultItems,
    totalCoverable,
    totalEstimatedPayout: Math.round(totalEstimatedPayout * 100) / 100,
    missingDocuments: getMissingDocuments(policy),
    warnings
  };
}

/** 单个项目判断 */
function checkSingleItem(policy: InsurancePolicy, item: AnalyzedItem): InsuranceCheckItem {
  const category = item.category || '其他';

  // 除外项目检查
  for (const exclusion of policy.exclusions) {
    if (item.rawName.includes(exclusion) || exclusion.includes(item.rawName)) {
      return {
        itemName: item.rawName,
        amount: item.amount,
        coverable: false,
        reason: `除外责任：${exclusion}`,
        estimatedPayout: 0
      };
    }
  }

  // 预防性项目通常不赔（疫苗、驱虫、体检等）
  const preventiveKeywords = ['疫苗', '驱虫', '体检', '美容', '洗澡', '粮食', '零食', '营养膏', '保健品'];
  for (const kw of preventiveKeywords) {
    if (item.rawName.includes(kw)) {
      return {
        itemName: item.rawName,
        amount: item.amount,
        coverable: false,
        reason: '预防性或非医疗项目，不在保障范围内',
        estimatedPayout: 0
      };
    }
  }

  // 检查类项目
  if (category === '检查' || category === '药品' || category === '手术' || category === '处置') {
    return {
      itemName: item.rawName,
      amount: item.amount,
      coverable: true,
      reason: '诊断和治疗相关项目，通常在保障范围内',
      estimatedPayout: Math.round(item.amount * 100) / 100
    };
  }

  // 耗材类：部分可赔付
  if (category === '耗材') {
    return {
      itemName: item.rawName,
      amount: item.amount,
      coverable: true,
      reason: '治疗相关耗材，可能在保障范围内（具体以条款为准）',
      estimatedPayout: Math.round(item.amount * 100) / 100
    };
  }

  return {
    itemName: item.rawName,
    amount: item.amount,
    coverable: false,
    reason: '无法确定是否在保障范围内，建议提交理赔时咨询保险公司',
    estimatedPayout: 0
  };
}

/** 获取理赔所需材料清单 */
function getMissingDocuments(policy: InsurancePolicy): string[] {
  return [
    '诊断证明（需医院盖章）',
    '费用清单（逐项明细）',
    '检查报告原件',
    '处方笺',
    '病历记录',
    policy.policyNumber ? '保单号' : '保单凭证'
  ];
}
