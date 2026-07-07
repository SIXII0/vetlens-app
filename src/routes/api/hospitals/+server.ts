import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRecommendedHospitals, searchHospitalsByName } from '$lib/server/db/hospitals';

/** 获取推荐医院 */
export const GET: RequestHandler = async ({ url }) => {
  const city = url.searchParams.get('city') || undefined;
  const query = url.searchParams.get('q') || undefined;
  const limit = parseInt(url.searchParams.get('limit') || '10');

  if (query) {
    const hospitals = searchHospitalsByName(query, city);
    return json(hospitals);
  }

  const hospitals = getRecommendedHospitals({ city, limit });
  return json(hospitals);
};
