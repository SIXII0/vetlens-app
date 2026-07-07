import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchTerms, getAllTerms, countTerms } from '$lib/server/db/terms';
import { getCitiesWithPrices } from '$lib/server/db/prices';
import { matchTerm } from '$lib/server/engine/matcher';

/** 搜索知识库术语 */
export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q');
  const action = url.searchParams.get('action') || 'search';

  switch (action) {
    case 'search': {
      if (!query) {
        return json({ error: '缺少查询参数 q' }, { status: 400 });
      }
      const results = searchTerms(query, 20);
      return json(results);
    }
    case 'match': {
      if (!query) {
        return json({ error: '缺少查询参数 q' }, { status: 400 });
      }
      const match = matchTerm(query);
      return json({ query, match });
    }
    case 'stats': {
      const termCount = countTerms();
      const cities = getCitiesWithPrices();
      return json({ termCount, citiesWithPrices: cities });
    }
    case 'all': {
      const terms = getAllTerms();
      return json(terms);
    }
    default:
      return json({ error: '未知操作' }, { status: 400 });
  }
};
