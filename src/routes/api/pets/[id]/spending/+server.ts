import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db/index';
import type { SpendingStats, MonthlyTrend, CategoryBreakdown, InsuranceNetSpending } from '$lib/server/engine/types';

export const GET: RequestHandler = async ({ params, url }) => {
  const petId = params.id;
  const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()), 10);

  const db = getDb();

  // 验证宠物存在
  const pet = db.prepare('SELECT id, name FROM pets WHERE id = ?').get(petId) as any;
  if (!pet) return json({ error: '宠物不存在' }, { status: 404 });

  // ── 年度总花费 + 就诊次数 ──
  const annualRow = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) AS annual_total,
           COUNT(*) AS visit_count
    FROM records
    WHERE pet_id = ? AND cast(strftime('%Y', visit_date) AS integer) = ?
  `).get(petId, year) as { annual_total: number; visit_count: number };

  const annualTotal = annualRow.annual_total;
  const visitCount = annualRow.visit_count;

  // ── 月度趋势 ──
  const monthlyRows = db.prepare(`
    SELECT cast(strftime('%m', visit_date) AS integer) AS month,
           SUM(total_amount) AS total,
           COUNT(*) AS count
    FROM records
    WHERE pet_id = ? AND cast(strftime('%Y', visit_date) AS integer) = ?
    GROUP BY month ORDER BY month
  `).all(petId, year) as Array<{ month: number; total: number; count: number }>;

  // 补齐缺失月份
  const monthlyTrend: MonthlyTrend[] = [];
  for (let m = 1; m <= 12; m++) {
    const found = monthlyRows.find(r => r.month === m);
    monthlyTrend.push({ month: m, total: found?.total || 0, count: found?.count || 0 });
  }

  // ── 费用类别占比 ──
  const catRows = db.prepare(`
    SELECT COALESCE(li.category, '其他') AS category,
           SUM(li.amount) AS total,
           COUNT(*) AS count
    FROM line_items li
    JOIN records r ON li.record_id = r.id
    WHERE r.pet_id = ? AND cast(strftime('%Y', r.visit_date) AS integer) = ?
    GROUP BY li.category
    ORDER BY total DESC
  `).all(petId, year) as Array<{ category: string; total: number; count: number }>;

  const categoryBreakdown: CategoryBreakdown[] = catRows.map(r => ({
    category: r.category,
    total: r.total,
    count: r.count,
    pct: annualTotal > 0 ? Math.round((r.total / annualTotal) * 100) : 0,
  }));

  // ── 保险净支出 ──
  let insurance: InsuranceNetSpending | null = null;

  const policy = db.prepare(`
    SELECT * FROM insurance_policies
    WHERE pet_id = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `).get(petId) as any;

  if (policy) {
    const deductible = policy.deductible || 0;
    const reimbursementRate = policy.reimbursement_rate || 0.6;
    const annualLimit = policy.annual_limit || 15000;
    const deductibleMet = annualTotal >= deductible;
    const estimatedPayout = deductibleMet
      ? Math.min((annualTotal - deductible) * reimbursementRate, annualLimit)
      : 0;
    const netOutOfPocket = annualTotal - estimatedPayout;

    insurance = {
      hasPolicy: true,
      policyId: policy.id,
      company: policy.company,
      productName: policy.product_name,
      annualLimit,
      deductible,
      reimbursementRate,
      totalSpent: annualTotal,
      estimatedPayout: Math.round(estimatedPayout * 100) / 100,
      netOutOfPocket: Math.round(netOutOfPocket * 100) / 100,
      limitUsedPct: annualLimit > 0 ? Math.round((estimatedPayout / annualLimit) * 100) : 0,
      deductibleMet,
    };
  }

  const result: SpendingStats = {
    petId: pet.id,
    petName: pet.name,
    year,
    annualTotal,
    visitCount,
    avgPerVisit: visitCount > 0 ? Math.round((annualTotal / visitCount) * 100) / 100 : 0,
    monthlyTrend,
    categoryBreakdown,
    insurance,
  };

  return json(result);
};
