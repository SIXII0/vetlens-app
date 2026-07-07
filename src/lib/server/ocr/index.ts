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
import { getLlmAdapter, type LlmAdapter } from '../llm/index';
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
      quantity?: number;
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

// ---- LLM 辅助提取 ----

/** LLM 提取结果 */
export interface LlmExtractResult {
  success: boolean;
  items: Array<{ name: string; amount: number }>;
  hospitalName?: string;
  date?: string;
  totalAmount?: number;
  error?: string;
}

/**
 * 使用 LLM 从 OCR 原始文本中智能提取项目名和价格
 *
 * 优势：
 * - 语义理解：正确区分"检查费"（分类标题）和"血常规"（具体项目）
 * - OCR 纠错：修复"白细泡"→"白细胞"等常见 OCR 错别字
 * - 上下文补全：自动补全因换行而截断的项目名
 * - 单位换算：识别"元/次"等单价描述
 */
export async function llmExtractItems(rawText: string): Promise<LlmExtractResult> {
  // 主路径：规则引擎 + 字典纠错（稳定、不臆造）
  const regexResult = postProcessOcrText(rawText);
  if (!regexResult) return { success: false, items: [], error: '文本解析失败' };
  const cleanedItems = regexResult.items
    .filter(it => it.amount != null && it.amount > 0)
    .map(it => ({
      name: it.name,  // 已在 postProcessOcrText 中通过 correctOcrErrors 纠正
      amount: it.amount as number,
      quantity: it.quantity,
    }));

  if (cleanedItems.length === 0) {
    // 规则引擎完全失败 → 尝试 LLM 兜底
    return await llmFallbackExtract(rawText);
  }

  console.log(`[VetLens] 规则引擎提取了 ${cleanedItems.length} 个项目`);
  return { success: true, items: cleanedItems };
}

/** 规则引擎完全失败时的 LLM 兜底（仅在无法提取任何项目时使用） */
async function llmFallbackExtract(rawText: string): Promise<LlmExtractResult> {
  const llm = getLlmAdapter();
  if (!llm) {
    return { success: false, items: [], error: '没有可用的 LLM 后端，且规则引擎未能提取到项目' };
  }

  const available = await llm.isAvailable().catch(() => false);
  if (!available) {
    return { success: false, items: [], error: 'LLM 不可用，且规则引擎未能提取到项目。请手动输入。' };
  }

  const prompt = `从以下宠物医院账单 OCR 识别结果中提取收费项目和金额。

### 规则
1. 每行如果有"中文名称 + 数字金额"的格式，提取名称和金额
2. 如果有多个数字，取最后一个作为金额
3. 忽略表头、合计行、支付行、收据号

### 输出格式：JSON 数组 [{"name":"...","amount":...}]

### OCR 文本
${rawText.slice(0, 3000)}`;

  try {
    const response = await llm.chat(prompt, '你是 OCR 提取助手。从账单文本中提取项目名和金额。只返回 JSON 数组。');
    const jsonMatch = response.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim().match(/\[([\s\S]*)\]/);
    if (!jsonMatch) return { success: false, items: [], error: 'LLM 返回格式异常' };

    const parsed = JSON.parse(jsonMatch[0]);
    const items = parsed
      .filter((it: any) => it.name && it.amount > 0 && it.amount < 50000)
      .map((it: any) => ({ name: String(it.name).trim(), amount: Number(it.amount), quantity: it.quantity }));

    return items.length > 0
      ? { success: true, items }
      : { success: false, items: [], error: 'LLM 未能提取到项目' };
  } catch (err) {
    return { success: false, items: [], error: `提取失败: ${err instanceof Error ? err.message : '未知错误'}` };
  }
}

/**
 * OCR 后处理 —— 从原始文本中提取结构化信息
 *
 * 策略：
 * 1. 行分类: 将每行分为 header / meta / section_title / total / date / item / noise
 * 2. 行合并: 处理跨行换行的项目名
 * 3. 结构化提取: 从 item 行提取"项目名 + 金额"对
 * 4. 多层过滤: 剔除地址、电话、分类标题、合计行等噪声
 */

// ---- 行分类器 ----

type LineType = 'header' | 'meta' | 'section_title' | 'total' | 'date' | 'item' | 'noise';

/** 地址特征词（"号"仅当前面紧跟数字时才视为地址，避免误伤"挂号""号数"等医疗术语） */
const ADDRESS_PATTERN = /(\d+号|路|区|省|市|街|栋|楼|室|单元|层|座|县|乡|镇|村|弄|巷|胡同|大道|环路)/;

/** 电话号码 */
const PHONE_PATTERN = /(0\d{2,3}[-\s]?\d{7,8}|1[3-9]\d{9})/;

/** 银行/支付信息 */
const PAYMENT_PATTERN = /(银行卡|支付|微信|支付宝|扫码|二维码|发票|税号|开户行|账号)/;

/** 分类标题行（无具体项目，仅为费用分类名称） */
const SECTION_TITLE_PATTERN = /^(检查费|化验费|药品费|西药费|中药费|治疗费|手术费|耗材费|材料费|服务费|处置费|挂号费|诊费|诊疗费|护理费|住院费|麻醉费|观察费|注射费|输液费|卫材费|其他费|放射费|超声费|化验|检[查验]|药[品费]|治[疗疗]|手[术]|材[料]|耗[材]).{0,6}$/;

/** 合计关键词 */
const TOTAL_PATTERN = /(合计|总计|应收|实收|总金额|总额|应付|小计|总费用)/i;

/** 纯噪声（全是符号、数字、单字符等） */
const NOISE_PATTERN = /^[\d\s\.,:：;；、。，·\-—=_#@!~`'"<>\[\]{}|\\/()（）\*]+$/;

/** 收据号/发票号/流水号 */
const RECEIPT_NO_PATTERN = /(No[.:]|编号|流水号|票号|收据号|发票号|订单号|ID[：:]?\s*\d)/i;

/** 金额模式 */
const AMOUNT_PATTERN = /[¥￥]?\s*(\d+(?:\.\d{1,2})?)/;

/** 日期模式 */
const DATE_PATTERN = /(\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2})|(\d{2}[-\/.]\d{1,2}[-\/.]\d{1,2})/;

/**
 * 对单行 OCR 文本进行分类
 */
function classifyLine(line: string): LineType {
  // 行内归一化：去除汉字间的空格（OCR 有时输出 "血 常 规"）
  let trimmed = line.trim()
    .replace(/([一-鿿]) ([一-鿿])/g, '$1$2')
    .replace(/([一-鿿])\s+([一-鿿])/g, '$1$2');

  // 空行 / 过短
  if (trimmed.length < 2) return 'noise';

  // 收据号/发票号（"No.: S001150722224614" 之类）
  if (RECEIPT_NO_PATTERN.test(trimmed)) return 'noise';

  // 长数字串（很可能不是金额，而是编号/流水号）
  if (/^\d{5,}$/.test(trimmed) || /^\d{8,}$/.test(trimmed.replace(/\s/g, ''))) return 'noise';

  // 纯金额行（1-6位数字，可选小数）—— 可能是上一行项目的金额跨行
  if (/^\s*\d{1,6}(?:[.,]\d{1,2})?\s*$/.test(trimmed)) return 'item';

  // 纯符号/数字/字母组合
  // 例外：含金额的短行可能是英文缩写诊疗项目（如"CR 2 100,00 200"）
  if (/^[A-Za-z0-9\s:：\-,.]+$/.test(trimmed) && !/[一-龥]/.test(trimmed)) {
    const hasAmount = /\d{2,}(?:[.,]\d{1,2})?/.test(trimmed);
    const isShort = trimmed.length < 30;
    if (!(hasAmount && isShort)) return 'noise';
    // 短行+有金额+无中文 → 可能是 CR/X光/B超 等英文缩写项目
    // 不在此处拦截，继续走后续 item 判断
  }

  // 纯符号/数字噪声（金额行已被上面的规则拦截，这里不会命中金额行）
  if (NOISE_PATTERN.test(trimmed) && trimmed.length < 10) return 'noise';

  // 表头行（"序号 项目描述 金额" / "名称 数量 小计"）
  if (/^(序号|项目描述|金额|名称|数量|小计|单价)\s/.test(trimmed) ||
      /(序号|项目描述|金额|名称|数量|小计|单价)\s+/.test(trimmed)) {
    return 'section_title';
  }

  // 日期行
  if (DATE_PATTERN.test(trimmed) && trimmed.length < 15) return 'date';

  // 银行/支付信息
  if (PAYMENT_PATTERN.test(trimmed)) return 'meta';

  // 地址
  if (ADDRESS_PATTERN.test(trimmed)) return 'meta';

  // 电话
  if (PHONE_PATTERN.test(trimmed)) return 'meta';

  // 医院名称（包含关键字 + 无金额数字 或 整行较短的机构名）
  if (/医院|动物|宠物|诊所|兽[医师]|门诊/.test(trimmed)) {
    // 如果含数字金额 → 可能是项目行（如"住院费 ¥200"包含"院"字但不是医院名）
    const hasAmount = /[¥￥]?\s*\d{2,}(?:\.\d{1,2})?/.test(trimmed);
    if (!hasAmount) return 'header';
  }

  // 合计行
  if (TOTAL_PATTERN.test(trimmed)) return 'total';

  // 分类标题（严格匹配：短行 + 以费用类别关键词开头）
  if (SECTION_TITLE_PATTERN.test(trimmed)) {
    // 额外判断：如果行内有更具体的项目描述（如"血常规检查费"），则是 item 不是标题
    const afterTitle = trimmed.replace(/^(检查费|化验费|药品费|西药费|中药费|治疗费|手术费|耗材费|材料费|服务费|处置费|挂号费|诊费|诊疗费|护理费|住院费|麻醉费|观察费|注射费|输液费|卫材费|其他费|放射费|超声费)/, '');
    if (afterTitle.length <= 3) return 'section_title';
  }

  // 含金额 → 项目行
  if (AMOUNT_PATTERN.test(trimmed)) return 'item';

  // 含中文 + 长度适中 → 可能是换行的项目名或金额分离行
  if (/[一-龥]{2,}/.test(trimmed) && trimmed.length >= 3) return 'item';

  return 'noise';
}

/**
 * 从一行文本中提取金额（返回最后一个匹配的金额，通常是行的最右金额）
 */
function extractAmount(line: string): { amount: number; raw: string } | null {
  // 匹配行中的所有金额（支持 100,00 → 100.00 逗号小数点）
  const matches = line.match(/[¥￥]?\s*(\d+(?:[.,]\d{1,2})?)/g);
  if (!matches || matches.length === 0) return null;

  // 从右向左找第一个有效金额（跳过尾随的 0 / 0.00）
  for (let i = matches.length - 1; i >= 0; i--) {
    let numStr = matches[i].replace(/[¥￥\s]/g, '');
    // 修复逗号小数点
    numStr = numStr.replace(/,(\d{2})$/, '.$1').replace(/,$/, '');
    const amount = parseFloat(numStr);

    if (isNaN(amount) || amount < 0) continue;
    // 跳过尾随 0（可能是 OCR 噪声，如 "20.00 0.00" 中的 0.00）
    if (amount === 0 && i === matches.length - 1) continue;
    // 跳过金额过大值（如 53744 这种编号）
    if (amount > 50000) continue;
    // 跳过纯整数且过大的行号/编号（>1000 且不是最后一个数字则跳过）
    if (amount > 1000 && i < matches.length - 1) continue;

    if (amount > 0) {
      return { amount, raw: matches[i] };
    }
  }

  return null;
}

/**
 * 清理项目名（去除金额、编号、分隔符等）
 *
 * 处理常见 OCR 账单格式：
 *   "项目名 数量 单价 小计" → "项目名"
 *   "项目名 金额" → "项目名"
 */
function cleanItemName(rawName: string): string {
  let name = rawName;

  // 去除行尾的 ... 和分隔符
  name = name.replace(/[.…]+$/, '');

  // 去除 ¥ 金额
  name = name.replace(/[¥￥]\s*\d+(?:[.,]\d{1,2})?/g, '');

  // 去除行首编号
  name = name.replace(/^[\d一二三四五六七八九十]+[.\)、．)\s]+/, '');

  // 先清理尾部残留的标点符号（防止逗号阻挡后续数字剥离）
  name = name.replace(/[,;；，、]+$/, '');

  // 多数字尾随剥离
  const numbersAtEnd = name.match(/(\s+\d{1,6}(?:[.,]\d{1,2})?\s*)+$/);
  if (numbersAtEnd) {
    const stripped = name.slice(0, numbersAtEnd.index).trim();
    if (stripped.length >= 2 && /[一-龥]/.test(stripped)) {
      name = stripped;
    }
  }

  // 单数字尾随剥离（循环直到没有更多数字）
  let prev = '';
  while (prev !== name) {
    prev = name;
    name = name.replace(/\s+\d+(?:[.,]\d{1,2})?\s*$/g, '');
  }

  // 去除纯数字/字母/符号尾部
  name = name.replace(/\s+[A-Za-z0-9:：\-,.]{3,}\s*$/g, '');

  // 再次循环剥离（上一轮可能暴露新尾部）
  prev = '';
  while (prev !== name) {
    prev = name;
    name = name.replace(/\s+\d+(?:[.,]\d{1,2})?\s*$/g, '');
  }

  // 再次清理标点
  name = name.replace(/[,;；，、]+$/, '');

  // 去除多余空格
  name = name.replace(/\s{2,}/g, ' ').trim();

  return name;
}

/** OCR 常见错误纠正（按长度降序，避免级联替换如"全讲"→"全套" 然后"生化全"又匹配→"生化全套套"） */
function correctOcrErrors(name: string): string {
  // 按 key 长度降序排列，优先匹配长模式
  // 按长度降序：先匹配完整短语，避免部分替换（如"生化全"→"生化全套"导致剩余"讲"）
  const corrections: Array<[string, string]> = [
    ['生化全讲', '生化全套'],
    ['血常规检', '血常规'],
    ['阿莫西材', '阿莫西林'],
    ['白细泡', '白细胞'],
    // ['生化全', '生化全套'],  // 移除：会错误匹配"生化全套"自身（"生化全"是"生化全套"的子串）
    ['全讲', '全套'],
    ['全项', '全套'],
    ['生比', '生化'],
  ];

  let result = name;
  for (const [wrong, correct] of corrections) {
    if (result.includes(wrong)) {
      result = result.replace(wrong, correct);
      break;  // 匹配后立即停止，防止级联替换
    }
  }

  // 修复逗号小数点: "100,00" → "100.00"（仅在项目名包含数字时）
  result = result.replace(/(\d+),(\d{2})(?!\d)/g, '$1.$2');

  return result;
}

/** 尝试从行中提取数量（1-20之间的小整数，不取行首序号，不取金额数字） */
function extractQuantity(line: string, amountValue?: number): number | undefined {
  const withoutSeq = line.replace(/^\d+[.\)、．\s]+/, '');
  const nums = withoutSeq.match(/\d+/g);
  if (!nums) return undefined;

  for (const numStr of nums) {
    const n = parseInt(numStr, 10);
    if (n < 1 || n > 20) continue;

    const idx = withoutSeq.indexOf(numStr);
    const after = withoutSeq.slice(idx + numStr.length, idx + numStr.length + 3);
    if (after.startsWith('.') || after.startsWith(',')) continue;

    // 跳过已识别为金额的相同数字
    if (amountValue !== undefined && Math.abs(n - amountValue) < 0.01) continue;

    return n;
  }
  return undefined;
}

/**
 * OCR 后处理主函数
 */
function postProcessOcrText(rawText: string): OcrResult['structured'] {
  // ---- 文本归一化 ----
  // 1. 合并汉字之间的空格：OCR 有时输出 "一 次 性 耗 材" 而非 "一次性耗材"
  let normalizedText = rawText
    // 两个汉字之间的单个空格 → 去除
    .replace(/([一-鿿]) ([一-鿿])/g, '$1$2')
    // 汉字 + 空格 + 汉字（多个空格）→ 去除
    .replace(/([一-鿿])\s+([一-鿿])/g, '$1$2')
    // 数字和单位之间的多余空格（如 "150. 00" → "150.00"）
    .replace(/(\d)\s+\.\s*(\d)/g, '$1.$2')
    // 逗号小数点后粘合（如 "100, 00" → "100,00"）
    .replace(/(\d),\s+(\d)/g, '$1,$2');

  const rawLines = normalizedText.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const items: OcrResult['structured']['items'] = [];
  let hospitalName: string | undefined;
  let date: string | undefined;
  let totalAmount: number | undefined;

  // ---- 第一遍：行分类 ----
  const classified = rawLines.map(line => ({
    text: line,
    type: classifyLine(line),
  }));

  // ---- 第二遍：提取元数据（日期、医院、合计） ----
  for (const { text, type } of classified) {
    // 日期
    if (!date && type === 'date') {
      const match = text.match(DATE_PATTERN);
      if (match) {
        date = match[0].replace(/[\/.]/g, '-');
      }
    }

    // 医院名
    if (!hospitalName && type === 'header') {
      hospitalName = text.slice(0, 50); // 截断过长文本
    }

    // 合计
    if (type === 'total') {
      const amtMatch = text.match(AMOUNT_PATTERN);
      if (amtMatch && !totalAmount) {
        totalAmount = parseFloat(amtMatch[1]);
      }
    }
  }

  // ---- 第三遍：提取项目行（合并相邻 item 行） ----
  let pendingName: string | null = null;

  for (let i = 0; i < classified.length; i++) {
    const { text, type } = classified[i];

    if (type !== 'item') {
      // 如果有暂存的待合并项目名且遇到非 item 行 → 存储为无金额项目
      if (pendingName) {
        items.push({ name: pendingName, amount: null, line: pendingName });
        pendingName = null;
      }
      continue;
    }

    const amtResult = extractAmount(text);
    const cleanedName = cleanItemName(text);

    // 检测行是否只是纯金额（如 OCR 把金额输出到了单独一行）
    const isAmountOnly = /^\s*\d{1,6}(?:[.,]\d{1,2})?\s*$/.test(text.trim());

    if (isAmountOnly && pendingName && amtResult) {
      // 纯金额行 + 有暂存的项目名 → 配对
      const correctedName = correctOcrErrors(pendingName);
      const quantity = extractQuantity(text, amtResult.amount);
      items.push({
        name: correctedName,
        amount: amtResult.amount,
        quantity,
        line: text,
      });
      pendingName = null;
      continue;
    }

    if (amtResult && !isAmountOnly) {
      // 有金额的完整项目行
      const finalName = pendingName
        ? `${pendingName} ${cleanedName}`.trim()
        : cleanedName;

      if (finalName.length >= 2) {
        const correctedName = correctOcrErrors(finalName);
        const quantity = extractQuantity(text, amtResult.amount);
        items.push({
          name: correctedName,
          amount: amtResult.amount,
          quantity,
          line: text,
        });
      }
      pendingName = null;
    } else if (!isAmountOnly) {
      // 无金额但有中文 → 可能是跨行的项目名第一行
      if (pendingName) {
        pendingName = `${pendingName} ${cleanedName}`.trim();
      } else if (cleanedName.length >= 2) {
        pendingName = cleanedName;
      }
    }
    // 纯金额行但没有 pendingName → 跳过（孤立的数字）
  }

  // 处理最后一个待合并的项目名
  if (pendingName && pendingName.length >= 2) {
    const correctedName = correctOcrErrors(pendingName);
    items.push({ name: correctedName, amount: null, line: pendingName });
  }

  // ---- 第四遍：后过滤 ----
  const filteredItems = items.filter((item: OcrResult['structured']['items'][number]) => {
    // 过滤掉短名称（残留噪声）
    if (item.name.length < 2) return false;

    // 过滤掉分类标题（仅当项目无金额时才过滤 —— 有金额说明是实际收费项）
    if (item.amount === null && SECTION_TITLE_PATTERN.test(item.name) && item.name.length <= 4) return false;

    // 过滤掉元数据行（地址、电话等漏网之鱼）
    if (ADDRESS_PATTERN.test(item.name) || PHONE_PATTERN.test(item.name)) return false;

    // 过滤总合计（不应出现在 items 中）
    if (TOTAL_PATTERN.test(item.name)) return false;

    // 过滤金额异常大的项（可能是分类小计被误识别）
    if (item.amount && item.amount >= 5000) {
      // 单项目超过 5000 在小动物诊疗中极少见，标记为可疑
      // 保留但标记
    }

    return true;
  });

  return {
    hospitalName,
    date,
    items: filteredItems,
    totalAmount,
  };
}
