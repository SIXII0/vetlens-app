import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db/index';
import { v4 as uuid } from 'uuid';

export const GET: RequestHandler = async ({ url }) => {
  const petId = url.searchParams.get('petId');
  const status = url.searchParams.get('status'); // upcoming/done/overdue
  if (!petId) return json({ error: 'petId required' }, { status: 400 });

  const db = getDb();
  let q = 'SELECT * FROM vaccine_schedule WHERE pet_id = ?';
  const params: any[] = [petId];
  if (status) { q += ' AND status = ?'; params.push(status); }
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
