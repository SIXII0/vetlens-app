import { v4 as uuid } from 'uuid';
import { getDb } from './index';

export interface PolicyRow {
  id: string;
  pet_id: string | null;
  company: string;
  product_name: string;
  policy_number: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  waiting_period: number | null;
  deductible: number | null;
  reimbursement_rate: number | null;
  annual_limit: number | null;
  raw_terms_text: string | null;
  structured_terms: string | null;
  status: string;
  created_at: string;
}

/** 创建保单 */
export function createPolicy(data: {
  petId?: string;
  company: string;
  productName: string;
  policyNumber?: string;
  effectiveDate?: string;
  expiryDate?: string;
  waitingPeriod?: number;
  deductible?: number;
  reimbursementRate?: number;
  annualLimit?: number;
  rawTermsText?: string;
}): PolicyRow {
  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO insurance_policies (id, pet_id, company, product_name, policy_number, effective_date, expiry_date, waiting_period, deductible, reimbursement_rate, annual_limit, raw_terms_text, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(
    id, data.petId || null, data.company, data.productName,
    data.policyNumber || null, data.effectiveDate || null, data.expiryDate || null,
    data.waitingPeriod || null, data.deductible || null, data.reimbursementRate || null,
    data.annualLimit || null, data.rawTermsText || null
  );

  return db.prepare('SELECT * FROM insurance_policies WHERE id = ?').get(id) as PolicyRow;
}

/** 获取所有保单 */
export function getAllPolicies(petId?: string): PolicyRow[] {
  const db = getDb();
  if (petId) {
    return db.prepare(
      'SELECT * FROM insurance_policies WHERE pet_id = ? ORDER BY created_at DESC'
    ).all(petId) as PolicyRow[];
  }
  return db.prepare(
    'SELECT * FROM insurance_policies ORDER BY created_at DESC'
  ).all() as PolicyRow[];
}

/** 获取单个保单 */
export function getPolicyById(id: string): PolicyRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM insurance_policies WHERE id = ?').get(id) as PolicyRow | undefined;
}

/** 更新保单 */
export function updatePolicyStatus(id: string, status: 'active' | 'expired' | 'cancelled'): void {
  const db = getDb();
  db.prepare('UPDATE insurance_policies SET status = ? WHERE id = ?').run(status, id);
}

/** 删除保单 */
export function deletePolicy(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM insurance_policies WHERE id = ?').run(id);
  return result.changes > 0;
}

/** 获取有保单的宠物ID列表 */
export function getInsuredPetIds(): string[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT DISTINCT pet_id FROM insurance_policies WHERE status = 'active' AND pet_id IS NOT NULL"
  ).all() as { pet_id: string }[];
  return rows.map(r => r.pet_id);
}
