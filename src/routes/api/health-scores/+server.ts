import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db/index';
import { calculateHealthScore } from '$lib/server/engine/health-scoring';
import { v4 as uuid } from 'uuid';

/** GET — 获取历史评分 */
export const GET: RequestHandler = async ({ url }) => {
  const petId = url.searchParams.get('petId');
  const limit = parseInt(url.searchParams.get('limit') || '100');
  if (!petId) return json({ error: '缺少petId' }, { status: 400 });

  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM health_scores WHERE pet_id = ? ORDER BY test_date DESC LIMIT ?'
  ).all(petId, limit);

  return json(rows);
};

/** POST — 提交化验数据并计算评分 */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { petId, testDate, species } = body;
  if (!petId || !testDate) return json({ error: '缺少petId/testDate' }, { status: 400 });

  const db = getDb();
  const sp: 'cat' | 'dog' = species === '狗' ? 'dog' : 'cat';

  // 提取化验值
  const values: Record<string, number | null> = {};
  for (const key of ['bun','crea','glu','amy','wbc','rbc','hct']) {
    const v = body[key];
    values[key] = (v !== undefined && v !== null && v !== '') ? Number(v) : null;
  }

  // ── 获取宠物信息（体重、出生日期、品种）──
  const pet = db.prepare('SELECT breed, birth_date, weight_kg FROM pets WHERE id = ?').get(petId) as
    { breed: string | null; birth_date: string | null; weight_kg: number | null } | undefined;

  // 体重：优先使用本次输入，其次使用宠物档案中的记录
  let weightKg: number | null = null;
  if (body.weight_kg != null && body.weight_kg !== '') {
    const w = Number(body.weight_kg);
    if (!isNaN(w) && w > 0) weightKg = w;
  }
  if (weightKg == null && pet?.weight_kg != null && pet.weight_kg > 0) weightKg = pet.weight_kg;

  // 年龄：从出生日期计算
  let ageYears: number | null = null;
  if (pet?.birth_date) {
    const birth = new Date(pet.birth_date);
    const test = new Date(testDate);
    ageYears = (test.getTime() - birth.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (ageYears < 0) ageYears = 0;
  }

  // ── 查询品种理想体重范围 ──
  let breedRange: { min: number; max: number } | null = null;
  if (pet?.breed) {
    const breedLike = '%' + pet.breed + '%';
    const breedRow = db.prepare(
      'SELECT weight_min, weight_max FROM kb_breeds2 WHERE species = ? AND (name_zh LIKE ? OR canonical_name LIKE ? OR slug LIKE ?) LIMIT 1'
    ).get(sp, breedLike, breedLike, breedLike) as
      { weight_min: number | null; weight_max: number | null } | undefined;
    if (breedRow && breedRow.weight_min != null && breedRow.weight_max != null) {
      breedRange = { min: breedRow.weight_min, max: breedRow.weight_max };
    }
  }

  // ── 计算评分（含体重、年龄）──
  const result = calculateHealthScore({
    species: sp,
    values,
    weightKg,
    ageYears,
    breedRange
  });

  // ── 保存到数据库 ──
  const id = uuid();

  // 提取各分类得分
  const catMap = new Map(result.categories.map(c => [c.name, c.totalScore]));

  db.prepare(`
    INSERT INTO health_scores (id, pet_id, test_date, species,
      bun, crea, glu, amy, wbc, rbc, hct,
      kidney_score, pancreas_score, cbc_score, weight_score, age_score,
      overall_score, grade, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, petId, testDate, species === '狗' ? '狗' : '猫',
    values.bun, values.crea, values.glu, values.amy,
    values.wbc, values.rbc, values.hct,
    catMap.get('肾功能') ?? null,
    catMap.get('血糖+胰腺') ?? null,
    catMap.get('血常规') ?? null,
    catMap.get('体重') ?? null,
    catMap.get('年龄') ?? null,
    result.overallScore,
    result.grade,
    body.notes || null,
  );

  // 如果本次提交了体重，同步更新宠物档案
  if (weightKg != null && pet) {
    db.prepare('UPDATE pets SET weight_kg = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(weightKg, petId);
  }

  return json({ id, ...result, created: true });
};

/** DELETE — 删除记录 */
export const DELETE: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { id } = body;
  if (!id) return json({ error: '缺少id' }, { status: 400 });
  const db = getDb();
  db.prepare('DELETE FROM health_scores WHERE id = ?').run(id);
  return json({ ok: true });
};
