import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db/index';
import { v4 as uuid } from 'uuid';

export const GET: RequestHandler = async ({ url }) => {
  const db = getDb();
  const id = url.searchParams.get('id');
  const petId = url.searchParams.get('petId');
  const status = url.searchParams.get('status');

  // 按 ID 查询单条
  if (id) {
    const record = db.prepare('SELECT * FROM vaccine_schedule WHERE id = ?').get(id);
    if (!record) return json({ error: 'not found' }, { status: 404 });
    return json(record);
  }

  const conditions: string[] = [];
  const params: any[] = [];

  if (petId) { conditions.push('pet_id = ?'); params.push(petId); }
  if (status) { conditions.push('status = ?'); params.push(status); }

  let q = 'SELECT * FROM vaccine_schedule';
  if (conditions.length > 0) q += ' WHERE ' + conditions.join(' AND ');
  q += ' ORDER BY next_date ASC LIMIT 50';

  // Auto-update overdue status
  const today = new Date().toISOString().split('T')[0];
  db.prepare("UPDATE vaccine_schedule SET status='overdue' WHERE status='upcoming' AND next_date < ?").run(today);

  return json(db.prepare(q).all(...params));
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { petId, vaccineType, species, dateGiven, nextDate, notes } = body;
  if (!petId || !vaccineType || !dateGiven || !nextDate) return json({ error: 'missing fields' }, { status: 400 });

  const db = getDb();
  const id = uuid();
  db.prepare(`INSERT INTO vaccine_schedule (id,pet_id,vaccine_type,species,date_given,next_date,notes,status)
    VALUES (?,?,?,?,?,?,?,'upcoming')`).run(id, petId, vaccineType, species||'猫', dateGiven, nextDate, notes||null);

  return json({ id, created: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
  const { id } = await request.json();
  getDb().prepare('DELETE FROM vaccine_schedule WHERE id=?').run(id);
  return json({ ok: true });
};
