import Database from 'better-sqlite3';
import path from 'path';
import { SCHEMA_SQL } from './schema';

const DB_PATH = process.env.VETLENS_DB_PATH || path.join(process.cwd(), 'data', 'vetlens.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = DB_PATH;
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('busy_timeout = 5000');

    // 执行建表
    _db.exec(SCHEMA_SQL);
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** 用于测试的内存数据库 */
export function createMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}
