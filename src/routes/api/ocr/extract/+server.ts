import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { llmExtractItems } from '$lib/server/ocr/index';

/**
 * POST /api/ocr/extract
 *
 * 使用 LLM 从 OCR 原始文本中智能提取项目名和价格。
 *
 * Body: { rawText: string }
 * Response: { success: boolean, items: Array<{name: string, amount: number}>, error?: string }
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const rawText = body.rawText as string;

    if (!rawText || rawText.trim().length === 0) {
      return json({ success: false, items: [], error: '请提供 OCR 原始文本' }, { status: 400 });
    }

    const result = await llmExtractItems(rawText);
    return json(result);
  } catch (err) {
    console.error('[VetLens] LLM extract API error:', err);
    return json({
      success: false,
      items: [],
      error: `提取失败: ${err instanceof Error ? err.message : '未知错误'}`,
    }, { status: 500 });
  }
};
