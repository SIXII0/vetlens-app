import Database from 'better-sqlite3';
import path from 'path';
import { SCHEMA_SQL } from './schema';
import { env } from '$env/dynamic/private';

let _db: Database.Database | null = null;
let _dbPath: string | null = null;

function resolveDbPath(): string {
  // 在运行时解析路径（确保 .env 已加载）
  return env.VETLENS_DB_PATH
    || (env.DATA_DIR ? path.join(env.DATA_DIR, 'vetlens.db') : path.join(process.cwd(), 'data', 'vetlens.db'));
}

export function getDb(): Database.Database {
  if (!_db) {
    _dbPath = resolveDbPath();
    console.log(`[VetLens] 数据库路径: ${_dbPath}`);
    _db = new Database(_dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('busy_timeout = 5000');

    // 执行建表
    _db.exec(SCHEMA_SQL);
  }
  return _db;
}

export function getDbPath(): string {
  return _dbPath || resolveDbPath();
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    _dbPath = null;
  }
}

/** 用于测试的内存数据库 */
export function createMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}
