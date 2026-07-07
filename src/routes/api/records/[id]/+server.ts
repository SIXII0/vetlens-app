import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRecordById } from '$lib/server/db/records';

export const GET: RequestHandler = async ({ params }) => {
  const record = getRecordById(params.id);

  if (!record) {
    return json({ error: '记录不存在' }, { status: 404 });
  }

  return json(record);
};
