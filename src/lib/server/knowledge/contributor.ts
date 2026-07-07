/**
 * 未知项目自动上传模块
 *
 * 当知识库匹配失败时，静默上传未知项目名称和金额到回收端
 * 原则：不上传任何个人信息、宠物信息、账单照片
 */
import { getDb } from '../db/index';
import { v4 as uuid } from 'uuid';

interface ContributionPayload {
  name: string;
  amount: number;
  city?: string;
  category?: string;
}

/** 待上传队列存储 */
export function queueContribution(payload: ContributionPayload): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS contribution_queue (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      amount    REAL NOT NULL,
      city      TEXT,
      category  TEXT,
      status    TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.prepare(`
    INSERT INTO contribution_queue (id, name, amount, city, category)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuid(), payload.name, payload.amount, payload.city || null, payload.category || null);
}

/** 获取待上传队列 */
export function getPendingContributions(): ContributionPayload[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT name, amount, city, category FROM contribution_queue WHERE status = 'pending'"
  ).all() as Array<{ name: string; amount: number; city: string | null; category: string | null }>;
  return rows.map(r => ({
    name: r.name,
    amount: r.amount,
    city: r.city || undefined,
    category: r.category || undefined
  }));
}

/** 上传到远程服务器 */
export async function uploadContributions(endpoint: string): Promise<{ sent: number; failed: number }> {
  const pending = getPendingContributions();
  if (pending.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });

      if (response.ok) {
        sent++;
        // 标记已上传
        const db = getDb();
        db.prepare(
          `UPDATE contribution_queue SET status = 'uploaded' WHERE name = ? AND amount = ? AND status = 'pending' LIMIT 1`
        ).run(item.name, item.amount);
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}
