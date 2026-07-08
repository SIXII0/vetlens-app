/**
 * 图片预处理 —— 提升 OCR 识别率
 *
 * 预处理步骤：
 * 1. 尺寸调整（放大到有效分辨率，保持宽高比）
 * 2. 灰度化
 * 3. 对比度增强
 * 4. 锐化（增强字符边缘）
 * 5. 自适应阈值二值化（文字=黑，背景=白，对账单 OCR 关键）
 *
 * 注：生产环境使用 sharp 库，此处提供基于 sharp 的实现。
 * 如果 sharp 不可用（如某些平台编译问题），回退到不做预处理。
 */

import path from 'path';
import os from 'os';

let sharpAvailable = false;
let sharp: typeof import('sharp') | null = null;

try {
  sharp = await import('sharp');
  sharpAvailable = true;
} catch {
  console.warn('sharp 不可用，OCR 图片预处理将跳过。安装 sharp 以获得更好的 OCR 识别率。');
}

/**
 * 预处理图片并返回处理后图片的路径
 */
export async function preprocessImage(inputPath: string): Promise<string> {
  if (!sharpAvailable || !sharp) {
    return inputPath; // sharp 不可用时返回原图路径
  }

  const ext = path.extname(inputPath);
  const outputPath = path.join(os.tmpdir(), `vetlens_preprocessed_${Date.now()}${ext}`);

  try {
    // 获取原图元数据
    const metadata = await sharp(inputPath).metadata();
    const minDim = Math.min(metadata.width || 0, metadata.height || 0);

    // 如果图片太小（可能低分辨率截图），放大到有效尺寸
    let pipeline = sharp(inputPath);
    if (minDim > 0 && minDim < 1500) {
      const scale = Math.min(1500 / minDim, 4.0); // 最多放大 4x
      const newW = Math.round((metadata.width || 1) * scale);
      const newH = Math.round((metadata.height || 1) * scale);
      pipeline = pipeline.resize(newW, newH, { fit: 'fill', kernel: 'lanczos3' });
    }

    // 限制最大尺寸为 3072px（保留足够细节）
    pipeline = pipeline
      .resize(3072, 3072, { fit: 'inside', withoutEnlargement: true })
      // 灰度化
      .grayscale()
      // 归一化对比度（autocontrast）
      .normalize()
      // 增强锐化（使字符边缘更清晰，sigma 提升到 1.5）
      .sharpen({
        sigma: 1.5,
        m1: 1.2,
        m2: 0.4
      })
      // 自适应阈值化（关键：将图片转为黑白二值）
      // threshold: 像素 ≤ threshold → 黑，> threshold → 白
      .threshold(128);

    await pipeline.toFile(outputPath);
    return outputPath;
  } catch (err) {
    console.warn('图片预处理失败，使用原图:', err);
    return inputPath;
  }
}

/** 清理预处理产生的临时文件 */
export function cleanupTempFile(filePath: string): void {
  if (filePath.includes('vetlens_preprocessed_')) {
    const fs = require('fs');
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // 忽略清理错误
    }
  }
}
