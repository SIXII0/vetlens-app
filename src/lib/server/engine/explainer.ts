/**
 * 分析引擎 —— 知识库匹配 + 可选 LLM 增强
 *
 * 核心流水线（始终运行，不依赖 LLM）：
 *   上传项目 → 知识库匹配 → 价格评估 → 必要性判断 → 解释生成
 *
 * LLM 增强（可选，仅在以下情况触发）：
 *   ① 知识库匹配失败 → LLM 推断解释
 *   ② 用户主动选择"AI 增强" → LLM 润色所有解释
 *   ③ 生成综合评估摘要
 */
import type { AnalyzedItem, AnalysisInput, AnalysisResult, AnalysisSummary, BillItem } from './types';
import { matchTerm } from './matcher';
import { evaluatePrice } from './price';
import type { LlmAdapter } from '../llm/index';
import { v4 as uuid } from 'uuid';

/** 分析整个账单 */
export async function analyzeBill(
  input: AnalysisInput,
  llm?: LlmAdapter | null
): Promise<AnalysisResult> {
  const items: AnalyzedItem[] = [];
  const city = input.city || '北京';
  const hasLlm = llm && await llm.isAvailable().catch(() => false);

  // 收集未知项目（用于后续 LLM 批量推断）
  const unknownItems: { index: number; item: BillItem }[] = [];

  for (let i = 0; i < input.items.length; i++) {
    const billItem = input.items[i];
    const result = analyzeSingleItem(billItem, city, input.hospitalType);
    items.push(result);

    if (result.isUnknown) {
      unknownItems.push({ index: i, item: billItem });
    }
  }

  // LLM 增强：批量推断未知项目
  if (hasLlm && unknownItems.length > 0 && llm) {
    await enhanceUnknownItems(items, unknownItems, llm, city, input.hospitalName);
  }

  // 生成摘要
  const summary = generateSummary(items, hasLlm);

  return {
    id: uuid(),
    items,
    totalAmount: input.totalAmount || input.items.reduce((sum, item) => sum + item.amount, 0),
    city,
    hospitalName: input.hospitalName,
    visitDate: input.visitDate,
    summary
  };
}

/** 分析单个项目（纯规则引擎） */
function analyzeSingleItem(billItem: BillItem, city: string, hospitalType?: string): AnalyzedItem {
  const termMatch = matchTerm(billItem.rawName);

  let priceAssessment = null;
  if (termMatch) {
    priceAssessment = evaluatePrice(termMatch, billItem.amount, city, hospitalType);
  }

  const necessity = termMatch?.necessityHint || '🟡 待确认';
  const explanation = generateExplanation(billItem, termMatch, priceAssessment);
  const category = billItem.category || termMatch?.category || '其他';

  return {
    rawName: billItem.rawName,
    amount: billItem.amount,
    category,
    termMatch,
    priceAssessment,
    necessity,
    explanation,
    isUnknown: !termMatch,
    unknownReason: !termMatch ? '知识库中未找到匹配的术语' : undefined
  };
}

/** LLM 增强：批量推断未知项目 */
async function enhanceUnknownItems(
  items: AnalyzedItem[],
  unknownList: { index: number; item: BillItem }[],
  llm: LlmAdapter,
  city: string,
  hospitalName?: string
): Promise<void> {
  const unknownNames = unknownList.map(u => `- ${u.item.rawName} (¥${u.item.amount.toFixed(2)})`).join('\n');

  const prompt = `以下是中国宠物医院账单中的未知收费项目（不在现有知识库中），请为每个项目提供简洁的通俗解释（1-2句话），并推断其可能属于哪个类别（检查/药品/治疗/手术/耗材/服务/预防/其他）：

所在城市: ${city || '未知'}
${hospitalName ? `医院: ${hospitalName}` : ''}

项目列表:
${unknownNames}

请按以下格式对每个项目回复（纯文本，不要用 markdown 代码块）：
项目名: <通俗解释> | 类别: <类别> | 必要性倾向: <必做/建议做/可选/待确认>`;

  try {
    const response = await llm.chat(prompt, `你是 VetLens 的宠物医疗知识助手。你帮助宠物主人理解兽医账单上的收费项目含义。请用简洁的中文回答，每个项目不超过2句话。不要提供医疗建议或替代诊断。`);
    const parsedResults = parseLlmResponse(response);

    // 将 LLM 推断结果合并到分析结果中
    for (const unknown of unknownList) {
      const item = items[unknown.index];
      const llmResult = parsedResults.find(r =>
        r.name && unknown.item.rawName.includes(r.name)
      );

      if (llmResult) {
        item.explanation = `[AI 推断] ${llmResult.explanation || item.explanation}`;
        if (llmResult.category) item.category = llmResult.category;
        if (llmResult.necessity) item.necessity = llmResult.necessity;
      } else {
        // 通用 AI 推断
        item.explanation = `[AI 推断] "${unknown.item.rawName}"为 ¥${unknown.item.amount.toFixed(2)}。` +
          `建议向兽医确认该项目的临床必要性。${item.explanation}`;
      }
    }
  } catch (err) {
    console.warn('[VetLens] LLM 增强失败，保留原始匹配结果:', err);
    // LLM 失败不影响核心功能
  }
}

/** 解析 LLM 返回的文本 */
function parseLlmResponse(text: string): Array<{
  name: string; explanation: string; category?: string; necessity?: string;
}> {
  const results: Array<{ name: string; explanation: string; category?: string; necessity?: string }> = [];
  const lines = text.split('\n').filter(l => l.trim());

  for (const line of lines) {
    const match = line.match(/^(.+?)[：:]\s*(.+)/);
    if (!match) continue;

    const name = match[1].trim();
    const detail = match[2].trim();

    // 解析 "解释 | 类别: xxx | 必要性: xxx"
    const parts = detail.split('|').map(p => p.trim());
    const result: { name: string; explanation: string; category?: string; necessity?: string } = {
      name,
      explanation: parts[0] || detail
    };

    for (const part of parts.slice(1)) {
      if (part.startsWith('类别')) result.category = part.replace('类别:', '').replace('类别：', '').trim();
      if (part.startsWith('必要性')) result.necessity = part.replace('必要性倾向:', '').replace('必要性:', '').trim();
    }

    results.push(result);
  }

  return results;
}

/** 生成解释文本 */
function generateExplanation(
  billItem: BillItem,
  termMatch: ReturnType<typeof matchTerm>,
  priceAssessment: ReturnType<typeof evaluatePrice>
): string {
  if (termMatch) {
    let base = termMatch.plainExplain || termMatch.medicalExplain || '';
    if (priceAssessment) {
      base += `\n${priceAssessment.message}`;
    }
    return base;
  }

  return `"${billItem.rawName}"在知识库中暂未收录。该项收费 ¥${billItem.amount.toFixed(2)}。建议向兽医询问该项的具体临床必要性和替代选项。`;
}

/** 生成分析摘要 */
function generateSummary(items: AnalyzedItem[], hasLlm: boolean): AnalysisSummary {
  const totalItems = items.length;
  const matchedItems = items.filter(it => !it.isUnknown).length;
  const unknownItems = items.filter(it => it.isUnknown).length;
  const priceOkItems = items.filter(it => it.priceAssessment?.level === '合理').length;
  const priceWarningItems = items.filter(it => it.priceAssessment?.level === '略高').length;
  const priceHighItems = items.filter(it => it.priceAssessment?.level === '偏高').length;

  let overallAssessment: string;
  const aiTag = hasLlm ? '（含 AI 增强分析）' : '';

  if (matchedItems === totalItems && priceHighItems === 0) {
    overallAssessment = `✅ 全部 ${totalItems} 项均在知识库中匹配成功，价格在常见区间内。${aiTag}`;
  } else if (unknownItems === 0 && priceHighItems <= 1) {
    overallAssessment = `⚠️ 全部匹配成功，但有项目价格略高，详见逐项解读。${aiTag}`;
  } else if (unknownItems > 0) {
    overallAssessment = `🔍 ${matchedItems}/${totalItems} 项已匹配知识库，${unknownItems} 项未识别${hasLlm ? '（已用 AI 推断）' : ''}。建议核实未识别项目的必要性。`;
  } else {
    overallAssessment = `⚠️ 所有项目均未匹配到知识库。${hasLlm ? '已使用 AI 进行推断解释，' : ''}建议联系兽医核实每项费用的临床必要性。`;
  }

  return {
    totalItems,
    matchedItems,
    unknownItems,
    priceOkItems,
    priceHighItems,
    priceWarningItems,
    overallAssessment
  };
}
