/**
 * 报告生成引擎 —— 基于 pet-vault-skill 报告编排模式
 *
 * 将分析结果组合为结构化 Markdown 报告，支持7种报告类型：
 *   bill_explain / claim_check / timeline / medical_summary
 *   chronic_review / clinic_client_summary / general
 *
 * 输出包含：
 *   - report.md  (Markdown 正文)
 *   - manifest.json (报告元数据)
 *   - qa_result.json (质量检查结果)
 */

import type { AnalyzedItem, AnalysisSummary } from './types';
import { v4 as uuid } from 'uuid';

// ---- 报告类型定义 ----

export type ReportType =
  | 'general'
  | 'medical_summary'
  | 'bill_explain'
  | 'claim_check'
  | 'timeline'
  | 'chronic_review'
  | 'clinic_client_summary';

export interface ReportManifest {
  reportId: string;
  reportType: ReportType;
  petName: string;
  title: string;
  generatedAt: string;
  sourceRecordId?: string;
  materialCount: number;
  routingReason: string;
}

export interface QaResult {
  passed: boolean;
  checks: QaCheck[];
  warnings: string[];
}

export interface QaCheck {
  rule: string;
  passed: boolean;
  detail: string;
}

export interface ReportResult {
  reportId: string;
  reportType: ReportType;
  markdown: string;
  manifest: ReportManifest;
  qaResult: QaResult;
  title: string;
}

// ---- 报告标题映射 ----

const REPORT_TITLES: Record<ReportType, string> = {
  general: '宠物资料综合整理报告',
  medical_summary: '兽医报告简明解读',
  bill_explain: '宠物医疗账单解释报告',
  claim_check: '宠物保险理赔材料检查报告',
  timeline: '跨院就诊资料包',
  chronic_review: '慢病月度复盘报告',
  clinic_client_summary: '医院端客户解释材料草稿',
};

// ---- 禁止出现在报告中的术语 ----

const FORBIDDEN_TERMS = [
  'PRD',
  'Harness',
  'HMW',
  'POV',
  '产品需求文档',
  '设计提案约束',
  '开发者校验',
];

// ---- 必须包含的免责声明 ----

const MEDICAL_DISCLAIMER = '> ⚠️ **医疗免责声明**：本报告旨在整理和解释医疗资料，不替代兽医诊断。如有健康疑虑，请咨询执业兽医。';

const INSURANCE_DISCLAIMER = '> ⚠️ **理赔说明**：本报告检查理赔材料完整性并提示风险点，不承诺理赔结果。实际赔付以保险公司审核为准。';

const CLINIC_DRAFT_DISCLAIMER = '> ⚠️ **草稿声明**：本文为 AI 生成的客户解释材料草稿，须经执业兽医审核确认后方可作为正式沟通材料使用。';

// ---- 报告类型自动选择 ----

interface RoutingRule {
  keywords: string[];
  materialKeywords: string[];
  reportType: ReportType;
}

const ROUTING_RULES: RoutingRule[] = [
  {
    keywords: ['账单', '费用', '发票', '收据', '收费', 'bill', 'invoice', 'receipt', 'expense'],
    materialKeywords: ['bill', 'invoice'],
    reportType: 'bill_explain',
  },
  {
    keywords: ['理赔', '报销', '保险', '保单', 'claim', 'insurance', 'reimbursement'],
    materialKeywords: ['insurance_policy', 'claim_document'],
    reportType: 'claim_check',
  },
  {
    keywords: ['转院', '转诊', '就诊记录', '病历汇总', '资料包', 'timeline', 'referral'],
    materialKeywords: [],
    reportType: 'timeline',
  },
  {
    keywords: ['慢病', '慢性', '月度', '复查', '长期', 'chronic'],
    materialKeywords: [],
    reportType: 'chronic_review',
  },
  {
    keywords: ['检查报告', '化验', '血常规', '生化', '超声', 'lab report', 'medical report'],
    materialKeywords: ['lab_report', 'medical_report'],
    reportType: 'medical_summary',
  },
];

/**
 * 根据用户请求文本和材料类型自动选择报告类型
 */
export function selectReportType(
  requestText?: string,
  materialTypes?: string[]
): { reportType: ReportType; reason: string } {
  const reqLower = (requestText || '').toLowerCase();
  const matTypes = materialTypes || [];

  for (const rule of ROUTING_RULES) {
    const keywordMatch = rule.keywords.some(kw => reqLower.includes(kw.toLowerCase()));
    const matMatch = rule.materialKeywords.length === 0 ||
      rule.materialKeywords.some(mt => matTypes.includes(mt));

    if (keywordMatch && matMatch) {
      return {
        reportType: rule.reportType,
        reason: `关键词匹配: "${rule.keywords.find(kw => reqLower.includes(kw.toLowerCase())) || rule.materialKeywords[0]}"`,
      };
    }
  }

  // 有材料但未匹配特定类型 → general
  if (matTypes.length > 0) {
    return { reportType: 'general', reason: '多种材料混合，使用综合报告' };
  }

  return { reportType: 'general', reason: '默认通用报告' };
}

// ---- 核心报告生成 ----

export interface ReportInput {
  /** 宠物名称 */
  petName?: string;
  /** 就诊日期 */
  visitDate?: string;
  /** 医院名称 */
  hospitalName?: string;
  /** 就诊原因 */
  visitReason?: string;
  /** 诊断结果 */
  diagnosis?: string;
  /** 城市 */
  city?: string;
  /** 分析后的逐项结果 */
  items?: AnalyzedItem[];
  /** 分析摘要 */
  summary?: AnalysisSummary;
  /** 总费用 */
  totalAmount?: number;
  /** 报告类型（默认 auto） */
  reportType?: ReportType | 'auto';
  /** 用户原始请求 */
  requestText?: string;
  /** 保险预检结果 */
  insuranceResult?: Record<string, unknown>;
  /** OCR 原始文本（作为材料参考） */
  rawOcrText?: string;
  /** 就诊记录 ID */
  recordId?: string;
}

/**
 * 创建报告清单
 */
export function createManifest(
  reportId: string,
  reportType: ReportType,
  petName: string,
  routingReason: string,
  materialCount: number,
  sourceRecordId?: string
): ReportManifest {
  return {
    reportId,
    reportType,
    petName: petName || '待确认',
    title: REPORT_TITLES[reportType],
    generatedAt: new Date().toISOString(),
    sourceRecordId,
    materialCount,
    routingReason,
  };
}

/**
 * 执行质量检查
 */
export function runQaChecks(
  markdown: string,
  reportType: ReportType,
  items?: AnalyzedItem[]
): QaResult {
  const checks: QaCheck[] = [];
  const warnings: string[] = [];

  // 1. 检查禁止术语
  const foundForbidden: string[] = [];
  for (const term of FORBIDDEN_TERMS) {
    if (markdown.includes(term)) {
      foundForbidden.push(term);
    }
  }
  checks.push({
    rule: '禁止术语检查',
    passed: foundForbidden.length === 0,
    detail: foundForbidden.length === 0
      ? '未发现内部开发术语'
      : `发现禁止术语: ${foundForbidden.join(', ')}`,
  });

  // 2. 检查必要章节
  const requiredSections = ['使用材料', '事实', '整理结果', '待确认', '后续建议'];
  for (const section of requiredSections) {
    const hasSection = markdown.includes(`## ${section}`);
    checks.push({
      rule: `必要章节: ${section}`,
      passed: hasSection,
      detail: hasSection ? '已包含' : '缺失',
    });
    if (!hasSection) warnings.push(`缺少必要章节: ${section}`);
  }

  // 3. 医疗免责声明（非 B 端报告需要）
  if (reportType !== 'clinic_client_summary') {
    const hasMedicalDisclaimer = markdown.includes('医疗免责声明');
    checks.push({
      rule: '医疗免责声明',
      passed: hasMedicalDisclaimer,
      detail: hasMedicalDisclaimer ? '已包含' : '缺失',
    });
    if (!hasMedicalDisclaimer) warnings.push('缺少医疗免责声明');
  }

  // 4. 理赔报告需要理赔免责声明
  if (reportType === 'claim_check') {
    const hasInsuranceDisclaimer = markdown.includes('理赔说明');
    checks.push({
      rule: '理赔免责声明',
      passed: hasInsuranceDisclaimer,
      detail: hasInsuranceDisclaimer ? '已包含' : '缺失',
    });
    if (!hasInsuranceDisclaimer) warnings.push('缺少理赔免责声明');
  }

  // 5. B 端草稿需要人工审核声明
  if (reportType === 'clinic_client_summary') {
    const hasDraftDisclaimer = markdown.includes('草稿声明');
    checks.push({
      rule: 'B 端草稿声明',
      passed: hasDraftDisclaimer,
      detail: hasDraftDisclaimer ? '已包含' : '缺失',
    });
    if (!hasDraftDisclaimer) warnings.push('缺少 B 端草稿声明');
  }

  // 6. 检查是否有未确认字段
  const uncertainCount = (markdown.match(/待确认/g) || []).length;
  checks.push({
    rule: '不确定项标注',
    passed: true,
    detail: uncertainCount > 0
      ? `已标注 ${uncertainCount} 处不确定项`
      : '未发现需要标注的不确定项',
  });

  // 7. 来源材料检查
  if (items && items.length > 0) {
    const withSource = items.filter(i => !i.isUnknown).length;
    checks.push({
      rule: '来源材料可追溯',
      passed: withSource > 0,
      detail: `${withSource}/${items.length} 项可追溯到知识库`,
    });
  }

  const passed = checks.filter(c => !c.passed).length === 0;

  return { passed, checks, warnings };
}

// ---- Markdown 报告生成 ----

/**
 * 生成完整 Markdown 报告
 */
export function composeReport(input: ReportInput): ReportResult {
  const reportId = uuid();
  const petName = input.petName || '待确认';

  // 自动选择报告类型
  const { reportType, reason } = input.reportType && input.reportType !== 'auto'
    ? { reportType: input.reportType, reason: '用户指定' }
    : selectReportType(input.requestText);

  const title = REPORT_TITLES[reportType];
  const items = input.items || [];
  const dateStr = input.visitDate || new Date().toISOString().split('T')[0];

  // 构建报告
  const sections: string[] = [];

  // 标题
  sections.push(`# ${title}`);
  sections.push('');
  sections.push(`**宠物**: ${petName}  |  **日期**: ${dateStr}  |  **报告类型**: ${title}`);
  if (input.hospitalName) {
    sections.push(`**就诊医院**: ${input.hospitalName}`);
  }
  sections.push('');

  // 1. 使用材料
  sections.push('## 使用材料');
  sections.push('');
  if (items.length > 0) {
    sections.push(`本报告基于以下 ${items.length} 项费用记录进行分析：`);
    sections.push('');
    sections.push('| 序号 | 项目名称 | 金额 | 类别 | 匹配状态 |');
    sections.push('|------|---------|------|------|---------|');
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const status = item.isUnknown ? '⚠️ 未识别' : '✅ 已匹配';
      sections.push(`| ${i + 1} | ${item.rawName} | ¥${item.amount.toFixed(2)} | ${item.category || '其他'} | ${status} |`);
    }
  } else {
    sections.push('本次分析未包含具体的费用项目记录。');
  }
  if (input.rawOcrText) {
    sections.push('');
    sections.push('**OCR 识别原始文本**（供参考）：');
    sections.push('```');
    sections.push(input.rawOcrText.slice(0, 2000));
    sections.push('```');
  }
  sections.push('');

  // 2. 事实
  sections.push('## 事实');
  sections.push('');
  sections.push('以下信息从提供的材料中直接提取：');
  sections.push('');
  sections.push(`- **就诊日期**: ${dateStr}`);
  if (input.hospitalName) {
    sections.push(`- **就诊医院**: ${input.hospitalName}`);
  }
  if (input.city) {
    sections.push(`- **所在城市**: ${input.city}`);
  }
  if (input.visitReason) {
    sections.push(`- **就诊原因**: ${input.visitReason}`);
  }
  if (input.diagnosis) {
    sections.push(`- **诊断结果**: ${input.diagnosis}`);
  }
  if (input.totalAmount != null && input.totalAmount > 0) {
    sections.push(`- **总费用**: ¥${input.totalAmount.toFixed(2)}`);
  }
  sections.push(`- **费用项目数**: ${items.length} 项`);
  sections.push('');

  // 3. 整理结果
  sections.push('## 整理结果');
  sections.push('');

  if (items.length > 0) {
    // 按类别分组汇总
    const categoryGroups = groupByCategory(items);
    sections.push('### 费用类别分布');
    sections.push('');
    sections.push('| 类别 | 项目数 | 合计金额 | 占比 |');
    sections.push('|------|--------|---------|------|');
    const totalAmt = input.totalAmount || items.reduce((s, i) => s + i.amount, 0);
    for (const [cat, catItems] of Object.entries(categoryGroups)) {
      const catTotal = catItems.reduce((s, i) => s + i.amount, 0);
      const pct = totalAmt > 0 ? ((catTotal / totalAmt) * 100).toFixed(1) : '0';
      sections.push(`| ${cat} | ${catItems.length} | ¥${catTotal.toFixed(2)} | ${pct}% |`);
    }
    sections.push('');

    // 逐项解读
    sections.push('### 逐项解读');
    sections.push('');

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      sections.push(`#### ${i + 1}. ${item.rawName} — ¥${item.amount.toFixed(2)}`);
      sections.push('');

      if (item.category) {
        sections.push(`- **类别**: ${item.category}`);
      }
      if (item.necessity) {
        sections.push(`- **必要性**: ${item.necessity}`);
      }
      if (item.priceAssessment) {
        sections.push(`- **价格评估**: ${item.priceAssessment.level}（参考区间 ¥${item.priceAssessment.p10.toFixed(0)}-¥${item.priceAssessment.p90.toFixed(0)}）`);
      }
      if (item.explanation) {
        sections.push(`- **解释**: ${item.explanation}`);
      }
      if (item.isUnknown) {
        sections.push(`- ⚠️ **注意**: 该项目在知识库中未找到匹配，解释基于推断，建议向兽医确认`);
      }
      sections.push('');
    }
  } else {
    sections.push('本次分析没有可整理的费用项目。');
    sections.push('');
  }

  // 根据报告类型添加特定内容
  sections.push(...buildTypeSpecificSection(reportType, input));
  sections.push('');

  // 4. 待确认
  sections.push('## 待确认');
  sections.push('');
  const uncertainItems = items.filter(i => i.isUnknown);
  if (uncertainItems.length > 0) {
    sections.push(`以下 ${uncertainItems.length} 个项目未能从知识库中匹配，建议向兽医确认：`);
    sections.push('');
    for (const item of uncertainItems) {
      sections.push(`- **${item.rawName}** (¥${item.amount.toFixed(2)})：${item.unknownReason || '知识库中未收录'}`);
    }
  } else {
    sections.push('所有费用项目均已在知识库中找到匹配，无待确认项。');
  }
  if (!input.hospitalName) {
    sections.push('- 就诊医院名称未提供');
  }
  if (!input.diagnosis) {
    sections.push('- 诊断结果未提供（如有诊断书或病历，建议补充以获得更完整的分析）');
  }
  sections.push('');

  // 5. 后续建议
  sections.push('## 后续建议');
  sections.push('');
  sections.push(...buildNextActions(reportType, items, input));
  sections.push('');

  // 免责声明
  sections.push('---');
  sections.push('');
  if (reportType === 'clinic_client_summary') {
    sections.push(CLINIC_DRAFT_DISCLAIMER);
  } else {
    sections.push(MEDICAL_DISCLAIMER);
  }
  if (reportType === 'claim_check' && input.insuranceResult) {
    sections.push('');
    sections.push(INSURANCE_DISCLAIMER);
  }
  sections.push('');

  const markdown = sections.join('\n');

  // 生成 manifest
  const manifest = createManifest(
    reportId,
    reportType,
    petName,
    reason,
    items.length,
    input.recordId
  );

  // 质量检查
  const qaResult = runQaChecks(markdown, reportType, items);

  return {
    reportId,
    reportType,
    markdown,
    manifest,
    qaResult,
    title,
  };
}

/** 按类别分组 */
function groupByCategory(items: AnalyzedItem[]): Record<string, AnalyzedItem[]> {
  const groups: Record<string, AnalyzedItem[]> = {};
  for (const item of items) {
    const cat = item.category || '其他';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return groups;
}

/** 构建报告类型特定内容 */
function buildTypeSpecificSection(
  reportType: ReportType,
  input: ReportInput
): string[] {
  const lines: string[] = [];
  const items = input.items || [];

  switch (reportType) {
    case 'bill_explain': {
      lines.push('### 费用合理性分析');
      lines.push('');
      if (input.summary) {
        lines.push(input.summary.overallAssessment);
        lines.push('');
      }
      const highPriceItems = items.filter(
        i => i.priceAssessment?.level === '偏高' || i.priceAssessment?.level === '略高'
      );
      if (highPriceItems.length > 0) {
        lines.push('**价格偏高的项目**：');
        for (const item of highPriceItems) {
          lines.push(`- **${item.rawName}** (¥${item.amount.toFixed(2)})：${item.priceAssessment?.message || ''}`);
        }
      } else {
        lines.push('所有项目价格均在参考区间内。');
      }
      lines.push('');
      lines.push('> 💡 **提示**：价格评估基于同城市同级别医院的公开数据，不同医院因设备、医生资历、药品品牌等因素存在合理差异。');
      break;
    }

    case 'claim_check': {
      lines.push('### 理赔材料完整性检查');
      lines.push('');
      if (input.insuranceResult) {
        const ir = input.insuranceResult as Record<string, unknown>;
        if (ir.totalCoverable != null) {
          lines.push(`- **可赔付项目合计**: ¥${Number(ir.totalCoverable).toFixed(2)}`);
        }
        if (ir.totalEstimatedPayout != null) {
          lines.push(`- **预计赔付金额**: ¥${Number(ir.totalEstimatedPayout).toFixed(2)}`);
        }
        if (Array.isArray(ir.warnings) && ir.warnings.length > 0) {
          lines.push('');
          lines.push('**风险提示**：');
          for (const w of ir.warnings) {
            lines.push(`- ⚠️ ${w}`);
          }
        }
        if (Array.isArray(ir.missingDocuments) && ir.missingDocuments.length > 0) {
          lines.push('');
          lines.push('**需准备的材料**：');
          for (const doc of ir.missingDocuments) {
            lines.push(`- 📋 ${doc}`);
          }
        }
      }
      lines.push('');
      lines.push('> 💡 **提示**：理赔材料清单为通用建议，具体要求以保险公司最新条款为准。');
      break;
    }

    case 'timeline': {
      lines.push('### 就诊时间线');
      lines.push('');
      lines.push(`| 日期 | 医院 | 原因 | 费用 |`);
      lines.push('|------|------|------|------|');
      lines.push(`| ${input.visitDate || '未知'} | ${input.hospitalName || '未知'} | ${input.visitReason || '就诊'} | ¥${(input.totalAmount || 0).toFixed(2)} |`);
      lines.push('');
      lines.push('> ⚠️ **注意**：当前仅包含本次就诊记录。跨院完整时间线需要导入历史就诊数据。');
      break;
    }

    case 'medical_summary': {
      lines.push('### 关键发现');
      lines.push('');
      if (input.diagnosis) {
        lines.push(`**诊断**: ${input.diagnosis}`);
        lines.push('');
      }
      const matchedItems = items.filter(i => !i.isUnknown);
      if (matchedItems.length > 0) {
        lines.push('**已识别的检查和治疗项目**：');
        for (const item of matchedItems) {
          lines.push(`- ${item.rawName}：${item.explanation || '详见逐项解读'}`);
        }
      }
      lines.push('');
      lines.push('### 就诊问题建议');
      lines.push('');
      lines.push('建议在复诊时向兽医确认以下问题：');
      lines.push('');
      const unknownItems = items.filter(i => i.isUnknown);
      if (unknownItems.length > 0) {
        for (const item of unknownItems) {
          lines.push(`- "${item.rawName}" 的具体临床必要性是什么？`);
        }
      }
      if (!input.diagnosis) {
        lines.push('- 本次就诊的明确诊断是什么？');
      }
      lines.push('- 后续是否需要复查？复查时间建议？');
      break;
    }

    case 'chronic_review': {
      lines.push('### 本月概况');
      lines.push('');
      lines.push(`- **就诊次数**: 1 次（本次）`);
      if (input.totalAmount) {
        lines.push(`- **本月费用**: ¥${input.totalAmount.toFixed(2)}`);
      }
      lines.push('');
      lines.push('### 用药与治疗记录');
      lines.push('');
      const medItems = items.filter(i =>
        i.category === '药品' || i.rawName.includes('药')
      );
      if (medItems.length > 0) {
        for (const item of medItems) {
          lines.push(`- ${item.rawName} (¥${item.amount.toFixed(2)})`);
        }
      } else {
        lines.push('本次未识别到明确的药品项目。');
      }
      lines.push('');
      lines.push('### 下月行动建议');
      lines.push('');
      lines.push('- 记录每日用药情况和宠物状态变化');
      lines.push('- 如发现异常症状，及时预约复诊');
      lines.push('- 整理本月所有就诊票据，便于下月复盘');
      break;
    }

    case 'clinic_client_summary': {
      lines.push('### 报告摘要');
      lines.push('');
      if (input.diagnosis) {
        lines.push(`本次就诊诊断为 **${input.diagnosis}**。`);
      }
      lines.push('');
      lines.push('### 关键发现');
      lines.push('');
      lines.push('（需由兽医填写具体临床发现）');
      lines.push('');
      lines.push('### 费用说明');
      lines.push('');
      lines.push(`本次就诊总费用 ¥${(input.totalAmount || 0).toFixed(2)}，包含 ${items.length} 个项目。`);
      lines.push('');
      lines.push('### 复查提醒');
      lines.push('');
      lines.push('（需由兽医填写复查建议）');
      break;
    }

    case 'general':
    default: {
      if (input.summary) {
        lines.push('### 综合评估');
        lines.push('');
        lines.push(input.summary.overallAssessment);
        lines.push('');
      }
      break;
    }
  }

  return lines;
}

/** 构建后续建议 */
function buildNextActions(
  reportType: ReportType,
  items: AnalyzedItem[],
  input: ReportInput
): string[] {
  const lines: string[] = [];

  switch (reportType) {
    case 'bill_explain': {
      lines.push('1. **核实未识别项目**：对标注为"未识别"的项目，建议向兽医确认其临床必要性');
      lines.push('2. **保留票据**：妥善保管原始发票和费用清单，以备保险理赔使用');
      lines.push('3. **价格对比**：如有疑虑，可查询同城同级别医院的公开价格作为参考');
      break;
    }
    case 'claim_check': {
      lines.push('1. **补齐材料**：根据上方清单准备完整的理赔材料');
      lines.push('2. **注意时效**：确认保单有效期内提交理赔申请');
      lines.push('3. **保留原件**：所有材料需提供原件或加盖医院公章的复印件');
      break;
    }
    case 'timeline': {
      lines.push('1. **补充历史记录**：导入此前在其他医院的就诊记录，完善时间线');
      lines.push('2. **整理资料包**：将检查报告、处方、账单按时间顺序排列');
      lines.push('3. **标注关键节点**：标注手术、疫苗接种、慢性病确诊等重要事件');
      break;
    }
    case 'medical_summary': {
      lines.push('1. **记录观察**：记录宠物的饮食、排泄、精神状态变化');
      lines.push('2. **按时复查**：遵医嘱按时复查，不要自行调整或停药');
      lines.push('3. **准备问题**：复诊前列出想问兽医的问题清单');
      break;
    }
    case 'chronic_review': {
      lines.push('1. **用药日志**：记录每日用药时间、剂量和宠物反应');
      lines.push('2. **定期监测**：按医嘱进行血常规、生化等定期检查');
      lines.push('3. **饮食管理**：严格遵守处方粮或特殊饮食要求');
      lines.push('4. **应急准备**：了解最近的24小时急诊医院位置');
      break;
    }
    case 'clinic_client_summary': {
      lines.push('1. **兽医审核**：本文须经执业兽医审核确认后方可使用');
      lines.push('2. **补充信息**：根据实际临床情况补充关键发现和复查建议');
      lines.push('3. **客户沟通**：以本文为基础与客户沟通，注意使用通俗语言');
      break;
    }
    case 'general':
    default: {
      lines.push('1. **完善信息**：补充宠物档案、诊断结果等信息可提高分析精准度');
      lines.push('2. **定期归档**：建议每次就诊后及时上传资料并生成报告归档');
      lines.push('3. **保险规划**：如有宠物保险，可进行理赔预检了解赔付可能性');
      break;
    }
  }

  return lines;
}
