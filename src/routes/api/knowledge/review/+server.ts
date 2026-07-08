import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { approveTerm, deleteTerm, getTermsBySource, getSourceCounts } from '$lib/server/db/terms';
import { env } from '$env/dynamic/private';

/**
 * GET  /api/knowledge/review?source=seed_unreviewed&limit=20&offset=0  — 获取待审核术语
 *       /api/knowledge/review?action=stats  — 获取各来源计数
 * POST /api/knowledge/review  — 审核通过 { id, reviewer }
 * DELETE — 删除 { id }
 */
export const GET: RequestHandler = async ({ url }) => {
  const action = url.searchParams.get('action') || 'list';
  const source = url.searchParams.get('source') || 'seed_unreviewed';
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  if (action === 'stats') {
    const counts = getSourceCounts();
    return json({ counts });
  }

  const terms = getTermsBySource(source, limit, offset);
  return json({ terms, source });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { id, reviewer } = body;
    if (!id) return json({ error: '缺少术语ID' }, { status: 400 });

    const ok = approveTerm(id, reviewer || 'admin');
    return json({ success: ok });
  } catch (err) {
    return json({ error: `审核失败: ${err}` }, { status: 500 });
  }
};

export const PUT: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { id, name, aliases } = body;
    if (!id || !name) return json({ error: '缺少术语信息' }, { status: 400 });

    const apiKey = env.DOUBAO_API_KEY || '';
    if (!apiKey) return json({ error: '豆包 API 未配置' }, { status: 503 });

    const baseUrl = env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    const model = env.DOUBAO_MODEL || 'doubao-1-5-pro-32k-250115';

    const prompt = `审核这条宠物医疗术语是否有效：

术语: ${name}
${aliases ? '别名: ' + aliases : ''}

请判断:
1. 是否是真实的宠物医疗收费项目（检查、药品、治疗、耗材、服务）？
2. 如果不是 → verdict: "invalid"
3. 如果是不确定的缩写/简称 → verdict: "uncertain"，并给出可能是什么
4. 如果是真实项目 → verdict: "valid"，并给出:
   - category: 检查/药品/治疗/耗材/服务/处置/手术
   - plain_explain: 一句话通俗解释（20字内）
   - medical_explain: 专业解释（50字内）
   - necessity_hint: 🔴必做/🟡建议做/🟢可选

只输出JSON: {"verdict":"valid|invalid|uncertain","category":"...","plain_explain":"...","medical_explain":"...","necessity_hint":"...","reason":"..."}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是宠物医疗术语审核专家。只输出JSON。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 512,
        temperature: 0.1
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) return json({ error: `AI API error: ${response.status}` }, { status: 502 });

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim().match(/\{[\s\S]*\}/);

    if (!jsonMatch) return json({ error: 'AI 返回格式异常' }, { status: 500 });

    const result = JSON.parse(jsonMatch[0]);

    // 如果 AI 确认有效，自动审核通过并补充字段
    if (result.verdict === 'valid') {
      approveTerm(id, 'ai-review', {
        category: result.category,
        plain_explain: result.plain_explain,
        medical_explain: result.medical_explain,
        necessity_hint: result.necessity_hint,
      });
    }

    return json({ success: true, review: result, autoApproved: result.verdict === 'valid' });
  } catch (err) {
    return json({ error: `AI审核失败: ${err instanceof Error ? err.message : '未知错误'}` }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { id } = body;
    if (!id) return json({ error: '缺少术语ID' }, { status: 400 });

    const ok = deleteTerm(id);
    return json({ success: ok });
  } catch (err) {
    return json({ error: `删除失败: ${err}` }, { status: 500 });
  }
};
