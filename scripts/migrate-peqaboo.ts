/**
 * Peqaboo 知识库数据迁移脚本
 *
 * 将 peqaboo_data/ 中的完整数据导入 VetLens SQLite 数据库
 * - 疾病: 补充 name_zh 别名、description_zh、body_systems、关联症状/药物/品种
 * - 药物: 补充 name_zh 别名、indications、side_effects、dosing_json、detail_json
 * - 品种: 更新 name_zh（更丰富的中文名）
 * - 症状: 更新 name_zh
 * - 品种疾病关联: 从疾病数据中提取 breedPredispositions → kb_breed_diseases
 * - 疾病详情: 存储 longFormMarkdown → detail_json
 * - 药物详情: 存储完整详情 → detail_json
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const PEQABOO_DIR = process.argv[2] || 'F:/Users/宋泽锋/Desktop/Pet/peqaboo/peqaboo_data';
const DB_PATH = process.env.VETLENS_DB_PATH || 'F:/Pet_Projects/VetLens/data/vetlens.db';

console.log(`📂 Peqaboo 数据目录: ${PEQABOO_DIR}`);
console.log(`🗄️  目标数据库: ${DB_PATH}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── 辅助函数 ──────────────────────────────────────────

/** 从 peqaboo i18n 对象提取中文名（优先 zh_TW → zh_HK） */
function extractZhName(nameI18n: Record<string, string> | undefined, fallback = ''): string {
  if (!nameI18n) return fallback;
  return nameI18n['zh_TW'] || nameI18n['zh_HK'] || fallback;
}

/** 从 peqaboo i18n 提取中文描述 */
function extractZhDesc(descI18n: Record<string, string> | undefined, fallback = ''): string {
  if (!descI18n) return fallback;
  return descI18n['zh_TW'] || descI18n['zh_HK'] || fallback;
}

/** 从 peqaboo longFormI18n 提取中文 body */
function extractZhBody(lfI18n: Record<string, {title?:string; summary?:string; body?:string}> | undefined): string | null {
  if (!lfI18n) return null;
  const zh = lfI18n['zh_TW'] || lfI18n['zh_HK'];
  if (!zh) return null;
  return [zh.title, zh.summary, zh.body].filter(Boolean).join('\n\n');
}

// ── 1. 迁移疾病 ────────────────────────────────────────

console.log('\n📚 处理疾病数据...');
const diseaseDetailPath = path.join(PEQABOO_DIR, 'diseases_detail.json');
if (!fs.existsSync(diseaseDetailPath)) {
  console.error('  ❌ 找不到 diseases_detail.json');
  process.exit(1);
}

const diseasesDetailRaw = fs.readFileSync(diseaseDetailPath, 'utf-8');
const diseasesDetail = JSON.parse(diseasesDetailRaw);
console.log(`  读取到 ${diseasesDetail.length} 条疾病详情`);

const updateDisease = db.prepare(`
  UPDATE kb_diseases SET
    name_zh = COALESCE(NULLIF(?, ''), name_zh),
    description_zh = COALESCE(NULLIF(?, ''), description_zh),
    body_systems = ?,
    symptoms = ?,
    drugs = ?,
    breeds = ?,
    detail_json = ?
  WHERE id = ? OR slug = ?
`);

let diseaseUpdated = 0, diseaseInserted = 0;

const insertDisease = db.prepare(`
  INSERT OR IGNORE INTO kb_diseases (id, slug, canonical_name, category, rarity, urgency, species,
    name_zh, description_zh, body_systems, symptoms, drugs, breeds, detail_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const d of diseasesDetail) {
  const nameZh = extractZhName(d.nameI18n);
  const descZh = extractZhDesc(d.longFormSummaryI18n) || extractZhDesc(d.descriptionI18n) || d.longFormSummary || d.description || '';
  const zhBody = extractZhBody(d.longFormI18n);

  const bodySystems = d.bodySystems ? JSON.stringify(d.bodySystems) : null;
  const symptoms = d.symptoms ? JSON.stringify(d.symptoms.map((s: any) => ({
    slug: s.slug,
    name: s.canonicalName || s.canonical_name,
    nameZh: extractZhName(s.nameI18n || s.name_i18n),
    frequency: s.frequency
  }))) : null;
  const drugs = d.drugTreatments ? JSON.stringify(d.drugTreatments.map((t: any) => ({
    slug: t.slug,
    name: t.genericName || t.canonicalName || t.canonical_name,
    nameZh: extractZhName(t.nameI18n || t.name_i18n),
    drugClass: t.drugClass,
    lineOfTherapy: t.lineOfTherapy,
    notes: t.notes
  }))) : null;
  const breeds = d.breedPredispositions ? JSON.stringify(d.breedPredispositions.map((b: any) => ({
    slug: b.slug,
    name: b.canonicalName || b.canonical_name,
    nameZh: extractZhName(b.nameI18n || b.name_i18n)
  }))) : null;

  const detailJson = JSON.stringify({
    longFormMarkdown: d.longFormMarkdown || null,
    longFormZh: zhBody,
    prognosisDefault: d.prognosisDefault || null,
    verified: d.verified || false,
    speciesSlugs: d.speciesSlugs || [],
    diagnosticTests: d.diagnosticTests || [],
    referenceImage: d.referenceImage || null,
    scientificName: d.scientificName || null,
    altNames: d.altNames || [],
    sourceBook: d.sourceBook || null,
    sourceEdition: d.sourceEdition || null,
  });

  const species = (d.speciesSlugs || []).join(',') || null;
  const category = d.category || null;
  const rarity = d.rarity || null;
  const urgency = d.urgencyLevel || null;

  // Try update first
  const result = updateDisease.run(
    nameZh, descZh,
    bodySystems, symptoms, drugs, breeds, detailJson,
    d.id, d.slug
  );

  if (result.changes > 0) {
    diseaseUpdated++;
  } else {
    // Insert if not exists
    insertDisease.run(
      d.id, d.slug, d.canonicalName, category, rarity, urgency, species,
      nameZh, descZh,
      bodySystems, symptoms, drugs, breeds, detailJson
    );
    diseaseInserted++;
  }
}
console.log(`  ✅ 疾病: 更新 ${diseaseUpdated}, 新增 ${diseaseInserted}`);

// ── 2. 迁移药物 ────────────────────────────────────────

console.log('\n💊 处理药物数据...');
const drugDetailPath = path.join(PEQABOO_DIR, 'drugs_detail.json');
if (!fs.existsSync(drugDetailPath)) {
  console.error('  ❌ 找不到 drugs_detail.json');
  process.exit(1);
}

const drugsDetailRaw = fs.readFileSync(drugDetailPath, 'utf-8');
const drugsDetail = JSON.parse(drugsDetailRaw);
console.log(`  读取到 ${drugsDetail.length} 条药物详情`);

const updateDrug = db.prepare(`
  UPDATE kb_drugs2 SET
    name_zh = COALESCE(NULLIF(?, ''), name_zh),
    description_zh = COALESCE(NULLIF(?, ''), description_zh),
    indications = COALESCE(NULLIF(?, ''), indications),
    side_effects = COALESCE(NULLIF(?, ''), side_effects),
    dosing_json = ?,
    detail_json = ?
  WHERE id = ? OR slug = ?
`);

let drugUpdated = 0, drugInserted = 0;

const insertDrug = db.prepare(`
  INSERT OR IGNORE INTO kb_drugs2 (id, slug, generic_name, brand_names, drug_class, routes,
    name_zh, description_zh, indications, side_effects, dosing_json, detail_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const d of drugsDetail) {
  const nameZh = extractZhName(d.nameI18n);
  const descZh = extractZhDesc(d.descriptionI18n) || d.description || '';

  const indications = d.indications ? d.indications.join('; ') : null;
  const sideEffects = d.sideEffects ? d.sideEffects.join('; ') : null;
  const dosingJson = d.dosing ? JSON.stringify(d.dosing) : null;

  const detailJson = JSON.stringify({
    commonNames: d.commonNames || [],
    synonyms: d.synonyms || [],
    contraindications: d.contraindications || [],
    interactions: d.interactions || [],
    drugInteractions: d.drugInteractions || [],
    modeOfAction: d.modeOfAction || null,
    precautions: d.precautions || null,
    clientInformation: d.clientInformation || null,
    clientInformationZh: d.clientInformationI18n ? (d.clientInformationI18n['zh_TW'] || d.clientInformationI18n['zh_HK']) : null,
    pharmacokinetics: d.pharmacokinetics || null,
    monitoring: d.monitoring || [],
    overdosage: d.overdosage || null,
    storageStability: d.storageStability || null,
    dosageForms: d.dosageForms || null,
    regulatoryInfo: d.regulatoryInfo || null,
    sourceBook: d.sourceBook || null,
    sourceEdition: d.sourceEdition || null,
    diseasesTreated: d.diseasesTreated || [],
    administrationRoutes: d.administrationRoutes || [],
    referenceImage: d.referenceImage || null,
  });

  const brandNames = d.brandNames ? JSON.stringify(d.brandNames) : null;
  const routes = d.administrationRoutes ? JSON.stringify(d.administrationRoutes) : null;

  const result = updateDrug.run(
    nameZh, descZh, indications, sideEffects,
    dosingJson, detailJson,
    d.id, d.slug
  );

  if (result.changes > 0) {
    drugUpdated++;
  } else {
    insertDrug.run(
      d.id, d.slug, d.genericName, brandNames, d.drugClass || null, routes,
      nameZh, descZh, indications, sideEffects,
      dosingJson, detailJson
    );
    drugInserted++;
  }
}
console.log(`  ✅ 药物: 更新 ${drugUpdated}, 新增 ${drugInserted}`);

// ── 3. 迁移品种 ────────────────────────────────────────

console.log('\n🧬 处理品种数据...');
const breedsPath = path.join(PEQABOO_DIR, 'breeds_list.json');
if (!fs.existsSync(breedsPath)) {
  console.error('  ❌ 找不到 breeds_list.json');
} else {
  const breedsRaw = fs.readFileSync(breedsPath, 'utf-8');
  const breeds = JSON.parse(breedsRaw);
  console.log(`  读取到 ${breeds.length} 条品种数据`);

  const updateBreed = db.prepare(`
    UPDATE kb_breeds2 SET
      name_zh = COALESCE(NULLIF(?, ''), name_zh),
      canonical_name = COALESCE(NULLIF(?, ''), canonical_name),
      weight_min = COALESCE(?, weight_min),
      weight_max = COALESCE(?, weight_max)
    WHERE id = ? OR slug = ?
  `);

  const insertBreed = db.prepare(`
    INSERT OR IGNORE INTO kb_breeds2 (id, slug, canonical_name, species, size_class, weight_min, weight_max, name_zh, disease_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let breedUpdated = 0, breedInserted = 0;
  for (const b of breeds) {
    const nameZh = extractZhName(b.nameI18n, b.canonicalName) || b.canonicalName;
    const weightMin = b.weightKgMin ?? null;
    const weightMax = b.weightKgMax ?? null;

    const result = updateBreed.run(nameZh, b.canonicalName, weightMin, weightMax, b.id, b.slug);
    if (result.changes > 0) {
      breedUpdated++;
    } else {
      insertBreed.run(
        b.id, b.slug, b.canonicalName, b.speciesSlug || null, b.sizeClass || null,
        weightMin, weightMax, nameZh, b.diseaseCount || 0
      );
      breedInserted++;
    }
  }
  console.log(`  ✅ 品种: 更新 ${breedUpdated}, 新增 ${breedInserted}`);
}

// ── 4. 迁移症状 ────────────────────────────────────────

console.log('\n🔍 处理症状数据...');
const symptomsPath = path.join(PEQABOO_DIR, 'symptoms_list.json');
if (!fs.existsSync(symptomsPath)) {
  console.error('  ❌ 找不到 symptoms_list.json');
} else {
  const symptomsRaw = fs.readFileSync(symptomsPath, 'utf-8');
  const symptoms = JSON.parse(symptomsRaw);
  console.log(`  读取到 ${symptoms.length} 条症状数据`);

  const updateSymptom = db.prepare(`
    UPDATE kb_symptoms SET name_zh = COALESCE(NULLIF(?, ''), name_zh)
    WHERE slug = ?
  `);

  const insertSymptom = db.prepare(`
    INSERT OR IGNORE INTO kb_symptoms (slug, canonical_name, name_zh, disease_count)
    VALUES (?, ?, ?, ?)
  `);

  let symptomUpdated = 0, symptomInserted = 0;
  for (const s of symptoms) {
    const nameZh = extractZhName(s.nameI18n, s.canonicalName) || s.canonicalName;
    const result = updateSymptom.run(nameZh, s.slug);
    if (result.changes > 0) {
      symptomUpdated++;
    } else {
      insertSymptom.run(s.slug, s.canonicalName, nameZh, s.diseaseCount || 0);
      symptomInserted++;
    }
  }
  console.log(`  ✅ 症状: 更新 ${symptomUpdated}, 新增 ${symptomInserted}`);
}

// ── 5. 迁移品种-疾病关联 ────────────────────────────────

console.log('\n🔗 提取品种-疾病关联...');
const breedDiseaseStmt = db.prepare(`
  INSERT OR IGNORE INTO kb_breed_diseases (id, species, breed, disease, risk_level, screening, screening_cost_range)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let breedDiseaseCount = 0;
for (const d of diseasesDetail) {
  const preds = d.breedPredispositions || [];
  const diseaseName = d.canonicalName || '';
  const speciesSlugs = d.speciesSlugs || [];

  for (const pred of preds) {
    for (const sp of speciesSlugs) {
      const speciesName = sp === 'cat' ? '猫' : sp === 'dog' ? '狗' : sp;
      const breedName = extractZhName(pred.nameI18n || pred.name_i18n, pred.canonicalName || pred.canonical_name) || pred.canonicalName || pred.slug;
      const riskLevel = pred.risk_level || pred.evidenceLevel || pred.evidence_strength || '待核验';
      const screening = pred.screening || null;

      const id = `breed-${pred.slug || pred.canonical_name}-${d.slug}-${sp}`;
      breedDiseaseStmt.run(id, speciesName, breedName, diseaseName, riskLevel, screening, null);
      breedDiseaseCount++;
    }
  }
}
console.log(`  ✅ 品种疾病关联: 新增 ${breedDiseaseCount} 条`);

// ── 6. 重建 FTS5 索引 ──────────────────────────────────

console.log('\n🔧 重建 FTS5 索引...');
db.prepare("INSERT INTO kb_terms_fts(kb_terms_fts) VALUES('rebuild')").run();

const ftsCount = (db.prepare('SELECT COUNT(*) as cnt FROM kb_terms_fts').get() as any).cnt;
console.log(`  ✅ FTS5 索引: ${ftsCount} 条`);

// ── 7. 统计汇总 ────────────────────────────────────────

console.log('\n📊 迁移后数据库统计:');
const stats = db.prepare(`
  SELECT '疾病' as 类别, COUNT(*) as 数量 FROM kb_diseases
  UNION ALL SELECT '药物(kb_drugs2)', COUNT(*) FROM kb_drugs2
  UNION ALL SELECT '品种', COUNT(*) FROM kb_breeds2
  UNION ALL SELECT '症状', COUNT(*) FROM kb_symptoms
  UNION ALL SELECT '品种疾病关联', COUNT(*) FROM kb_breed_diseases
  UNION ALL SELECT '术语', COUNT(*) FROM kb_terms
`).all();
for (const s of stats) {
  console.log(`  ${(s as any)['类别']}: ${(s as any)['数量']} 条`);
}

db.close();
console.log('\n🎉 迁移完成！');
