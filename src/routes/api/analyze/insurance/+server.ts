import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkInsurance, buildPolicyFromData } from '$lib/server/engine/insurance';
import { getPolicyById } from '$lib/server/db/insurance';
import type { AnalyzedItem } from '$lib/server/engine/types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { policyId, items, visitDate } = body;

    if (!policyId || !items || !items.length) {
      return json({ error: '请提供保单ID和费用项目列表' }, { status: 400 });
    }

    // 获取保单
    const policyRow = getPolicyById(policyId);
    if (!policyRow) {
      return json({ error: '保单不存在' }, { status: 404 });
    }

    // 构建 Policy 对象
    const policy = buildPolicyFromData({
      id: policyRow.id,
      company: policyRow.company,
      productName: policyRow.product_name,
      policyNumber: policyRow.policy_number || undefined,
      effectiveDate: policyRow.effective_date || undefined,
      expiryDate: policyRow.expiry_date || undefined,
      waitingPeriod: policyRow.waiting_period || undefined,
      deductible: policyRow.deductible || undefined,
      reimbursementRate: policyRow.reimbursement_rate || undefined,
      annualLimit: policyRow.annual_limit || undefined,
      structuredTerms: policyRow.structured_terms || undefined
    });

    // 转换为 AnalyzedItem 类型
    const analyzedItems = items.map((it: { rawName: string; amount: number; category?: string }) => ({
      rawName: it.rawName,
      amount: it.amount,
      category: it.category || '其他',
      termMatch: null,
      priceAssessment: null,
      necessity: '未知',
      explanation: '',
      isUnknown: false
    } as AnalyzedItem));

    // 执行保险预检
    const result = checkInsurance(policy, analyzedItems, visitDate || new Date().toISOString().split('T')[0]);

    return json(result);
  } catch (err) {
    return json({
      error: `保险预检失败: ${err instanceof Error ? err.message : '未知错误'}`
    }, { status: 500 });
  }
};
