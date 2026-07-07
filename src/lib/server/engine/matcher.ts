/**
 * 知识库匹配引擎 —— 多层级匹配策略
 *
 * 第一层：SQLite FTS5 全文搜索（精确名称或别名匹配）
 * 第二层：编辑距离（Levenshtein）模糊匹配（OCR 识别偏差容错）
 * 第三层：LLM 语义匹配（可选，仅在前两层都失败时调用）
 */
import { searchTerms, getAllTerms, type TermRow } from '../db/terms';
import type { TermMatch } from './types';

/** Levenshtein 编辑距离 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

/** 字符串相似度 (0-1) */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** 子串匹配检查 */
function containsSubstring(haystack: string, needle: string): boolean {
  return haystack.includes(needle) || needle.includes(haystack);
}

/** 归一化文本（用于比较） */
function normalize(text: string): string {
  return text
    .replace(/[（）()\s\-_.,，。、·]+/g, '')
    .replace(/检查|检测|治疗|费$|费用|测定|测量/g, '')
    .toLowerCase()
    .trim();
}

/** 将 TermRow 转为 TermMatch */
function toTermMatch(term: TermRow, confidence: number, matchMethod: TermMatch['matchMethod']): TermMatch {
  return {
    termId: term.id,
    name: term.name,
    aliases: term.aliases ? JSON.parse(term.aliases) : [],
    category: term.category,
    medicalExplain: term.medical_explain || '',
    plainExplain: term.plain_explain || '',
    necessityHint: (term.necessity_hint as TermMatch['necessityHint']) || '🟢 可选',
    confidence: Math.min(confidence, 1.0),
    matchMethod
  };
}

/**
 * 第一层：FTS5 全文匹配
 */
function matchFTS5(query: string, limit = 5): TermMatch[] {
  const results = searchTerms(query, limit);
  if (results.length === 0) return [];

  return results.map(r => {
    const queryNorm = normalize(query);
    const nameNorm = normalize(r.name);
    const aliasesStr = r.aliases || '';
    const plainNorm = normalize(r.plain_explain || '');

    // 多种方式计算置信度
    const nameSim = similarity(queryNorm, nameNorm);
    const aliasSim = aliasesStr ? similarity(queryNorm, normalize(aliasesStr)) : 0;
    const plainSim = plainNorm ? similarity(queryNorm, plainNorm) : 0;

    // 子串匹配加分
    const substringBonus = (
      containsSubstring(nameNorm, queryNorm) ||
      containsSubstring(aliasesStr, queryNorm) ||
      containsSubstring(r.name, query)
    ) ? 0.2 : 0;

    // 综合置信度
    const baseConf = Math.max(nameSim, aliasSim, plainSim);
    const conf = Math.min(baseConf + 0.3 + substringBonus, 1.0);

    return toTermMatch(r, conf, 'fts5');
  });
}

/**
 * 第二层：编辑距离模糊匹配
 */
function matchLevenshtein(query: string, threshold = 0.35): TermMatch[] {
  const allTerms = getAllTerms();
  if (allTerms.length === 0) return [];

  const queryNorm = normalize(query);
  if (queryNorm.length === 0) return [];

  const results: { term: TermRow; sim: number }[] = [];

  for (const term of allTerms) {
    const nameNorm = normalize(term.name);
    const sim = similarity(queryNorm, nameNorm);

    // 别名匹配
    let aliasSim = 0;
    if (term.aliases) {
      try {
        const aliases: string[] = JSON.parse(term.aliases);
        aliasSim = Math.max(...aliases.map(a => similarity(queryNorm, normalize(a))));
      } catch { /* ignore */ }
    }

    // 子串包含检查
    const subBonus = (containsSubstring(nameNorm, queryNorm) ||
                      containsSubstring(term.name, query)) ? 0.15 : 0;

    const bestSim = Math.min(Math.max(sim, aliasSim) + subBonus, 1.0);
    if (bestSim >= threshold) {
      results.push({ term, sim: bestSim });
    }
  }

  results.sort((a, b) => b.sim - a.sim);
  return results.slice(0, 5).map(r => toTermMatch(r.term, r.sim, 'levenshtein'));
}

/**
 * 主匹配函数 —— 级联多级匹配策略
 */
export function matchTerm(rawName: string): TermMatch | null {
  if (!rawName || rawName.trim().length === 0) return null;

  const query = rawName.trim();
  console.log(`[VetLens] 匹配术语: "${query}"`);

  // 第一层：FTS5 全文搜索
  const fts5Results = matchFTS5(query);
  if (fts5Results.length > 0) {
    const best = fts5Results[0];
    console.log(`[VetLens] FTS5 最佳匹配: "${best.name}" (置信度: ${(best.confidence * 100).toFixed(0)}%)`);
    if (best.confidence >= 0.6) {
      return best;
    }
  }

  // 第二层：编辑距离模糊匹配
  const fuzzyResults = matchLevenshtein(query);
  if (fuzzyResults.length > 0) {
    const best = fuzzyResults[0];
    console.log(`[VetLens] 模糊匹配: "${best.name}" (置信度: ${(best.confidence * 100).toFixed(0)}%)`);
    if (best.confidence >= 0.35) {
      return best;
    }
  }

  // FTS5 低置信度兜底
  if (fts5Results.length > 0) {
    console.log(`[VetLens] 低置信度匹配: "${fts5Results[0].name}"`);
    return { ...fts5Results[0], matchMethod: 'fts5' };
  }

  // 模糊匹配低置信度兜底
  if (fuzzyResults.length > 0) {
    console.log(`[VetLens] 模糊低置信度匹配: "${fuzzyResults[0].name}"`);
    return { ...fuzzyResults[0], matchMethod: 'levenshtein' };
  }

  // 所有层都失败
  console.log(`[VetLens] 未匹配到术语: "${query}"`);
  return null;
}

/**
 * 批量匹配
 */
export function matchTerms(rawNames: string[]): Map<string, TermMatch | null> {
  const result = new Map<string, TermMatch | null>();
  for (const name of rawNames) {
    result.set(name, matchTerm(name));
  }
  return result;
}
