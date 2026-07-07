import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json({
    LLM_PROVIDER: process.env.LLM_PROVIDER || 'NOT SET',
    OPENAI_API_KEY_exists: !!process.env.OPENAI_API_KEY,
    OPENAI_API_KEY_prefix: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 10) + '...' : 'NONE',
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || 'NOT SET',
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'NOT SET',
    // Also check Vite-prefixed versions
    VITE_LLM_PROVIDER: process.env.VITE_LLM_PROVIDER || 'NOT SET',
  });
};
