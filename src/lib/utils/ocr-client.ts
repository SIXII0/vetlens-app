/**
 * 浏览器端 OCR 客户端 —— 使用 Tesseract.js (WASM)
 *
 * 三级 OCR 策略：
 * - PaddleOCR (Docker) → 首选，离线高精度
 * - Tesseract.js (浏览器) → 降级，无需 Docker
 * - 手动输入 → 最终 fallback
 *
 * 资源加载：全部从 /tesseract/ 本地加载（static/tesseract/）
 * - worker.min.js (121K)
 * - tesseract-core-simd-lstm.wasm.js + .wasm (6.6M)
 * - chi_sim.traineddata.gz (1.7M) + eng.traineddata.gz (2.9M)
 * 完全不依赖外网 CDN，国内网络环境可用
 */
import Tesseract from 'tesseract.js';

export interface BrowserOcrResult {
  success: boolean;
  text: string;
  confidence: number;
  structured?: {
    hospitalName?: string;
    date?: string;
    items: Array<{ name: string; amount: number | null; line: string }>;
    totalAmount?: number;
  };
  error?: string;
  errorDetail?: string;
}

/** OCR 全局配置 */
const OCR_CONFIG = {
  /** 单次 OCR 超时时间（毫秒），包括下载语言包 */
  timeout: 120_000,
  /** 使用的 OCR 引擎模式：1 = LSTM only */
  oem: 1 as const,
  /** 本地静态资源路径（Worker + Core 从 static/tesseract/ 加载，避免 CDN 被墙） */
  localAssetPath: '/tesseract',
};

/**
 * 将 File 转换为 HTMLImageElement（可靠方式）
 */
function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 使用 Tesseract.js 在浏览器端执行 OCR
 * 支持中文 + 英文混合识别
 */
export async function recognizeWithTesseract(imageFile: File): Promise<BrowserOcrResult> {
  let worker: Tesseract.Worker | null = null;
  const startTime = Date.now();

  try {
    // Step 0: 初始化 worker（全部从本地 static/tesseract/ 加载，无需 CDN）
    // 使用绝对 URL 避免 tesseract.js 内部的 URL 解析问题
    const baseUrl = `${window.location.origin}/tesseract`;
    console.log('[Tesseract] 开始初始化 worker（本地文件，无需外网）...');
    console.log('[Tesseract] Asset base URL:', baseUrl);

    // 使用本地 static/tesseract/ 下的所有文件（完全摆脱 jsdelivr CDN）
    const workerPromise = Tesseract.createWorker('chi_sim+eng', OCR_CONFIG.oem, {
      workerPath: `${baseUrl}/worker.min.js`,
      corePath: baseUrl,
      langPath: baseUrl,
      logger: (m) => {
        if (m.status === 'loading tesseract core') {
          console.log('[Tesseract] 加载核心...', Math.round(m.progress * 100) + '%');
        } else if (m.status === 'initializing tesseract') {
          console.log('[Tesseract] 初始化引擎...');
        } else if (m.status === 'loading language traineddata') {
          console.log('[Tesseract] 加载语言包...', Math.round(m.progress * 100) + '%');
        } else if (m.status === 'recognizing text') {
          console.log('[Tesseract] 识别中...', Math.round(m.progress * 100) + '%');
        }
      },
    });

    // 超时竞速：如果 120 秒内未完成初始化，抛出超时错误
    worker = await Promise.race([
      workerPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`OCR 初始化超时（${OCR_CONFIG.timeout / 1000}秒）。可能 WASM 初始化卡住，请刷新页面重试。`)),
          OCR_CONFIG.timeout
        )
      ),
    ]);

    console.log('[Tesseract] Worker 初始化完成');

    // Step 1: 将 File 转为 Image（更可靠的传递给 Tesseract 方式）
    const img = await fileToImage(imageFile);

    // Step 2: 识别
    console.log('[Tesseract] 开始识别...');
    const { data } = await worker.recognize(img);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('[Tesseract] 识别完成, 耗时:', elapsed + 's, 置信度:', data.confidence,
                '文本长度:', data.text?.length || 0);

    if (!data.text || data.text.trim().length === 0) {
      return {
        success: false,
        text: '',
        confidence: data.confidence,
        error: 'Tesseract 未能识别到文字，请尝试更清晰的图片或手动输入',
        errorDetail: 'OCR 引擎返回空文本，可能是图片质量过低或文字太小'
      };
    }

    const structured = parseStructuredText(data.text);

    return {
      success: true,
      text: data.text,
      confidence: data.confidence,
      structured
    };
  } catch (err: unknown) {
    // 详细错误信息
    let errorMsg: string;
    let errorDetail = '';

    if (err === undefined || err === null) {
      // Tesseract.js Worker 内部 reject 时可能不传 error，常见于：
      // 1. CDN 被墙，Worker/Core/语言包下载失败
      // 2. Worker 初始化时网络请求超时
      errorMsg = 'OCR Worker 加载失败（可能是 CDN 不通或网络超时）';
      errorDetail = 'Worker rejected without error message — 请打开 DevTools Network 面板查看是否有资源加载失败（404/超时）';
      console.error('[Tesseract] Worker rejected with undefined/null');
    } else if (err instanceof Error) {
      errorMsg = err.message || '未知 Error';
      errorDetail = err.stack || '';
      console.error('[Tesseract] Error:', errorMsg, errorDetail);
    } else if (typeof err === 'string') {
      errorMsg = err;
      errorDetail = err;
      console.error('[Tesseract] String error:', err);
    } else if (typeof err === 'object') {
      // 尝试提取有用信息
      const obj = err as Record<string, unknown>;
      errorMsg = obj.message ? String(obj.message) : JSON.stringify(err);
      errorDetail = obj.stack ? String(obj.stack) : errorMsg;
      console.error('[Tesseract] Object error:', err);
    } else {
      errorMsg = String(err);
      errorDetail = errorMsg;
      console.error('[Tesseract] Unknown error type:', err);
    }

    // 网络超时/下载失败的特殊提示
    if (errorMsg.includes('NetworkError') || errorMsg.includes('Failed to fetch') ||
        errorMsg.includes('timeout') || errorMsg.includes('abort')) {
      return {
        success: false,
        text: '',
        confidence: 0,
        error: 'OCR 语言包下载失败（网络问题）。请确认网络连接正常后重试，或使用手动输入',
        errorDetail: `网络错误: ${errorMsg}`
      };
    }

    // WASM 不支持
    if (errorMsg.includes('WebAssembly') || errorMsg.includes('wasm')) {
      return {
        success: false,
        text: '',
        confidence: 0,
        error: '浏览器不支持 WebAssembly，无法使用浏览器端 OCR。请使用 Chrome/Edge/Firefox 最新版',
        errorDetail: `WASM 错误: ${errorMsg}`
      };
    }

    return {
      success: false,
      text: '',
      confidence: 0,
      error: `Tesseract OCR 失败: ${errorMsg}`,
      errorDetail
    };
  } finally {
    // 确保 worker 被释放
    if (worker) {
      try {
        await worker.terminate();
        console.log('[Tesseract] Worker 已释放');
      } catch {
        // 忽略终止错误
      }
    }
  }
}

/**
 * 从 OCR 原始文本中提取结构化信息
 */
function parseStructuredText(rawText: string): BrowserOcrResult['structured'] {
  const lines = rawText.split('\n').filter(l => l.trim().length > 0);
  const items: Array<{ name: string; amount: number | null; line: string }> = [];
  let hospitalName: string | undefined;
  let date: string | undefined;
  let totalAmount: number | undefined;

  const amountPattern = /[¥￥]?\s*(\d+(?:\.\d{1,2})?)/;
  const datePattern = /(\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2})|(\d{2}[-\/.]\d{1,2}[-\/.]\d{1,2})/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 2) continue;

    // 日期
    if (!date) {
      const dateMatch = trimmed.match(datePattern);
      if (dateMatch) {
        date = dateMatch[0].replace(/[\/.]/g, '-');
        continue;
      }
    }

    // 医院名
    if (!hospitalName && (trimmed.includes('医院') || trimmed.includes('动物') ||
        trimmed.includes('宠物') || trimmed.includes('诊所') || trimmed.includes('兽医'))) {
      hospitalName = trimmed;
      continue;
    }

    // 合计行
    if (trimmed.includes('合计') || trimmed.includes('总计') ||
        trimmed.includes('总金额') || trimmed.includes('实收') || trimmed.includes('应收')) {
      const amtMatch = trimmed.match(amountPattern);
      if (amtMatch) totalAmount = parseFloat(amtMatch[1]);
      continue;
    }

    // 项目名 + 金额 (模式: xxx ¥123.45 或 xxx 123.45)
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
      const amtMatch = trimmed.match(amountPattern);
      if (amtMatch) {
        const amount = parseFloat(amtMatch[1]);
        const name = trimmed.replace(amountPattern, '').trim().replace(/[.…]+$/, '').trim();
        if (name && !isNaN(amount)) items.push({ name, amount, line: trimmed });
      }
    }
  }

  return { hospitalName, date, items, totalAmount };
}

/**
 * 快速检测 Tesseract.js 是否可用
 */
export function isTesseractAvailable(): boolean {
  try {
    return typeof WebAssembly === 'object'
      && typeof WebAssembly.instantiate === 'function';
  } catch {
    return false;
  }
}
