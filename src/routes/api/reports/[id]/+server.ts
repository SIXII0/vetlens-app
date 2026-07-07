import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getReportById, deleteReport, reportRowToView } from '$lib/server/db/reports';

/** GET /api/reports/[id] — 获取单份报告 */
export const GET: RequestHandler = async ({ params }) => {
  const row = getReportById(params.id);
  if (!row) {
    return json({ error: '报告不存在' }, { status: 404 });
  }

  return json(reportRowToView(row));
};

/** DELETE /api/reports/[id] — 删除报告 */
export const DELETE: RequestHandler = async ({ params }) => {
  const deleted = deleteReport(params.id);
  if (!deleted) {
    return json({ error: '报告不存在' }, { status: 404 });
  }

  return json({ ok: true });
};
