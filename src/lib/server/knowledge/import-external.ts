/**
 * 外部知识库导入器
 *
 * 从父级目录的 data/ 和 assets/ 读取知识库数据并导入 SQLite
 * 来源: term_seed_120_unreviewed.jsonl (120条术语)
 *       insurance_policy_seed.json (5款保险)
 *       breed_genetic_risk_seed_unreviewed.json (品种遗传风险)
 */
import fs from 'fs';
import path from 'path';
import { getDb } from '../db/index';

const EXTERNAL_DIR = path.join(process.cwd(), '..');

/** 导入 120 条术语种子数据 */
export function importTermSeeds(): number {
  const filePath = path.join(EXTERNAL_DIR, 'data', 'term_seed_120_unreviewed.jsonl');
  if (!fs.existsSync(filePath)) {
    console.warn(`[Import] 术语种子文件不存在: ${filePath}`);
    return 0;
  }

  const db = getDb();
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO kb_terms (id, name, aliases, category, medical_explain, plain_explain, necessity_hint, source, reviewed_by)
    VALUES (@id, @name, @aliases, @category, @medical_explain, @plain_explain, @necessity_hint, @source, @reviewed_by)
  `);

  let count = 0;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const termName = entry.term || '';
      if (!termName) continue;

      // 生成唯一 ID
      const id = `seed-${termName.replace(/[^\w一-鿿]/g, '-')}`;

      const aliases = (entry.common_bill_alias || []);
      const aliasStr = aliases.length > 0 ? JSON.stringify(aliases) : null;

      stmt.run({
        id,
        name: termName,
        aliases: aliasStr,
        category: entry.category || '其他',
        medical_explain: entry.medical_explanation || null,
        plain_explain: entry.plain_explanation || null,
        necessity_hint: entry.necessity_label || '待审核',
        source: 'seed_unreviewed',
        reviewed_by: null
      });
      count++;
    } catch (e) {
      console.warn(`[Import] 跳过无效行: ${(e as Error).message}`);
    }
  }

  // 同步 FTS5 索引
  rebuildFtsFromTable();
  console.log(`[Import] 术语种子导入完成: ${count} 条`);
  return count;
}

/** 导入保险产品种子数据 */
export function importInsuranceSeeds(): number {
  const filePath = path.join(EXTERNAL_DIR, 'data', 'insurance_policy_seed.json');
  if (!fs.existsSync(filePath)) return 0;

  const db = getDb();
  const policies = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO insurance_policies (id, pet_id, company, product_name, policy_number, effective_date, expiry_date,
      waiting_period, deductible, reimbursement_rate, annual_limit, raw_terms_text, structured_terms, status)
    VALUES (@id, NULL, @company, @product_name, NULL, NULL, NULL, @waiting_period, @deductible, @reimbursement_rate, @annual_limit, @raw_terms_text, @structured_terms, 'active')
  `);

  let count = 0;
  for (const p of policies) {
    const structured = JSON.stringify(p);
    const id = `kb-ins-${count}`;

    // 尝试从数据中解析关键字段
    let waitingPeriod = 30;
    let reimbursementRate = 0.6;
    let deductible = 200;
    let annualLimit = 5000;

    if (p.waiting_period) {
      const match = String(p.waiting_period).match(/(\d+)/);
      if (match) waitingPeriod = parseInt(match[1]);
    }
    if (p.reimbursement_ratio) {
      const match = String(p.reimbursement_ratio).match(/(\d+)/);
      if (match) reimbursementRate = parseInt(match[1]) / 100;
    }
    if (p.deductible) {
      const match = String(p.deductible).match(/(\d+)/);
      if (match) deductible = parseInt(match[1]);
    }
    if (p.limits) {
      const match = String(p.limits).match(/(\d+)/);
      if (match) annualLimit = parseInt(match[1]) * 6; // 粗略估算
    }

    stmt.run({
      id,
      company: p.insurer || '未知',
      product_name: p.product_or_clause || p.filing_name || '未知产品',
      waiting_period: waitingPeriod,
      deductible,
      reimbursement_rate: reimbursementRate,
      annual_limit: annualLimit,
      raw_terms_text: JSON.stringify(p, null, 2),
      structured_terms: structured
    });
    count++;
  }

  console.log(`[Import] 保险产品导入完成: ${count} 款`);
  return count;
}

/** 导入品种遗传风险数据 */
export function importBreedRisks(): number {
  const filePath = path.join(EXTERNAL_DIR, 'data', 'breed_genetic_risk_seed_unreviewed.json');
  if (!fs.existsSync(filePath)) return 0;

  const db = getDb();
  const breeds = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO kb_breed_diseases (id, species, breed, disease, risk_level, screening, screening_cost_range)
    VALUES (@id, @species, @breed, @disease, @risk_level, @screening, @screening_cost_range)
  `);

  let count = 0;
  for (const b of breeds) {
    const breed = b.cn_breed || '';
    if (!breed) continue;

    const associations = b.possible_associations || [];
    for (const assoc of associations) {
      const riskLevel = assoc.includes('风险') ? '中' : '待核验';
      stmt.run({
        id: `breed-${breed}-${count}`,
        species: '猫',
        breed,
        disease: assoc,
        risk_level: riskLevel,
        screening: null,
        screening_cost_range: null
      });
      count++;
    }
  }

  console.log(`[Import] 品种遗传风险导入完成: ${count} 条关联`);
  return count;
}

/** 从 kb_terms 表重建 FTS5 索引 */
function rebuildFtsFromTable() {
  const db = getDb();
  const rows = db.prepare('SELECT rowid, name, aliases, plain_explain FROM kb_terms').all() as Array<{
    rowid: number; name: string; aliases: string | null; plain_explain: string | null;
  }>;

  // 清空并重建
  db.prepare('DELETE FROM kb_terms_fts').run();
  const insert = db.prepare(
    'INSERT INTO kb_terms_fts (rowid, name, aliases, plain_explain) VALUES (?, ?, ?, ?)'
  );
  for (const r of rows) {
    insert.run(r.rowid, r.name, r.aliases || '', r.plain_explain || '');
  }
  console.log(`[Import] FTS5 索引重建完成: ${rows.length} 条`);
}

/** 一次性导入所有外部知识库 */
export function importAllExternal(): {
  terms: number; insurance: number; breeds: number;
} {
  return {
    terms: importTermSeeds(),
    insurance: importInsuranceSeeds(),
    breeds: importBreedRisks()
  };
}
