import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db/index';
import { v4 as uuid } from 'uuid';

export const GET: RequestHandler = async ({ url }) => {
  const petId = url.searchParams.get('petId');
  if (!petId) return json({ error: 'petId required' }, { status: 400 });
  const db = getDb();

  // Auto-update next_due for overdue medications
  const today = new Date().toISOString().split('T')[0];
  db.prepare("UPDATE medication_reminders SET next_due=date('now') WHERE active=1 AND next_due < ?").run(today);

  return json(db.prepare('SELECT * FROM medication_reminders WHERE pet_id=? AND active=1 ORDER BY next_due ASC LIMIT 30').all(petId));
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { petId, medName, dosage, frequency, startDate, endDate, nextDue, notes } = body;
  if (!petId || !medName || !frequency || !startDate || !nextDue) return json({ error: 'missing fields' }, { status: 400 });

  const db = getDb();
  const id = uuid();
  db.prepare(`INSERT INTO medication_reminders (id,pet_id,med_name,dosage,frequency,start_date,end_date,next_due,notes,active)
    VALUES (?,?,?,?,?,?,?,?,?,1)`).run(id, petId, medName, dosage||null, frequency, startDate, endDate||null, nextDue, notes||null);
  return json({ id, created: true });
};

export const PUT: RequestHandler = async ({ request }) => {
  const { id, nextDue } = await request.json();
  getDb().prepare('UPDATE medication_reminders SET next_due=?, last_given=date("now") WHERE id=?').run(nextDue, id);
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
  const { id } = await request.json();
  getDb().prepare('UPDATE medication_reminders SET active=0 WHERE id=?').run(id);
  return json({ ok: true });
};
