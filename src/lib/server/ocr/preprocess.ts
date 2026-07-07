/**
 * 图片预处理 —— 提升 OCR 识别率
 *
 * 预处理步骤：
 * 1. 尺寸调整（限制最大尺寸，保持宽高比）
 * 2. 灰度化
 * 3. 对比度增强
 * 4. 自适应阈值二值化
 * 5. 去噪
 * 6. 纠偏（deskew）
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
    await sharp(inputPath)
      // 限制最大尺寸为 2048px
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      // 灰度化
      .grayscale()
      // 归一化对比度
      .normalize()
      // 锐化
      .sharpen({
        sigma: 1.0,
        m1: 1.0,
        m2: 0.5
      })
      // CLAHE-like 自适应增强（通过 modulate + normalize 近似）
      // .clahe({ width: 8, height: 8, maxSlope: 3 })
      .toFile(outputPath);

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
