import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db/index';
import { v4 as uuid } from 'uuid';

/** 根据频次推算下一次用药时间（保持时分秒精度） */
function calcNextDue(frequency: string, fromDate?: string): string {
  const base = fromDate ? new Date(fromDate) : new Date();
  const d = new Date(base.getTime());
  switch (frequency) {
    case '每8小时':   d.setHours(d.getHours() + 8); break;
    case '每12小时':  d.setHours(d.getHours() + 12); break;
    case '每天':      d.setDate(d.getDate() + 1); break;
    case '每周':      d.setDate(d.getDate() + 7); break;
    case '每2周':     d.setDate(d.getDate() + 14); break;
    case '每月':      d.setMonth(d.getMonth() + 1); break;
    default:          d.setDate(d.getDate() + 1); break; // 默认每天
  }
  return d.toISOString().split('T')[0] + ' ' +
    String(d.getHours()).padStart(2,'0') + ':' +
    String(d.getMinutes()).padStart(2,'0');
}

export const GET: RequestHandler = async ({ url }) => {
  const db = getDb();
  const id = url.searchParams.get('id');
  const petId = url.searchParams.get('petId');

  // 按 ID 查询单条
  if (id) {
    const record = db.prepare('SELECT * FROM medication_reminders WHERE id = ?').get(id);
    if (!record) return json({ error: 'not found' }, { status: 404 });
    return json(record);
  }

  // 把已到期的长期药自动顺延到下一剂（保持周期节奏，不重置为今天）
  const now = new Date();
  const nowStr = now.toISOString().split('T')[0] + ' ' +
    String(now.getHours()).padStart(2,'0') + ':' +
    String(now.getMinutes()).padStart(2,'0');

  // 找出所有逾期且没有 end_date（长期服药）的记录
  const overdueQuery = petId
    ? `SELECT id, frequency, next_due FROM medication_reminders
       WHERE pet_id = ? AND active = 1 AND end_date IS NULL AND next_due < ?`
    : `SELECT id, frequency, next_due FROM medication_reminders
       WHERE active = 1 AND end_date IS NULL AND next_due < ?`;
  const overdueParams = petId ? [petId, nowStr] : [nowStr];
  const overdue = db.prepare(overdueQuery).all(...overdueParams) as Array<{ id: string; frequency: string; next_due: string }>;

  // 逐条顺延：从原始 next_due 向前推进直到超过 now
  for (const m of overdue) {
    let nd = m.next_due;
    while (nd < nowStr) {
      nd = calcNextDue(m.frequency, nd);
    }
    db.prepare('UPDATE medication_reminders SET next_due = ? WHERE id = ?').run(nd, m.id);
  }

  // 已到期的有期限药（疗程结束）自动停用
  if (petId) {
    db.prepare(
      `UPDATE medication_reminders SET active = 0
       WHERE pet_id = ? AND active = 1 AND end_date IS NOT NULL AND end_date < date('now')`
    ).run(petId);
  } else {
    db.prepare(
      `UPDATE medication_reminders SET active = 0
       WHERE active = 1 AND end_date IS NOT NULL AND end_date < date('now')`
    ).run();
  }

  const query = petId
    ? 'SELECT * FROM medication_reminders WHERE pet_id = ? AND active = 1 ORDER BY next_due ASC LIMIT 30'
    : 'SELECT * FROM medication_reminders WHERE active = 1 ORDER BY next_due ASC LIMIT 30';
  const params = petId ? [petId] : [];

  return json(db.prepare(query).all(...params));
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { petId, medName, dosage, frequency, startDate, endDate, nextDue, notes, durationDays } = body;
  if (!petId || !medName || !frequency || !startDate) return json({ error: 'missing fields' }, { status: 400 });

  const db = getDb();
  const id = uuid();

  // 如果有疗程天数，自动计算 end_date
  let computedEnd: string | null = endDate || null;
  if (!computedEnd && durationDays && durationDays > 0) {
    const ed = new Date(startDate);
    ed.setDate(ed.getDate() + Number(durationDays));
    computedEnd = ed.toISOString().split('T')[0];
  }

  // next_due 统一用服务端计算（保持时间精度）
  const due = nextDue
    ? (nextDue.includes('T') ? nextDue.replace('T',' ') : nextDue + ' 08:00')
    : calcNextDue(frequency, startDate + ' 08:00');

  db.prepare(`INSERT INTO medication_reminders (id, pet_id, med_name, dosage, frequency, start_date, end_date, next_due, notes, active)
    VALUES (?,?,?,?,?,?,?,?,?,1)`)
    .run(id, petId, medName, dosage || null, frequency, startDate, computedEnd, due, notes || null);
  return json({ id, created: true });
};

/** PUT — 标记已服，服务端按频次推算下次时间 */
export const PUT: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { id } = body;
  if (!id) return json({ error: 'missing id' }, { status: 400 });

  const db = getDb();
  const med = db.prepare('SELECT frequency, next_due, end_date FROM medication_reminders WHERE id = ?').get(id) as
    { frequency: string; next_due: string; end_date: string | null } | undefined;
  if (!med) return json({ error: 'not found' }, { status: 404 });

  // 如果是有期限的疗程且已到最后一天，标记完成（停用）
  if (med.end_date) {
    const endDate = med.end_date;
    const today = new Date().toISOString().split('T')[0];
    if (today >= endDate) {
      db.prepare("UPDATE medication_reminders SET active = 0, last_given = datetime('now','localtime') WHERE id = ?").run(id);
      return json({ ok: true, completed: true });
    }
  }

  // 服务端按频次推算 next_due（保持周期节奏）
  const now = new Date();
  const nowStr = now.toISOString();
  const next = calcNextDue(med.frequency, nowStr);

  db.prepare("UPDATE medication_reminders SET next_due = ?, last_given = datetime('now','localtime') WHERE id = ?")
    .run(next, id);
  return json({ ok: true, nextDue: next });
};

/** PATCH — 编辑已有提醒（名称/剂量/频次/时间/疗程） */
export const PATCH: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { id, medName, dosage, frequency, startDate, endDate, nextDue, notes, durationDays } = body;
  if (!id) return json({ error: 'missing id' }, { status: 400 });

  const db = getDb();
  const med = db.prepare('SELECT * FROM medication_reminders WHERE id = ?').get(id) as any;
  if (!med) return json({ error: 'not found' }, { status: 404 });

  const newName = medName ?? med.med_name;
  const newDosage = dosage !== undefined ? dosage : med.dosage;
  const newFreq = frequency ?? med.frequency;
  const newStart = startDate ?? med.start_date;
  const newNotes = notes !== undefined ? notes : med.notes;

  // 如果修改了频次或 nextDue，重新推算
  let newNextDue = nextDue ?? med.next_due;
  if (!nextDue && frequency && frequency !== med.frequency) {
    // 频次变了但没指定 nextDue → 从当前时间按新频次推算
    const now = new Date();
    newNextDue = calcNextDue(newFreq, now.toISOString());
  }

  // 处理疗程天数变更
  let newEndDate = endDate !== undefined ? endDate : med.end_date;
  if (endDate === undefined && durationDays !== undefined && durationDays > 0) {
    const ed = new Date(newStart);
    ed.setDate(ed.getDate() + Number(durationDays));
    newEndDate = ed.toISOString().split('T')[0];
  }

  db.prepare(`UPDATE medication_reminders
    SET med_name=?, dosage=?, frequency=?, start_date=?, end_date=?, next_due=?, notes=?
    WHERE id=?`)
    .run(newName, newDosage, newFreq, newStart, newEndDate, newNextDue, newNotes, id);

  return json({ ok: true, id });
};

export const DELETE: RequestHandler = async ({ request }) => {
  const { id } = await request.json();
  getDb().prepare('UPDATE medication_reminders SET active = 0 WHERE id = ?').run(id);
  return json({ ok: true });
};
