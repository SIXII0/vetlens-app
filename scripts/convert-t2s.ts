/**
 * 繁体中文 → 简体中文 转换脚本
 * 转换 kb_diseases, kb_drugs2, kb_breeds2, kb_symptoms 中的 name_zh, description_zh
 */
import Database from 'better-sqlite3';
import { Converter } from 'opencc-js';

const DB_PATH = 'F:/Pet_Projects/VetLens/data/vetlens.db';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const converter = Converter({ from: 'tw', to: 'cn' });

function t2s(text: string | null): string | null {
  if (!text) return text;
  return converter(text);
}

// ── 1. 疾病 ──
console.log('🩺 转换疾病...');
const diseases = db.prepare('SELECT id, name_zh, description_zh FROM kb_diseases WHERE name_zh IS NOT NULL OR description_zh IS NOT NULL').all() as any[];
const updateDisease = db.prepare('UPDATE kb_diseases SET name_zh = ?, description_zh = ? WHERE id = ?');
let diseaseCount = 0;
for (const d of diseases) {
  const newName = t2s(d.name_zh);
  const newDesc = t2s(d.description_zh);
  if (newName !== d.name_zh || newDesc !== d.description_zh) {
    updateDisease.run(newName, newDesc, d.id);
    diseaseCount++;
  }
}
console.log(`  ✅ 疾病转换: ${diseaseCount}/${diseases.length}`);

// ── 2. 药物 ──
console.log('💊 转换药物...');
const drugs = db.prepare('SELECT id, name_zh, description_zh, indications, side_effects FROM kb_drugs2 WHERE name_zh IS NOT NULL OR description_zh IS NOT NULL OR indications IS NOT NULL OR side_effects IS NOT NULL').all() as any[];
const updateDrug = db.prepare('UPDATE kb_drugs2 SET name_zh = ?, description_zh = ?, indications = ?, side_effects = ? WHERE id = ?');
let drugCount = 0;
for (const d of drugs) {
  const newName = t2s(d.name_zh);
  const newDesc = t2s(d.description_zh);
  const newInd = t2s(d.indications);
  const newSE = t2s(d.side_effects);
  if (newName !== d.name_zh || newDesc !== d.description_zh || newInd !== d.indications || newSE !== d.side_effects) {
    updateDrug.run(newName, newDesc, newInd, newSE, d.id);
    drugCount++;
  }
}
console.log(`  ✅ 药物转换: ${drugCount}/${drugs.length}`);

// ── 3. 品种 ──
console.log('🧬 转换品种...');
const breeds = db.prepare('SELECT id, name_zh FROM kb_breeds2 WHERE name_zh IS NOT NULL').all() as any[];
const updateBreed = db.prepare('UPDATE kb_breeds2 SET name_zh = ? WHERE id = ?');
let breedCount = 0;
for (const b of breeds) {
  const newName = t2s(b.name_zh);
  if (newName !== b.name_zh) {
    updateBreed.run(newName, b.id);
    breedCount++;
  }
}
console.log(`  ✅ 品种转换: ${breedCount}/${breeds.length}`);

// ── 4. 症状 ──
console.log('🔍 转换症状...');
const symptoms = db.prepare('SELECT slug, name_zh FROM kb_symptoms WHERE name_zh IS NOT NULL').all() as any[];
const updateSymptom = db.prepare('UPDATE kb_symptoms SET name_zh = ? WHERE slug = ?');
let symptomCount = 0;
for (const s of symptoms) {
  const newName = t2s(s.name_zh);
  if (newName !== s.name_zh) {
    updateSymptom.run(newName, s.slug);
    symptomCount++;
  }
}
console.log(`  ✅ 症状转换: ${symptomCount}/${symptoms.length}`);

// ── 5. 诊疗术语 ──
console.log('📋 转换诊疗术语...');
const terms = db.prepare('SELECT id, name, aliases, plain_explain, medical_explain FROM kb_terms WHERE name IS NOT NULL').all() as any[];
const updateTerm = db.prepare('UPDATE kb_terms SET name = ?, aliases = ?, plain_explain = ?, medical_explain = ? WHERE id = ?');
let termCount = 0;
for (const t of terms) {
  const newName = t2s(t.name);
  const newAliases = t2s(t.aliases);
  const newPlain = t2s(t.plain_explain);
  const newMedical = t2s(t.medical_explain);
  if (newName !== t.name || newAliases !== t.aliases || newPlain !== t.plain_explain || newMedical !== t.medical_explain) {
    updateTerm.run(newName, newAliases, newPlain, newMedical, t.id);
    termCount++;
  }
}
console.log(`  ✅ 术语转换: ${termCount}/${terms.length}`);

// ── 6. 品种-疾病关联 ──
console.log('🔗 转换品种疾病关联...');
const bds = db.prepare('SELECT rowid, breed, disease FROM kb_breed_diseases WHERE breed IS NOT NULL OR disease IS NOT NULL').all() as any[];
const updateBd = db.prepare('UPDATE kb_breed_diseases SET breed = ?, disease = ? WHERE rowid = ?');
let bdCount = 0;
for (const b of bds) {
  const newBreed = t2s(b.breed);
  const newDisease = t2s(b.disease);
  if (newBreed !== b.breed || newDisease !== b.disease) {
    updateBd.run(newBreed, newDisease, b.rowid);
    bdCount++;
  }
}
console.log(`  ✅ 品种疾病关联转换: ${bdCount}/${bds.length}`);

// ── 7. 重建 FTS5 索引 ──
console.log('🔧 重建 FTS5 索引...');
db.prepare("INSERT INTO kb_terms_fts(kb_terms_fts) VALUES('rebuild')").run();
const ftsCount = (db.prepare('SELECT COUNT(*) as cnt FROM kb_terms_fts').get() as any).cnt;
console.log(`  ✅ FTS5 索引: ${ftsCount} 条`);

db.close();
console.log('\n🎉 繁→简转换完成！');
