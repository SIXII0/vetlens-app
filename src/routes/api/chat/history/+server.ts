import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listChatMessages } from '$lib/server/db/chat';

export const GET: RequestHandler = async ({ url }) => {
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) return json({ error: '缺少 sessionId' }, { status: 400 });
  const messages = listChatMessages(sessionId);
  return json({ sessionId, messages: messages.map(m => ({ id: m.id, role: m.role, content: m.content, intent: m.intent, safety: m.safety_json ? JSON.parse(m.safety_json) : undefined, sources: m.sources_json ? JSON.parse(m.sources_json) : undefined, actions: m.actions_json ? JSON.parse(m.actions_json) : undefined, createdAt: m.created_at })) });
};
