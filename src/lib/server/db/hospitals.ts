import { v4 as uuid } from 'uuid';
import { getDb } from './index';

export interface HospitalRow {
  id: string;
  name: string;
  city: string;
  district: string | null;
  address: string | null;
  phone: string | null;
  type: string | null;
  transparency_score: number | null;
  rating: number | null;
  price_level: string | null;
  lat: number | null;
  lng: number | null;
  source: string;
}

/** 获取推荐医院列表 */
export function getRecommendedHospitals(options: {
  city?: string;
  petType?: '猫' | '狗';
  limit?: number;
} = {}): HospitalRow[] {
  const db = getDb();
  const { city, limit = 10 } = options;

  if (city) {
    return db.prepare(`
      SELECT * FROM hospitals
      WHERE city = ?
      ORDER BY transparency_score DESC, rating DESC
      LIMIT ?
    `).all(city, limit) as HospitalRow[];
  }

  return db.prepare(`
    SELECT * FROM hospitals
    ORDER BY transparency_score DESC, rating DESC
    LIMIT ?
  `).all(limit) as HospitalRow[];
}

/** 批量插入医院数据 */
export function insertHospitals(hospitals: Omit<HospitalRow, 'created_at'>[]): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO hospitals (id, name, city, district, address, phone, type, transparency_score, rating, price_level, lat, lng, source)
    VALUES (@id, @name, @city, @district, @address, @phone, @type, @transparency_score, @rating, @price_level, @lat, @lng, @source)
  `);

  const insertMany = db.transaction((rows: typeof hospitals) => {
    let count = 0;
    for (const row of rows) {
      stmt.run(row);
      count++;
    }
    return count;
  });

  return insertMany(hospitals);
}

/** 按城市搜索医院 */
export function searchHospitalsByName(name: string, city?: string): HospitalRow[] {
  const db = getDb();
  if (city) {
    return db.prepare(
      `SELECT * FROM hospitals WHERE name LIKE ? AND city = ? ORDER BY rating DESC LIMIT 10`
    ).all(`%${name}%`, city) as HospitalRow[];
  }
  return db.prepare(
    `SELECT * FROM hospitals WHERE name LIKE ? ORDER BY rating DESC LIMIT 10`
  ).all(`%${name}%`) as HospitalRow[];
}
