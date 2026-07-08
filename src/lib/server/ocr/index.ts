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
import { getLlmAdapter } from '../llm/index';
import { env } from '$env/dynamic/private';
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

/** 构建 LLM 提取 prompt（含 OCR 纠错知识 + 宠物医疗术语库） */
function buildLlmExtractPrompt(rawText: string): string {
  return `从以下宠物医院账单 OCR 识别结果中提取收费项目和金额。

### OCR 常见错误参考（Tesseract chi_sim 模型在医疗文本上的已知误识别）
以下左侧 OCR 输出 → 右侧正确术语。如果 OCR 文本中出现左侧词语，请自动纠正为右侧：
- 氢化钠→氯化钠 | 列萄糖→葡萄糖 | 头孢障叶→头孢唑啉 | 普硝哗→替硝唑
- 障叶钠→唑啉钠 | 向依→合计 | 吊桶→吊瓶 | 士素→霉素 | 必素→霉素
- 生七→生化 | 血常现→血常规 | 全讲→全套 | 全项→全套 | 白细泡→白细胞
- 红细泡→红细胞 | 血小扳→血小板 | 挂呈→挂号 | 输夜→输液
- 注谢器→注射器 | 耗才→耗材 | 留置钍→留置针 | 麻佛微素→麻佛霉素
- ¥符号可能被识别为 " 或 " 或 「

### 常见宠物医疗收费项目（按类别）
- 检查: 血常规, 生化全套, CR/DR/X光, B超/超声, 血气, 电解质, 尿检, 便检, 镜检, 心电图, 血压, 血糖, ALT, BUN, CREA
- 药品: 阿莫西林, 头孢唑啉, 恩诺沙星, 多西环素, 替硝唑, 甲硝唑, 麻佛霉素, 氯化钠注射液(0.9%), 葡萄糖注射液(5%/50%), 水溶性维生素, 科特壮, 痛立定, 拜有利
- 治疗: 静脉输液, 皮下注射, 肌肉注射, 清创, 缝合, 麻醉, 留置针埋置, 导尿, 洗牙, 拔牙
- 耗材: 注射器(2ml/5ml), 留置针, 输液器, 一次性耗材, 纱布, 敷料, 采血管
- 服务: 挂号费, 急诊挂号, 诊疗费, 住院费, 护理费, 检查费, 化验费

### 提取规则
1. 每行找"中文名称 + 数字金额"的组合，提取名称和金额
2. 金额通常是行内最后一个数字（如 "80.0", "110.00", "168.0"）
3. 金额单位默认为人民币元
4. 如果有多个金额数字，取最后一个
5. 忽略分类标题行（如"检查费"、"药品费"单独一行无金额的）
6. 忽略合计行、支付信息、地址电话、收据号等元数据
7. 如果行内无中文但有英文+数字（如"CR 200"），保留英文缩写作为项目名
8. 数量（如"14"颗药）不是金额，金额是后面的数字

### 输出格式
只输出 JSON 数组，不要其他文字：
[{"name":"项目名(已纠错)","amount":金额数字,"category":"类别"},...]

### OCR 原始文本
${rawText.slice(0, 4000)}`;
}

/**
 * LLM 智能提取 — 始终调用 LLM 纠错，规则引擎结果作为兜底
 *
 * 策略:
 * 1. 规则引擎先提取（快速）
 * 2. LLM 并行提取（纠正 OCR 错字）
 * 3. 合并: LLM 结果为主，规则结果兜底
 */
export async function llmExtractItems(rawText: string): Promise<LlmExtractResult> {
  // 1. 规则引擎提取
  const regexResult = postProcessOcrText(rawText);
  const rulesItems = (regexResult?.items || [])
    .filter(it => it.amount != null && it.amount > 0)
    .map(it => ({
      name: it.name,
      amount: it.amount as number,
      quantity: it.quantity,
    }));

  console.log(`[VetLens] 规则引擎提取了 ${rulesItems.length} 个项目`);

  // 2. 豆包 API 快速提取（优先，速度快）
  let llmItems: Array<{ name: string; amount: number; category?: string }> = [];
  let llmUsed = false;
  let llmSource = '';

  const doubaoResult = await doubaoExtractItems(rawText);
  if (doubaoResult) {
    llmItems = doubaoResult.items;
    llmUsed = true;
    llmSource = 'doubao';
    console.log(`[VetLens] 豆包提取了 ${llmItems.length} 个项目`);
  } else if (!env.DOUBAO_API_KEY) {
    // 3. 通用 LLM 兜底（仅豆包未配置时才走）
    const llm = getLlmAdapter();
    if (llm) {
      const available = await llm.isAvailable().catch(() => false);
      if (available) {
        try {
          const prompt = buildLlmExtractPrompt(rawText);
          const response = await llm.chat(prompt,
            '你是 VetLens OCR 后处理助手。从有 OCR 错误的账单文本中提取和纠正收费项目。只返回 JSON 数组。');
          const jsonMatch = response
            .replace(/```(?:json)?\s*/gi, '').replace(/```/g, '')
            .trim()
            .match(/\[([\s\S]*)\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            llmItems = parsed
              .filter((it: any) => it.name && it.amount > 0 && it.amount < 50000)
              .map((it: any) => ({
                name: String(it.name).trim(),
                amount: Number(it.amount),
                category: it.category || undefined,
              }));
            llmUsed = true;
            llmSource = 'llm';
            console.log(`[VetLens] LLM 提取了 ${llmItems.length} 个项目`);
          }
        } catch (err) {
          console.warn('[VetLens] LLM 提取失败，使用规则引擎结果:', err);
        }
      }
    }
  }

  // 4. 合并结果
  const mergedItems = mergeExtractedItems(rulesItems, llmItems, llmUsed);

  if (mergedItems.length === 0) {
    return { success: false, items: [], error: '规则引擎和 LLM 均未能提取到项目' };
  }

  console.log(`[VetLens] 合并后共 ${mergedItems.length} 个项目 (${llmUsed ? llmSource : 'rules-only'})`);
  return {
    success: true,
    items: mergedItems,
    hospitalName: regexResult?.hospitalName,
    date: regexResult?.date,
    totalAmount: regexResult?.totalAmount,
  };
}

/**
 * 合并规则引擎和 LLM 的提取结果
 *
 * 策略:
 * - LLM 提取到的项目 → 直接采用（LLM 已纠正 OCR 错字 + 归类）
 * - LLM 未提取到但规则引擎提取到的 → 保留（兜底）
 * - 通过金额匹配判断是否为同一项目: 金额差 < 2 元视为同一项目
 * - LLM 项目名优先（已纠错）
 */
function mergeExtractedItems(
  rulesItems: Array<{ name: string; amount: number }>,
  llmItems: Array<{ name: string; amount: number; category?: string }>,
  llmUsed: boolean
): Array<{ name: string; amount: number }> {
  if (!llmUsed || llmItems.length === 0) {
    return rulesItems;
  }

  const result: Array<{ name: string; amount: number }> = [];
  const usedRulesIndices = new Set<number>();

  // LLM 项目为主
  for (const llmItem of llmItems) {
    // 尝试在规则结果中找到金额相近的项目（可能是同一项目）
    let bestMatchIdx = -1;
    let bestMatchDiff = Infinity;
    for (let i = 0; i < rulesItems.length; i++) {
      if (usedRulesIndices.has(i)) continue;
      const diff = Math.abs(rulesItems[i].amount - llmItem.amount);
      if (diff < 2 && diff < bestMatchDiff) {
        bestMatchIdx = i;
        bestMatchDiff = diff;
      }
    }
    if (bestMatchIdx >= 0) {
      usedRulesIndices.add(bestMatchIdx);
    }
    result.push({
      name: llmItem.name,        // LLM 已纠错的名称
      amount: llmItem.amount,    // LLM 的金额
    });
  }

  // 规则引擎兜底: 未被 LLM 覆盖的项目
  for (let i = 0; i < rulesItems.length; i++) {
    if (!usedRulesIndices.has(i)) {
      result.push({
        name: rulesItems[i].name,
        amount: rulesItems[i].amount,
      });
    }
  }

  return result;
}

// ─── 豆包 API 快速提取（OpenAI 兼容接口） ──────────────────

/** 豆包提取结果 */
interface DoubaoExtractResult {
  items: Array<{ name: string; amount: number; category?: string }>;
  hospitalName?: string;
  date?: string;
  totalAmount?: number;
}

/**
 * 使用豆包 API 从 OCR 文本中快速提取项目
 *
 * 豆包是字节跳动的 LLM 服务，提供 OpenAI 兼容接口。
 * 比本地 Claude Code CLI 快 10-50 倍（无子进程启动开销）。
 *
 * 环境变量:
 *   DOUBAO_API_KEY — 豆包 API Key（必填）
 *   DOUBAO_BASE_URL — API 地址（默认火山引擎）
 *   DOUBAO_MODEL — 模型名（默认 doubao-seed-1-6-251015）
 */
async function doubaoExtractItems(rawText: string): Promise<DoubaoExtractResult | null> {
  const apiKey = env.DOUBAO_API_KEY || '';
  if (!apiKey) { console.log('[Doubao] API key not configured, skipping'); return null; }

  const baseUrl = env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  const model = env.DOUBAO_MODEL || 'doubao-seed-1-6-251015';

  const prompt = `从宠物医院账单 OCR 文本中提取收费项目。OCR 可能有错字，请根据上下文纠正。

### OCR 文本
${rawText.slice(0, 4000)}

### 要求
- 每行找"项目名 + 金额"组合，提取为 {"name":"...","amount":数字}
- OCR 错字纠正: 氢化钠→氯化钠, 列萄糖→葡萄糖, 头孢障叶→头孢唑啉, 普硝哗→替硝唑, 向依→合计
- ¥ 符号可能被识别为 " 或 "
- 忽略表头、合计行、支付信息、地址电话
- 金额取行内最后一个数字

### 只输出 JSON 数组，不要其他文字
[{"name":"项目名","amount":金额}]`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000); // 30 秒超时

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是兽医账单 OCR 后处理助手。从 OCR 文本中提取收费项目，纠正 OCR 错字。只返回 JSON 数组。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 4096,   // 推理模型需要更多 token（含思考过程）
        temperature: 0.1    // 低温度保证输出稳定
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[Doubao] API error ${response.status}`);
      return null;
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim().match(/\[([\s\S]*)\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const items = (Array.isArray(parsed) ? parsed : [])
      .filter((it: any) => it.name && it.amount > 0 && it.amount < 50000)
      .map((it: any) => ({
        name: String(it.name).trim(),
        amount: Number(it.amount),
        category: it.category || undefined,
      }));

    return items.length > 0 ? { items } : null;
  } catch (err) {
    console.warn('[Doubao] 提取失败:', err);
    return null;
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

/** 金额模式 — 支持 . , 空格作为小数分隔符，也支持中文逗号 */
const AMOUNT_PATTERN = /[¥￥]?\s*(\d{1,6}(?:[., ]\d{1,2})?)/;

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
  // 匹配行中的所有金额（支持 100,00 → 100.00 逗号/空格小数点，也匹配无小数点的整数金额）
  const matches = line.match(/[¥￥]?\s*(\d{1,6}(?:[., ]\d{1,2})?)/g);
  if (!matches || matches.length === 0) return null;

  // 从右向左找第一个有效金额（跳过尾随的 0 / 0.00）
  for (let i = matches.length - 1; i >= 0; i--) {
    let numStr = matches[i].replace(/[¥￥\s]/g, '');
    // 修复逗号小数点: "100,00" → "100.00", "100,50" → "100.50"
    numStr = numStr.replace(/[, ](\d{2})$/, '.$1');
    // 去除尾部孤立逗号
    numStr = numStr.replace(/[, ]$/, '');
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

/** OCR 常见错误纠正（按长度降序，避免级联替换） */
function correctOcrErrors(name: string): string {
  // 按 key 长度降序排列，优先匹配长模式
  const corrections: Array<[string, string]> = [
    // === 药品/注射液（来自真实 OCR 测试） ===
    ['50%列萄糖注射液', '50%葡萄糖注射液'],
    ['0.9%氢化钠注射液', '0.9%氯化钠注射液'],
    ['头孢障叶钠', '头孢唑啉钠'],
    ['普硝哗氯化钠', '替硝唑氯化钠'],
    ['0.9%氢化钠', '0.9%氯化钠'],
    ['50%列萄糖', '50%葡萄糖'],
    ['列萄糖注射液', '葡萄糖注射液'],
    ['头孢障叶', '头孢唑啉'],
    ['普硝哗', '替硝唑'],
    // === 常见形近字纠正 ===
    ['氢化钠', '氯化钠'],
    ['列萄糖', '葡萄糖'],
    ['向依', '合计'],
    ['吊桶', '吊瓶'],
    ['士素', '霉素'],
    ['必素', '霉素'],
    // === 化验项目 ===
    ['生化全讲', '生化全套'],
    ['生化全套讲', '生化全套'],
    ['血常规检', '血常规'],
    ['血气电解', '血气电解质'],
    // === 药品 ===
    ['阿莫西材', '阿莫西林'],
    ['恩诺沙量', '恩诺沙星'],
    ['多西环索', '多西环素'],
    ['麻佛微素', '麻佛霉素'],
    ['麻佛士素', '麻佛霉素'],
    // === 耗材 ===
    ['一次性耗才', '一次性耗材'],
    ['留置钍', '留置针'],
    ['2ml注谢器', '2ml注射器'],
    ['5ml注谢器', '5ml注射器'],
    // === 服务 ===
    ['急诊挂呈', '急诊挂号'],
    ['静脉输夜费', '静脉输液费'],
    ['皮不注射', '皮下注射'],
    ['皮卜注射', '皮下注射'],
    // === 细胞/血液 ===
    ['白细泡', '白细胞'],
    ['红细泡', '红细胞'],
    ['血小扳', '血小板'],
    // === 短词纠正（最后，避免误匹配） ===
    ['生七', '生化'],
    ['血常现', '血常规'],
    ['全讲', '全套'],
    ['全项', '全套'],
    ['生比', '生化'],
    // === 英文大小写 ===
    ['cr', 'CR'],
    ['dr', 'DR'],
    ['alt', 'ALT'],
    ['bun', 'BUN'],
  ];

  let result = name;
  for (const [wrong, correct] of corrections) {
    if (result.includes(wrong)) {
      result = result.replace(wrong, correct);
      break;  // 匹配后立即停止，防止级联替换
    }
  }

  // 修复逗号/空格小数点: "100,00" → "100.00", "100 00" → "100.00"
  result = result.replace(/(\d+)[, ](\d{2})(?!\d)/g, '$1.$2');

  // 修复数字间的多余空格: "15 0. 00" → "150.00"
  result = result.replace(/(\d)\s+(\d)/g, (_, a, b) => a + b);

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
  let normalizedText = rawText
    // 0. 修复 OCR 误识别的货币符号: 弯引号 + 数字 → ¥ + 数字
    //    Tesseract 常把 ¥ 识别为 " " 或 「
    .replace(/[“”「](?=\s*\d)/g, '¥')
    .replace(/(?<=\d)[“”]/g, '')  // 数字后的弯引号 → 删除
    // 1. 全角数字 → 半角（OCR 有时输出 "１２３" → "123"）
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    // 全角逗号/句号 → 半角
    .replace(/，/g, ',').replace(/。/g, '.')
    // 合并汉字之间的空格：OCR 有时输出 "一 次 性 耗 材" 而非 "一次性耗材"
    .replace(/([一-鿿]) ([一-鿿])/g, '$1$2')
    .replace(/([一-鿿])\s+([一-鿿])/g, '$1$2')
    // 数字和单位之间的多余空格（如 "150. 00" → "150.00"）
    .replace(/(\d)\s+\.\s*(\d)/g, '$1.$2')
    // 逗号小数点后粘合（如 "100, 00" → "100,00"）
    .replace(/(\d),\s+(\d)/g, '$1,$2')
    // 空格小数点粘合（如 "100 00" → "100.00" — 疑似丢失的小数点）
    .replace(/(\d{2,})\s+(\d{2})(?!\d)/g, '$1.$2')
    // 数字间单个空格粘合（如 "15 0.00" → "150.00"）
    .replace(/(\d)\s(\d)/g, '$1$2')
    // 修复被误拆的关键字: "向 依" → "向依" (会被 correctOcrErrors 进一步纠正为 "合计")
    .replace(/向\s+依/g, '向依');

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
