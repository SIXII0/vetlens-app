import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { baseUrl, apiKey, model } = body;
    if (!baseUrl || !model) return json({ ok: false, error: '缺少 Base URL 或 Model' }, { status: 400 });

    const cleanUrl = baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey || ''}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hello, respond with just "OK".' }], max_tokens: 10 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { const errText = await res.text().catch(() => ''); return json({ ok: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` }); }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : '连接失败' });
  }
};
