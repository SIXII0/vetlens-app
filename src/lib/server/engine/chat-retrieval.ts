import { searchTerms } from '$lib/server/db/terms';

export interface KnowledgeHit {
  title: string;
  category?: string;
  snippet: string;
  source?: string;
}

/** 使用FTS5搜索知识库，返回最多5条命中 */
export function retrieveKnowledgeForChat(query: string): KnowledgeHit[] {
  const results = searchTerms(query, 5);
  return results.map(r => ({
    title: r.name,
    category: r.category || undefined,
    snippet: r.plain_explain || r.medical_explain || '暂无详细解释',
    source: '知识库',
  }));
}
