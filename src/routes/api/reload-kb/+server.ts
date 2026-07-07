import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadAllKnowledge, loadSeedHospitals } from '$lib/server/knowledge/loader';
import { importAllExternal } from '$lib/server/knowledge/import-external';
import { countTerms, searchTerms } from '$lib/server/db/terms';

export const GET: RequestHandler = async () => {
  const log: string[] = [];
  try {
    // 强制清空初始化标记并重新加载
    log.push('开始重新加载知识库...');

    const builtin = loadAllKnowledge();
    log.push(`内置种子: ${builtin.terms} 术语, ${builtin.prices} 价格`);

    const external = importAllExternal();
    log.push(`外部知识库: ${external.terms} 术语, ${external.insurance} 保险, ${external.breeds} 品种风险`);

    const hospitals = loadSeedHospitals();
    log.push(`医院数据: ${hospitals} 家`);

    // 验证
    const totalTerms = countTerms();
    const ftTest = searchTerms('血常规', 3);
    log.push(`验证: 总术语=${totalTerms}, FTS5搜索"血常规"=${ftTest.length}条`);

    return json({
      success: true,
      builtin,
      external,
      hospitals,
      totalTerms,
      ftTestCount: ftTest.length,
      log
    });
  } catch (err) {
    return json({ error: String(err), log }, { status: 500 });
  }
};
