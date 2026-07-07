/**
 * PaddleOCR HTTP 客户端
 *
 * 连接到 Docker 容器内的 PaddleOCR 服务
 * PaddleOCR 服务通过 HTTP API 暴露（默认端口 8866）
 */

const PADDLE_OCR_URL = process.env.PADDLE_OCR_URL || 'http://localhost:8866';

/** 检查 PaddleOCR 是否可用 */
export async function isPaddleAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${PADDLE_OCR_URL}/health`, {
      signal: controller.signal
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/** 调用 PaddleOCR 识别图片 */
export async function recognizePaddle(imagePath: string): Promise<{
  success: boolean;
  rawText: string;
  confidence?: number;
}> {
  // 读取图片并转为 base64
  const fs = await import('fs');
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const response = await fetch(`${PADDLE_OCR_URL}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: base64Image,
      language: 'ch',
      det: true,   // 文字检测
      rec: true,   // 文字识别
      cls: true    // 文字方向分类
    })
  });

  if (!response.ok) {
    return { success: false, rawText: '' };
  }

  const data = await response.json() as {
    status: string;
    results: Array<{ text: string; confidence: number }>;
  };

  if (data.status !== 'ok' || !data.results || data.results.length === 0) {
    return { success: false, rawText: '' };
  }

  // 按位置排序并拼接文本
  const text = data.results
    .map(r => r.text)
    .join('\n');

  const avgConfidence = data.results.reduce((sum, r) => sum + r.confidence, 0) / data.results.length;

  return {
    success: true,
    rawText: text,
    confidence: avgConfidence
  };
}
