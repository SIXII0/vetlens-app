import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { performOcr } from '$lib/server/ocr/index';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return json({ error: '请上传账单图片' }, { status: 400 });
    }

    // 保存临时文件
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const uploadDir = path.join(os.tmpdir(), 'vetlens-uploads');
    fs.mkdirSync(uploadDir, { recursive: true });

    const ext = path.extname(file.name) || '.jpg';
    const tempPath = path.join(uploadDir, `upload_${Date.now()}${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempPath, buffer);

    // OCR 识别
    const result = await performOcr(tempPath);

    // 清理临时文件
    try { fs.unlinkSync(tempPath); } catch { /* ignore */ }

    return json(result);
  } catch (err) {
    return json({
      success: false,
      engine: 'manual',
      rawText: '',
      error: `OCR 处理失败: ${err instanceof Error ? err.message : '未知错误'}`
    });
  }
};
