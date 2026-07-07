import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { countTerms } from '$lib/server/db/terms';
import { getCitiesWithPrices } from '$lib/server/db/prices';

/** 健康检查 + 系统状态 */
export const GET: RequestHandler = async () => {
  const termCount = countTerms();
  const cities = getCitiesWithPrices();

  // 尝试检测本地 OCR 引擎
  let ocrAvailable = false;
  try {
    const resp = await fetch('http://localhost:8866/health');
    if (resp.ok) {
      const info = await resp.json();
      ocrAvailable = info.available === true;
    }
  } catch {
    // OCR 服务未启动
  }

  return json({
    status: 'ok',
    version: '0.1.0',
    available: ocrAvailable,
    knowledgeBase: {
      terms: termCount,
      citiesWithPrices: cities.length,
      cities
    },
    timestamp: new Date().toISOString()
  });
};
