import { v4 as uuid } from 'uuid';
import { getDb } from './index';

export interface ChatSessionRow {
  id: string;
  pet_id: string | null;
  analysis_id: string | null;
  record_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
}

export interface ChatMessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  intent: string | null;
  safety_json: string | null;
  sources_json: string | null;
  actions_json: string | null;
  created_at: string;
}

export function createChatSession(input?: {
  petId?: string;
  analysisId?: string;
  recordId?: string;
  title?: string;
}): ChatSessionRow {
  const db = getDb();
  const id = uuid();
  const title = input?.title || '新的对话';
  db.prepare(`
    INSERT INTO chat_sessions (id, pet_id, analysis_id, record_id, title)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, input?.petId || null, input?.analysisId || null, input?.recordId || null, title);
  return db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as ChatSessionRow;
}

export function getChatSession(id: string): ChatSessionRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as ChatSessionRow | undefined;
}

export function getSessionByAnalysis(analysisId: string): ChatSessionRow | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM chat_sessions WHERE analysis_id = ? ORDER BY updated_at DESC LIMIT 1'
  ).get(analysisId) as ChatSessionRow | undefined;
}

export function updateChatSession(id: string, fields: { title?: string }): void {
  const db = getDb();
  const parts: string[] = [];
  const values: unknown[] = [];
  if (fields.title !== undefined) { parts.push('title = ?'); values.push(fields.title); }
  parts.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE chat_sessions SET ${parts.join(', ')} WHERE id = ?`).run(...values);
}

export function saveChatMessage(data: {
  id?: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
  safetyJson?: string;
  sourcesJson?: string;
  actionsJson?: string;
}): ChatMessageRow {
  const db = getDb();
  const id = data.id || uuid();
  db.prepare(`
    INSERT INTO chat_messages (id, session_id, role, content, intent, safety_json, sources_json, actions_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.sessionId, data.role, data.content,
    data.intent || null, data.safetyJson || null,
    data.sourcesJson || null, data.actionsJson || null,
  );
  db.prepare("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?").run(data.sessionId);
  return db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as ChatMessageRow;
}

export function listChatMessages(sessionId: string, limit = 50): ChatMessageRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?'
  ).all(sessionId, limit) as ChatMessageRow[];
}

export function getRecentMessages(sessionId: string, limit = 10): ChatMessageRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(sessionId, limit) as ChatMessageRow[];
}
