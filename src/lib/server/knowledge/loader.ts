/**
 * 知识库加载器 —— 从 JSON 文件加载种子数据到 SQLite
 */
import fs from 'fs';
import path from 'path';
import { insertTerms, countTerms } from '../db/terms';
import { insertPrices } from '../db/prices';
import { getDb } from '../db/index';

const DATA_DIR = path.join(process.cwd(), 'data');

/** 加载所有知识库数据到 SQLite */
export function loadAllKnowledge(force = false): { terms: number; prices: number; drugs: number; breeds: number } {
  const results = {
    terms: 0,
    prices: 0,
    drugs: 0,
    breeds: 0
  };

  // 如果已有数据且非强制重载，跳过导入
  if (!force) {
    const existingTerms = countTerms();
    if (existingTerms > 0) {
      return { ...results, terms: existingTerms };
    }
  }

  // 加载术语库
  const termsPath = path.join(DATA_DIR, 'terms.json');
  if (fs.existsSync(termsPath)) {
    const terms = JSON.parse(fs.readFileSync(termsPath, 'utf-8'));
    results.terms = insertTerms(terms);
  }

  // 加载价格库
  const pricesPath = path.join(DATA_DIR, 'prices.json');
  if (fs.existsSync(pricesPath)) {
    const prices = JSON.parse(fs.readFileSync(pricesPath, 'utf-8'));
    results.prices = insertPrices(prices);
  }

  // 加载药品库
  const drugsPath = path.join(DATA_DIR, 'drugs.json');
  if (fs.existsSync(drugsPath)) {
    const drugs: Array<Record<string, unknown>> = JSON.parse(fs.readFileSync(drugsPath, 'utf-8'));
    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO kb_drugs (id, term_id, generic_name, brand_names, indications, common_dosage, hospital_price_min, hospital_price_max, online_price_min, online_price_max, prescription_only, notes)
      VALUES (@id, @term_id, @generic_name, @brand_names, @indications, @common_dosage, @hospital_price_min, @hospital_price_max, @online_price_min, @online_price_max, @prescription_only, @notes)
    `);
    for (const drug of drugs) {
      stmt.run(drug);
      results.drugs++;
    }
  }

  // 加载品种疾病库
  const breedsPath = path.join(DATA_DIR, 'breeds.json');
  if (fs.existsSync(breedsPath)) {
    const breeds = JSON.parse(fs.readFileSync(breedsPath, 'utf-8'));
    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO kb_breed_diseases (id, species, breed, disease, risk_level, screening, screening_cost_range)
      VALUES (@id, @species, @breed, @disease, @risk_level, @screening, @screening_cost_range)
    `);
    for (const breed of breeds) {
      stmt.run(breed);
      results.breeds++;
    }
  }

  return results;
}

/** 加载种子医院数据 */
export function loadSeedHospitals(): number {
  const hospitalsPath = path.join(DATA_DIR, 'hospitals.json');
  if (!fs.existsSync(hospitalsPath)) return 0;

  const hospitals = JSON.parse(fs.readFileSync(hospitalsPath, 'utf-8'));
  const db = getDb();

  const existing = db.prepare('SELECT COUNT(*) as cnt FROM hospitals').get() as { cnt: number };
  if (existing.cnt > 0) return existing.cnt;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO hospitals (id, name, city, district, address, phone, type, transparency_score, rating, price_level, lat, lng, source)
    VALUES (@id, @name, @city, @district, @address, @phone, @type, @transparency_score, @rating, @price_level, @lat, @lng, @source)
  `);

  let count = 0;
  for (const h of hospitals) {
    stmt.run(h);
    count++;
  }
  return count;
}
