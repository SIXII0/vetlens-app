export const SCHEMA_SQL = `
-- 宠物档案
CREATE TABLE IF NOT EXISTS pets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  species     TEXT NOT NULL,
  breed       TEXT,
  gender      TEXT,
  birth_date  TEXT,
  weight_kg   REAL,
  avatar_path TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- 就诊记录
CREATE TABLE IF NOT EXISTS records (
  id            TEXT PRIMARY KEY,
  pet_id        TEXT REFERENCES pets(id) ON DELETE SET NULL,
  hospital_name TEXT,
  hospital_city TEXT,
  visit_date    TEXT NOT NULL,
  visit_reason  TEXT,
  diagnosis     TEXT,
  total_amount  REAL NOT NULL,
  image_paths   TEXT,
  raw_ocr_text  TEXT,
  status        TEXT DEFAULT 'draft',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_records_pet ON records(pet_id);
CREATE INDEX IF NOT EXISTS idx_records_date ON records(visit_date);

-- 费用明细项
CREATE TABLE IF NOT EXISTS line_items (
  id            TEXT PRIMARY KEY,
  record_id     TEXT REFERENCES records(id) ON DELETE CASCADE,
  item_order    INTEGER,
  raw_name      TEXT NOT NULL,
  category      TEXT,
  amount        REAL NOT NULL,
  matched_term  TEXT,
  confidence    REAL,
  explanation   TEXT,
  necessity     TEXT,
  price_level   TEXT,
  is_unknown    INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_record ON line_items(record_id);

-- 保单
CREATE TABLE IF NOT EXISTS insurance_policies (
  id                TEXT PRIMARY KEY,
  pet_id            TEXT REFERENCES pets(id) ON DELETE SET NULL,
  company           TEXT NOT NULL,
  product_name      TEXT NOT NULL,
  policy_number     TEXT,
  effective_date    TEXT,
  expiry_date       TEXT,
  waiting_period    INTEGER,
  deductible        REAL,
  reimbursement_rate REAL,
  annual_limit      REAL,
  raw_terms_text    TEXT,
  structured_terms  TEXT,
  status            TEXT DEFAULT 'active',
  created_at        TEXT DEFAULT (datetime('now'))
);

-- 知识库-术语
CREATE TABLE IF NOT EXISTS kb_terms (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  aliases         TEXT,
  category        TEXT NOT NULL,
  medical_explain TEXT,
  plain_explain   TEXT,
  necessity_hint  TEXT,
  source          TEXT DEFAULT 'builtin',
  reviewed_by     TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT
);

-- 知识库-价格参考
CREATE TABLE IF NOT EXISTS kb_prices (
  id            TEXT PRIMARY KEY,
  term_id       TEXT REFERENCES kb_terms(id) ON DELETE CASCADE,
  city          TEXT NOT NULL,
  hospital_type TEXT,
  p10           REAL,
  p50           REAL,
  p90           REAL,
  sample_count  INTEGER DEFAULT 0,
  source        TEXT DEFAULT 'public',
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prices_term ON kb_prices(term_id);
CREATE INDEX IF NOT EXISTS idx_prices_city ON kb_prices(city);

-- 知识库-药品
CREATE TABLE IF NOT EXISTS kb_drugs (
  id                 TEXT PRIMARY KEY,
  term_id            TEXT REFERENCES kb_terms(id) ON DELETE CASCADE,
  generic_name       TEXT NOT NULL,
  brand_names        TEXT,
  indications        TEXT,
  common_dosage      TEXT,
  hospital_price_min REAL,
  hospital_price_max REAL,
  online_price_min   REAL,
  online_price_max   REAL,
  prescription_only  INTEGER DEFAULT 1,
  notes              TEXT
);

-- 知识库-品种疾病关联
CREATE TABLE IF NOT EXISTS kb_breed_diseases (
  id                   TEXT PRIMARY KEY,
  species              TEXT NOT NULL,
  breed                TEXT NOT NULL,
  disease              TEXT NOT NULL,
  risk_level           TEXT,
  screening            TEXT,
  screening_cost_range TEXT
);

-- 医院信息
CREATE TABLE IF NOT EXISTS hospitals (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  city                TEXT NOT NULL,
  district            TEXT,
  address             TEXT,
  phone               TEXT,
  type                TEXT,
  transparency_score  REAL,
  rating              REAL,
  price_level         TEXT,
  lat                 REAL,
  lng                 REAL,
  source              TEXT DEFAULT 'public',
  created_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hospitals_city ON hospitals(city);

-- 全文搜索 (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS kb_terms_fts USING fts5(
  name,
  aliases,
  plain_explain,
  content='kb_terms',
  content_rowid='rowid'
);

-- 报告
CREATE TABLE IF NOT EXISTS reports (
  id            TEXT PRIMARY KEY,
  record_id     TEXT REFERENCES records(id) ON DELETE SET NULL,
  pet_id        TEXT REFERENCES pets(id) ON DELETE SET NULL,
  report_type   TEXT NOT NULL,
  title         TEXT NOT NULL,
  pet_name      TEXT,
  report_md     TEXT NOT NULL,
  report_tex    TEXT,
  report_pdf    TEXT,
  manifest_json TEXT NOT NULL,
  qa_result_json TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_record ON reports(record_id);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);

-- 触发器: 保持 FTS 索引同步
CREATE TRIGGER IF NOT EXISTS kb_terms_ai AFTER INSERT ON kb_terms BEGIN
  INSERT INTO kb_terms_fts(rowid, name, aliases, plain_explain)
  VALUES (new.rowid, new.name, new.aliases, new.plain_explain);
END;

CREATE TRIGGER IF NOT EXISTS kb_terms_ad AFTER DELETE ON kb_terms BEGIN
  INSERT INTO kb_terms_fts(kb_terms_fts, rowid, name, aliases, plain_explain)
  VALUES ('delete', old.rowid, old.name, old.aliases, old.plain_explain);
END;

CREATE TRIGGER IF NOT EXISTS kb_terms_au AFTER UPDATE ON kb_terms BEGIN
  INSERT INTO kb_terms_fts(kb_terms_fts, rowid, name, aliases, plain_explain)
  VALUES ('delete', old.rowid, old.name, old.aliases, old.plain_explain);
  INSERT INTO kb_terms_fts(rowid, name, aliases, plain_explain)
  VALUES (new.rowid, new.name, new.aliases, new.plain_explain);
END;

-- 健康评分记录
CREATE TABLE IF NOT EXISTS health_scores (
  id            TEXT PRIMARY KEY,
  pet_id        TEXT REFERENCES pets(id) ON DELETE CASCADE,
  test_date     TEXT NOT NULL,
  species       TEXT NOT NULL DEFAULT '猫',
  -- 肾功能 (32%)
  bun           REAL,   -- 尿素氮 mmol/L
  crea          REAL,   -- 肌酐 μmol/L
  -- 血糖+胰腺 (28%)
  glu           REAL,   -- 血糖 mmol/L
  amy           REAL,   -- 淀粉酶 U/L (猫) / 胰脂肪酶 (狗)
  -- 血常规 (30%)
  wbc           REAL,   -- 白细胞 10^9/L
  rbc           REAL,   -- 红细胞 10^12/L
  hct           REAL,   -- 红细胞比容 %
  -- 评分结果
  kidney_score      REAL,  -- 肾功能得分 0-100
  pancreas_score    REAL,  -- 血糖+胰腺得分 0-100
  cbc_score         REAL,  -- 血常规得分 0-100
  weight_score      REAL,  -- 体重评分 0-100
  age_score         REAL,  -- 年龄评分 0-100
  overall_score     REAL,  -- 加权综合得分 0-100
  grade              TEXT,  -- A+/A/B/C/D
  notes         TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_health_pet ON health_scores(pet_id);
CREATE INDEX IF NOT EXISTS idx_health_date ON health_scores(test_date);

-- 疫苗/驱虫日历
CREATE TABLE IF NOT EXISTS vaccine_schedule (
  id            TEXT PRIMARY KEY,
  pet_id        TEXT REFERENCES pets(id) ON DELETE CASCADE,
  vaccine_type  TEXT NOT NULL,  -- '三联','狂犬','驱虫-体内','驱虫-体外' 等
  species       TEXT NOT NULL DEFAULT '猫',
  date_given    TEXT NOT NULL,
  next_date     TEXT NOT NULL,
  notes         TEXT,
  status        TEXT DEFAULT 'upcoming',  -- 'done'/'upcoming'/'overdue'
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vaccine_pet ON vaccine_schedule(pet_id);

-- 用药提醒
CREATE TABLE IF NOT EXISTS medication_reminders (
  id            TEXT PRIMARY KEY,
  pet_id        TEXT REFERENCES pets(id) ON DELETE CASCADE,
  med_name      TEXT NOT NULL,
  dosage        TEXT,           -- 如 '2.5mg/kg'
  frequency     TEXT NOT NULL,  -- '每天'/'每12小时'/'每周' 等
  start_date    TEXT NOT NULL,
  end_date      TEXT,           -- null = 长期
  last_given    TEXT,
  next_due      TEXT NOT NULL,
  notes         TEXT,
  active        INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_med_pet ON medication_reminders(pet_id);
`;
