import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { queueContribution, uploadContributions } from '$lib/server/knowledge/contributor';
import { insertUnknownTerm } from '$lib/server/db/terms';

/** 提交未知项目（贡献到知识库） */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, amount, city, category, autoUpload } = body;

    if (!name) {
      return json({ error: '缺少项目名称' }, { status: 400 });
    }

    // 插入未知术语到知识库
    insertUnknownTerm(name, category || '其他');

    // 加入上传队列
    queueContribution({ name, amount: amount || 0, city, category });

    // 如果设置了自动上传，尝试上传
    if (autoUpload) {
      const uploadUrl = process.env.VETLENS_CONTRIBUTE_URL || 'https://api.vetlens.app/api/contribute';
      const { sent, failed } = await uploadContributions(uploadUrl);
      return json({ queued: true, sent, failed });
    }

    return json({ queued: true });
  } catch (err) {
    return json({
      error: `贡献提交失败: ${err instanceof Error ? err.message : '未知错误'}`
    }, { status: 500 });
  }
};
