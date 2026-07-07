/**
 * OCR 调度器 —— 选引擎、预处理、后处理
 *
 * OCR 引擎切换策略:
 * 1. 优先使用 PaddleOCR（Docker 容器内，HTTP API localhost:8866）
 * 2. PaddleOCR 不可用时降级为 Tesseract.js（浏览器 WASM）
 * 3. 都不可用时返回错误，由前端切换手动输入模式
 */
import { recognizePaddle, isPaddleAvailable } from './paddle';
import { preprocessImage } from './preprocess';
import fs from 'fs';
import path from 'path';

export interface OcrResult {
  success: boolean;
  engine: 'paddle' | 'tesseract' | 'manual';
  rawText: string;
  structured?: {
    hospitalName?: string;
    date?: string;
    items: Array<{
      name: string;
      amount: number | null;
      line: string;
    }>;
    totalAmount?: number;
  };
  confidence?: number;
  error?: string;
}

/**
 * OCR 识别入口
 */
export async function performOcr(imagePath: string): Promise<OcrResult> {
  // 确保文件存在
  if (!fs.existsSync(imagePath)) {
    return { success: false, engine: 'manual', rawText: '', error: '图片文件不存在' };
  }

  // 预处理
  let processedPath: string;
  try {
    processedPath = await preprocessImage(imagePath);
  } catch {
    processedPath = imagePath; // 预处理失败用原图
  }

  // 尝试 PaddleOCR
  const paddleAvailable = await isPaddleAvailable();
  if (paddleAvailable) {
    try {
      const result = await recognizePaddle(processedPath);
      if (result.success) {
        const structured = postProcessOcrText(result.rawText);
        return {
          ...result,
          engine: 'paddle',
          structured
        };
      }
    } catch {
      // PaddleOCR 失败，降级
      console.warn('PaddleOCR failed, falling back to manual mode');
    }
  }

  // 降级：无可用 OCR 引擎
  return {
    success: false,
    engine: 'manual',
    rawText: '',
    error: '没有可用的 OCR 引擎。请确认 PaddleOCR 服务已启动（Docker 内默认运行），或手动输入账单信息。'
  };
}

/**
 * OCR 后处理 —— 从原始文本中提取结构化信息
 *
 * 策略：
 * 1. 正则匹配：提取金额、日期、医院名
 * 2. 行解析：提取"项目名 + 金额"对
 */
function postProcessOcrText(rawText: string): OcrResult['structured'] {
  const lines = rawText.split('\n').filter(l => l.trim().length > 0);
  const items: OcrResult['structured']['items'] = [];
  let hospitalName: string | undefined;
  let date: string | undefined;
  let totalAmount: number | undefined;

  // 金额正则：匹配 ¥123.45 / 123.45 / 123 等格式
  const amountPattern = /[¥￥]?\s*(\d+(?:\.\d{1,2})?)/;

  // 日期正则：匹配 2024-01-15 / 2024/01/15 / 2024.01.15 / 24-01-15
  const datePattern = /(\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2})|(\d{2}[-\/.]\d{1,2}[-\/.]\d{1,2})/;

  for (const line of lines) {
    const trimmed = line.trim();

    // 检测日期
    if (!date) {
      const dateMatch = trimmed.match(datePattern);
      if (dateMatch) {
        date = dateMatch[0].replace(/[\/.]/g, '-');
        continue;
      }
    }

    // 检测医院名（通常在第一行或包含"医院""动物""宠物"关键字）
    if (!hospitalName && (trimmed.includes('医院') || trimmed.includes('动物') || trimmed.includes('宠物'))) {
      hospitalName = trimmed;
      continue;
    }

    // 检测合计
    if (trimmed.includes('合计') || trimmed.includes('总计') || trimmed.includes('总金额')) {
      const amtMatch = trimmed.match(amountPattern);
      if (amtMatch) {
        totalAmount = parseFloat(amtMatch[1]);
      }
      continue;
    }

    // 提取项目名和金额
    // 模式：项目名 ... ¥金额 / 项目名 金额
    const amtIdx = trimmed.search(/[¥￥]?\s*\d+(?:\.\d{1,2})?\s*$/);
    if (amtIdx >= 0) {
      const name = trimmed.substring(0, amtIdx).trim().replace(/[.…]+$/, '').trim();
      const amtPart = trimmed.substring(amtIdx).trim().replace(/[¥￥]/g, '');
      const amount = parseFloat(amtPart);

      if (name && !isNaN(amount)) {
        items.push({ name, amount, line: trimmed });
      } else if (name) {
        items.push({ name, amount: null, line: trimmed });
      }
    } else {
      // 尝试从行中提取金额
      const amtMatch = trimmed.match(amountPattern);
      if (amtMatch) {
        const amount = parseFloat(amtMatch[1]);
        const name = trimmed.replace(amountPattern, '').trim().replace(/[.…]+$/, '').trim();
        if (name && !isNaN(amount)) {
          items.push({ name, amount, line: trimmed });
        }
      }
    }
  }

  return {
    hospitalName,
    date,
    items,
    totalAmount
  };
}
