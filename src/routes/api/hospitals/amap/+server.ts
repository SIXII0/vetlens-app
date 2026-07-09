import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

/**
 * 代理高德 REST API 周边搜索
 * GET /api/hospitals/amap?lng=116.397&lat=39.908&radius=3000
 */
export const GET: RequestHandler = async ({ url }) => {
  const key = env.AMAP_SERVICE_KEY || env.AMAP_WEB_KEY || '';
  if (!key) return json({ error: 'AMAP key not configured' }, { status: 503 });

  const lng = url.searchParams.get('lng') || '116.397';
  const lat = url.searchParams.get('lat') || '39.908';
  const radius = url.searchParams.get('radius') || '3000';
  const keywords = url.searchParams.get('keywords') || '宠物医院';

  const amapUrl = `https://restapi.amap.com/v3/place/around?key=${key}&location=${lng},${lat}&keywords=${encodeURIComponent(keywords)}&radius=${radius}&offset=25&extensions=all`;

  try {
    const res = await fetch(amapUrl, { headers: { 'User-Agent': 'VetLens/1.0' } });
    const data = await res.json();

    if (data.status !== '1') {
      return json({ error: data.info || 'AMAP API error', status: data.status });
    }

    const pois = (data.pois || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      address: p.address || '',
      district: p.adname || '',
      phone: p.tel || '',
      type: p.type || '',
      rating: p.biz_ext?.rating ? parseFloat(p.biz_ext.rating) : null,
      price_level: p.biz_ext?.cost || '',
      lng: parseFloat(p.location?.split(',')[0] || '0'),
      lat: parseFloat(p.location?.split(',')[1] || '0'),
      distance: p.distance ? parseInt(p.distance) : null,
      source: 'amap',
    }));

    return json({ pois, count: parseInt(data.count || '0') });
  } catch (e) {
    return json({ error: 'Request failed: ' + (e as Error).message }, { status: 500 });
  }
};
