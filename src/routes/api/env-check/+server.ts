import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async () => {
  return json({
    LLM_PROVIDER: env.LLM_PROVIDER || 'NOT SET',
    OPENAI_API_KEY_exists: !!env.OPENAI_API_KEY,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL || 'NOT SET',
    OPENAI_MODEL: env.OPENAI_MODEL || 'NOT SET',
    AMAP_WEB_KEY: env.AMAP_WEB_KEY || '',
  });
};
