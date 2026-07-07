import { v4 as uuid } from 'uuid';
import { getDb } from './index';
import type { ReportManifest, QaResult, ReportType, ReportResult } from '../engine/reporter';

export interface ReportRow {
  id: string;
  record_id: string | null;
  pet_id: string | null;
  report_type: string;
  title: string;
  pet_name: string | null;
  report_md: string;
  report_tex: string | null;
  report_pdf: string | null;
  manifest_json: string;
  qa_result_json: string;
  created_at: string;
}

/** 保存报告 */
export function saveReport(report: ReportResult & {
  recordId?: string;
  petId?: string;
}): ReportRow {
  const db = getDb();
  const id = report.reportId;
  db.prepare(`
    INSERT OR REPLACE INTO reports (id, record_id, pet_id, report_type, title, pet_name, report_md, report_tex, report_pdf, manifest_json, qa_result_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    report.recordId || null,
    report.petId || null,
    report.reportType,
    report.title,
    report.manifest.petName,
    report.markdown,
    null,  // report_tex — reserved for LaTeX pipeline
    null,  // report_pdf — reserved for PDF compilation
    JSON.stringify(report.manifest),
    JSON.stringify(report.qaResult)
  );

  return db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as ReportRow;
}

/** 根据 ID 获取报告 */
export function getReportById(id: string): ReportRow | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as ReportRow) || null;
}

/** 根据就诊记录 ID 获取关联报告 */
export function getReportsByRecordId(recordId: string): ReportRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM reports WHERE record_id = ? ORDER BY created_at DESC'
  ).all(recordId) as ReportRow[];
}

/** 获取报告列表 */
export function getReportList(options: {
  petId?: string;
  reportType?: string;
  limit?: number;
  offset?: number;
} = {}): { reports: ReportRow[]; total: number } {
  const db = getDb();
  const { petId, reportType, limit = 20, offset = 0 } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (petId) {
    conditions.push('pet_id = ?');
    params.push(petId);
  }
  if (reportType) {
    conditions.push('report_type = ?');
    params.push(reportType);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) as cnt FROM reports ${where}`).get(...params) as { cnt: number }
  ).cnt;

  const reports = db.prepare(
    `SELECT * FROM reports ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as ReportRow[];

  return { reports, total };
}

/** 删除报告 */
export function deleteReport(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM reports WHERE id = ?').run(id);
  return result.changes > 0;
}

/** 更新报告的 LaTeX/PDF 路径 */
export function updateReportArtifacts(
  id: string,
  texContent?: string,
  pdfPath?: string
): void {
  const db = getDb();
  if (texContent) {
    db.prepare('UPDATE reports SET report_tex = ? WHERE id = ?').run(texContent, id);
  }
  if (pdfPath) {
    db.prepare('UPDATE reports SET report_pdf = ? WHERE id = ?').run(pdfPath, id);
  }
}

/** 解析报告行为前端可用的格式 */
export function reportRowToView(row: ReportRow): {
  id: string;
  recordId: string | null;
  reportType: ReportType;
  title: string;
  petName: string;
  markdown: string;
  manifest: ReportManifest;
  qaResult: QaResult;
  hasTex: boolean;
  hasPdf: boolean;
  createdAt: string;
} {
  let manifest: ReportManifest;
  let qaResult: QaResult;
  try {
    manifest = JSON.parse(row.manifest_json);
  } catch {
    manifest = {
      reportId: row.id,
      reportType: row.report_type as ReportType,
      petName: row.pet_name || '未知',
      title: row.title,
      generatedAt: row.created_at,
      materialCount: 0,
      routingReason: '',
    };
  }
  try {
    qaResult = JSON.parse(row.qa_result_json);
  } catch {
    qaResult = { passed: false, checks: [], warnings: ['QA 数据解析失败'] };
  }

  return {
    id: row.id,
    recordId: row.record_id,
    reportType: row.report_type as ReportType,
    title: row.title,
    petName: row.pet_name || '未知',
    markdown: row.report_md,
    manifest,
    qaResult,
    hasTex: !!row.report_tex,
    hasPdf: !!row.report_pdf,
    createdAt: row.created_at,
  };
}
