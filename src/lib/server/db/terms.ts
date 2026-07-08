import { v4 as uuid } from 'uuid';
import { getDb } from './index';

export interface TermRow {
  id: string;
  name: string;
  aliases: string | null;
  category: string;
  medical_explain: string | null;
  plain_explain: string | null;
  necessity_hint: string | null;
  source: string;
  reviewed_by: string | null;
  created_at: string;
}

/** 批量插入术语 */
export function insertTerms(terms: Omit<TermRow, 'created_at'>[]): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO kb_terms (id, name, aliases, category, medical_explain, plain_explain, necessity_hint, source, reviewed_by)
    VALUES (@id, @name, @aliases, @category, @medical_explain, @plain_explain, @necessity_hint, @source, @reviewed_by)
  `);

  const insertMany = db.transaction((rows: Omit<TermRow, 'created_at'>[]) => {
    let count = 0;
    for (const row of rows) {
      // 序列化 aliases + 补充缺失字段默认值
      stmt.run({
        id: row.id,
        name: row.name,
        aliases: Array.isArray(row.aliases) ? JSON.stringify(row.aliases) : (row.aliases || null),
        category: row.category || '其他',
        medical_explain: row.medical_explain || null,
        plain_explain: row.plain_explain || null,
        necessity_hint: row.necessity_hint || null,
        source: row.source || 'builtin',
        reviewed_by: row.reviewed_by || null
      });
      count++;
    }
    return count;
  });

  const count = insertMany(terms);

  // 手动同步 FTS5 索引（确保 TRIGGER 同步成功）
  try {
    const ftsTerms = terms.map(t => ({
      name: t.name,
      aliases: Array.isArray(t.aliases) ? JSON.stringify(t.aliases) : (t.aliases || ''),
      plain_explain: t.plain_explain || ''
    }));
    rebuildFtsIndex(ftsTerms);
  } catch (e) {
    console.warn('[VetLens] FTS5 索引同步失败，不影响核心功能:', e);
  }

  return count;
}

/** 重建 FTS5 索引 */
function rebuildFtsIndex(terms: Array<{ name: string; aliases: string; plain_explain: string }>) {
  const db = getDb();
  // 清空 FTS 索引
  db.prepare('DELETE FROM kb_terms_fts').run();
  // 重新插入
  const insert = db.prepare(
    'INSERT INTO kb_terms_fts (name, aliases, plain_explain) VALUES (?, ?, ?)'
  );
  const rebuild = db.transaction(() => {
    for (const t of terms) {
      insert.run(t.name, t.aliases, t.plain_explain);
    }
  });
  rebuild();
}

/** FTS5 全文搜索术语 —— 增强版，支持多种查询模式 */
export function searchTerms(query: string, limit = 10): TermRow[] {
  const db = getDb();

  // 先检查 FTS 表是否有数据
  const ftsCount = (db.prepare('SELECT COUNT(*) as cnt FROM kb_terms_fts').get() as { cnt: number }).cnt;
  if (ftsCount === 0) {
    console.warn('[VetLens] FTS5 索引为空，回退到直接 LIKE 查询');
    return fallbackSearch(query, limit);
  }

  // 构建 FTS5 安全查询
  const safeQuery = buildFts5Query(query);

  try {
    const rows = db.prepare(`
      SELECT * FROM kb_terms
      WHERE rowid IN (SELECT rowid FROM kb_terms_fts WHERE kb_terms_fts MATCH ?)
      LIMIT ?
    `).all(safeQuery, limit) as TermRow[];

    if (rows.length > 0) return rows;

    // FTS5 无结果时尝试模糊前缀搜索
    const prefixQuery = safeQuery.replace(/"\s*$/, '*"');
    if (prefixQuery !== safeQuery) {
      const prefixRows = db.prepare(`
        SELECT * FROM kb_terms
        WHERE rowid IN (SELECT rowid FROM kb_terms_fts WHERE kb_terms_fts MATCH ?)
        LIMIT ?
      `).all(prefixQuery, limit) as TermRow[];
      if (prefixRows.length > 0) return prefixRows;
    }

    return [];
  } catch (err) {
    console.warn('[VetLens] FTS5 搜索异常，回退到 LIKE 查询:', err);
    return fallbackSearch(query, limit);
  }
}

/** 构建 FTS5 安全查询字符串 */
function buildFts5Query(query: string): string {
  // 移除 FTS5 特殊字符
  const cleaned = query
    .replace(/['"*()^~@:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '""';

  // 对中文：整体短语匹配
  // 对英文：分词后 OR 匹配
  const hasCJK = /[一-鿿]/.test(cleaned);
  if (hasCJK) {
    // 中文：把查询当作短语，同时拆成单个字做前缀匹配
    const chars = cleaned.replace(/\s/g, '').split('');
    if (chars.length <= 2) {
      // 短查询：使用前缀匹配
      return `"${cleaned}"*`;
    }
    return `"${cleaned}"`;
  }

  // 英文：分词 OR
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  return words.map(w => `"${w}"`).join(' OR ') || '""';
}

/** LIKE 回退搜索（FTS5 不可用时的兜底方案） */
function fallbackSearch(query: string, limit = 10): TermRow[] {
  const db = getDb();
  const likeQuery = `%${query}%`;
  return db.prepare(`
    SELECT * FROM kb_terms
    WHERE name LIKE ? OR aliases LIKE ? OR plain_explain LIKE ?
    ORDER BY
      CASE WHEN name = ? THEN 0
           WHEN name LIKE ? THEN 1
           ELSE 2 END
    LIMIT ?
  `).all(likeQuery, likeQuery, likeQuery, query, `${query}%`, limit) as TermRow[];
}

/** 按 ID 获取术语 */
export function getTermById(id: string): TermRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM kb_terms WHERE id = ?').get(id) as TermRow | undefined;
}

/** 按名称精确获取术语 */
export function getTermByName(name: string): TermRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM kb_terms WHERE name = ?').get(name) as TermRow | undefined;
}

/** 获取所有术语 */
export function getAllTerms(): TermRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM kb_terms ORDER BY category, name').all() as TermRow[];
}

/** 统计术语数量 */
export function countTerms(source?: string): number {
  const db = getDb();
  if (source) {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM kb_terms WHERE source = ?').get(source) as { cnt: number };
    return row.cnt;
  }
  const row = db.prepare('SELECT COUNT(*) as cnt FROM kb_terms').get() as { cnt: number };
  return row.cnt;
}

/** 按来源分页获取术语（用于审核） */
export function getTermsBySource(source: string, limit = 50, offset = 0): TermRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM kb_terms WHERE source = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(source, limit, offset) as TermRow[];
}

/** 审核通过（将术语从 seed_unreviewed/user_contributed 提升为 builtin，可选补充字段） */
export function approveTerm(id: string, reviewer: string, fields?: {
  category?: string;
  plain_explain?: string;
  medical_explain?: string;
  necessity_hint?: string;
}): boolean {
  const db = getDb();
  if (fields && (fields.category || fields.plain_explain || fields.medical_explain || fields.necessity_hint)) {
    const result = db.prepare(`
      UPDATE kb_terms SET source = 'builtin', reviewed_by = ?,
        category = COALESCE(NULLIF(?,''), category),
        plain_explain = COALESCE(NULLIF(?,''), plain_explain),
        medical_explain = COALESCE(NULLIF(?,''), medical_explain),
        necessity_hint = COALESCE(NULLIF(?,''), necessity_hint)
      WHERE id = ? AND source IN ('seed_unreviewed', 'user_contributed')
    `).run(reviewer, fields.category || '', fields.plain_explain || '', fields.medical_explain || '', fields.necessity_hint || '', id);
    return result.changes > 0;
  }
  const result = db.prepare(`
    UPDATE kb_terms SET source = 'builtin', reviewed_by = ?
    WHERE id = ? AND source IN ('seed_unreviewed', 'user_contributed')
  `).run(reviewer, id);
  return result.changes > 0;
}

/** 删除术语 */
export function deleteTerm(id: string): boolean {
  const db = getDb();
  // 先从 FTS5 删除
  const term = db.prepare('SELECT rowid FROM kb_terms WHERE id = ?').get(id) as { rowid: number } | undefined;
  if (term) {
    db.prepare('DELETE FROM kb_terms_fts WHERE rowid = ?').run(term.rowid);
  }
  const result = db.prepare('DELETE FROM kb_terms WHERE id = ?').run(id);
  return result.changes > 0;
}

/** 插入未知术语（用户贡献） */
export function insertUnknownTerm(name: string, category = '其他'): string {
  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT OR IGNORE INTO kb_terms (id, name, category, source, plain_explain)
    VALUES (?, ?, ?, 'user_contributed', '待审核')
  `).run(id, name, category);
  return id;
}

/** 获取所有 source 值及其计数 */
export function getSourceCounts(): Array<{ source: string; count: number }> {
  const db = getDb();
  return db.prepare('SELECT source, COUNT(*) as count FROM kb_terms GROUP BY source ORDER BY count DESC').all() as Array<{ source: string; count: number }>;
}
