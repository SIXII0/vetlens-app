import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRecords, getRecordById, deleteRecord } from '$lib/server/db/records';

export const GET: RequestHandler = async ({ url }) => {
  const petId = url.searchParams.get('petId') || undefined;
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const status = url.searchParams.get('status') || undefined;

  const { records, total } = getRecords({ petId, limit, offset, status });
  return json({ records, total });
};

export const DELETE: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return json({ error: '缺少记录ID' }, { status: 400 });
  }

  const deleted = deleteRecord(id);
  if (deleted) {
    return json({ success: true });
  }
  return json({ error: '记录不存在' }, { status: 404 });
};
