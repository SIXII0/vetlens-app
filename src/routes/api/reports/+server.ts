import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getReportList, reportRowToView } from '$lib/server/db/reports';

/** GET /api/reports — 获取报告列表 */
export const GET: RequestHandler = async ({ url }) => {
  const petId = url.searchParams.get('petId') || undefined;
  const reportType = url.searchParams.get('type') || undefined;
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  const { reports, total } = getReportList({ petId, reportType, limit, offset });

  return json({
    reports: reports.map(reportRowToView),
    total,
    limit,
    offset,
  });
};
