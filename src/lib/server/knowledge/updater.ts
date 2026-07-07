/**
 * 知识库更新器 —— 支持增量更新知识库
 */
import fs from 'fs';
import path from 'path';
import { getDb } from '../db/index';

const DATA_DIR = path.join(process.cwd(), 'data');

/** 检查 data/ 目录中 JSON 文件的修改时间，增量更新 */
export async function checkAndUpdate(): Promise<{ updated: string[] }> {
  const updated: string[] = [];
  const db = getDb();

  // 检查各 JSON 文件最后修改时间
  const files = ['terms.json', 'prices.json', 'drugs.json', 'breeds.json', 'hospitals.json'];

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    const stat = fs.statSync(filePath);
    const mtime = stat.mtime.toISOString();

    // 检查 meta 表记录的最后更新时间
    const meta = db.prepare(
      'SELECT value FROM kb_meta WHERE key = ?'
    ).get(`last_update_${file}`) as { value: string } | undefined;

    if (!meta || meta.value < mtime) {
      updated.push(file);
      db.prepare(
        'INSERT OR REPLACE INTO kb_meta (key, value) VALUES (?, ?)'
      ).run(`last_update_${file}`, mtime);
    }
  }

  return { updated };
}

/** 建立 meta 表 */
export function initMetaTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}
