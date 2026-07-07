import { v4 as uuid } from 'uuid';
import { getDb } from './index';

export interface RecordRow {
  id: string;
  pet_id: string | null;
  hospital_name: string | null;
  hospital_city: string | null;
  visit_date: string;
  visit_reason: string | null;
  diagnosis: string | null;
  total_amount: number;
  image_paths: string | null;
  raw_ocr_text: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface LineItemRow {
  id: string;
  record_id: string;
  item_order: number;
  raw_name: string;
  category: string | null;
  amount: number;
  matched_term: string | null;
  confidence: number | null;
  explanation: string | null;
  necessity: string | null;
  price_level: string | null;
  is_unknown: number;
}

/** 创建就诊记录 */
export function createRecord(data: {
  petId?: string;
  hospitalName?: string;
  hospitalCity?: string;
  visitDate: string;
  visitReason?: string;
  diagnosis?: string;
  totalAmount: number;
  imagePaths?: string[];
  rawOcrText?: string;
}): RecordRow {
  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO records (id, pet_id, hospital_name, hospital_city, visit_date, visit_reason, diagnosis, total_amount, image_paths, raw_ocr_text, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'analyzed')
  `).run(
    id,
    data.petId || null,
    data.hospitalName || null,
    data.hospitalCity || null,
    data.visitDate,
    data.visitReason || null,
    data.diagnosis || null,
    data.totalAmount,
    data.imagePaths ? JSON.stringify(data.imagePaths) : null,
    data.rawOcrText || null
  );

  return db.prepare('SELECT * FROM records WHERE id = ?').get(id) as RecordRow;
}

/** 批量插入费用明细 */
export function insertLineItems(items: Omit<LineItemRow, 'created_at'>[]): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO line_items (id, record_id, item_order, raw_name, category, amount, matched_term, confidence, explanation, necessity, price_level, is_unknown)
    VALUES (@id, @record_id, @item_order, @raw_name, @category, @amount, @matched_term, @confidence, @explanation, @necessity, @price_level, @is_unknown)
  `);

  const insertMany = db.transaction((rows: typeof items) => {
    let count = 0;
    for (const row of rows) {
      stmt.run({ ...row, id: row.id || uuid() });
      count++;
    }
    return count;
  });

  return insertMany(items);
}

/** 获取就诊记录列表 */
export function getRecords(options: {
  petId?: string;
  limit?: number;
  offset?: number;
  status?: string;
} = {}): { records: RecordRow[]; total: number } {
  const db = getDb();
  const { petId, limit = 20, offset = 0, status } = options;

  let where = 'WHERE 1=1';
  const params: unknown[] = [];

  if (petId) {
    where += ' AND pet_id = ?';
    params.push(petId);
  }
  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM records ${where}`).get(...params) as { cnt: number }).cnt;
  const records = db.prepare(
    `SELECT * FROM records ${where} ORDER BY visit_date DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as RecordRow[];

  return { records, total };
}

/** 获取单条记录 */
export function getRecordById(id: string): { record: RecordRow; items: LineItemRow[] } | null {
  const db = getDb();
  const record = db.prepare('SELECT * FROM records WHERE id = ?').get(id) as RecordRow | undefined;
  if (!record) return null;

  const items = db.prepare(
    'SELECT * FROM line_items WHERE record_id = ? ORDER BY item_order'
  ).all(id) as LineItemRow[];

  return { record, items };
}

/** 删除记录 */
export function deleteRecord(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM records WHERE id = ?').run(id);
  return result.changes > 0;
}

/** 更新记录状态 */
export function updateRecordStatus(id: string, status: string): void {
  const db = getDb();
  db.prepare('UPDATE records SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(status, id);
}
