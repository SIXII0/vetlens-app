import { v4 as uuid } from 'uuid';
import { getDb } from './index';

export interface PriceRow {
  id: string;
  term_id: string;
  city: string;
  hospital_type: string | null;
  p10: number;
  p50: number;
  p90: number;
  sample_count: number;
  source: string;
  updated_at: string;
}

/** 查询指定术语在某城市的价格区间 */
export function getPriceRange(termId: string, city: string, hospitalType?: string): PriceRow | undefined {
  const db = getDb();

  // 先精确匹配城市+医院类型
  if (hospitalType) {
    const row = db.prepare(
      'SELECT * FROM kb_prices WHERE term_id = ? AND city = ? AND hospital_type = ?'
    ).get(termId, city, hospitalType) as PriceRow | undefined;
    if (row) return row;
  }

  // 仅匹配城市
  const row = db.prepare(
    'SELECT * FROM kb_prices WHERE term_id = ? AND city = ?'
  ).get(termId, city) as PriceRow | undefined;
  if (row) return row;

  // fallback: 一线城市平均
  return db.prepare(
    `SELECT * FROM kb_prices WHERE term_id = ? AND city IN ('北京','上海','广州','深圳') LIMIT 1`
  ).get(termId) as PriceRow | undefined;
}

/** 批量插入价格数据 */
export function insertPrices(prices: Omit<PriceRow, 'created_at' | 'updated_at'>[]): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO kb_prices (id, term_id, city, hospital_type, p10, p50, p90, sample_count, source, updated_at)
    VALUES (@id, @term_id, @city, @hospital_type, @p10, @p50, @p90, @sample_count, @source, datetime('now'))
  `);

  const insertMany = db.transaction((rows: typeof prices) => {
    let count = 0;
    for (const row of rows) {
      stmt.run(row);
      count++;
    }
    return count;
  });

  return insertMany(prices);
}

/** 获取所有有价格数据的城市 */
export function getCitiesWithPrices(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT city FROM kb_prices ORDER BY city').all() as { city: string }[];
  return rows.map(r => r.city);
}
