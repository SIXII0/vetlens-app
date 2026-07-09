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

  // 提取化验值
  const values: Record<string, number | null> = {};
  for (const key of ['bun','crea','glu','amy','wbc','rbc','hct']) {
    const v = body[key];
    values[key] = (v !== undefined && v !== null && v !== '') ? Number(v) : null;
  }

  // 计算评分
  const result = calculateHealthScore(species === '狗' ? 'dog' : 'cat', values);

  // 保存到数据库
  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO health_scores (id, pet_id, test_date, species,
      bun, crea, glu, amy, wbc, rbc, hct,
      kidney_score, pancreas_score, cbc_score, overall_score, grade, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, petId, testDate, species === '狗' ? '狗' : '猫',
    values.bun, values.crea, values.glu, values.amy,
    values.wbc, values.rbc, values.hct,
    result.categories[0]?.totalScore ?? null,
    result.categories[1]?.totalScore ?? null,
    result.categories[2]?.totalScore ?? null,
    result.overallScore,
    result.grade,
    body.notes || null,
  );

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
