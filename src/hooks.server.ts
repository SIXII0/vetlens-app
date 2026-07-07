import { loadAllKnowledge, loadSeedHospitals } from '$lib/server/knowledge/loader';
import { importAllExternal } from '$lib/server/knowledge/import-external';
import { initMetaTable } from '$lib/server/knowledge/updater';

/** 服务端启动钩子：初始化知识库 */
let initialized = false;

async function initialize() {
  if (initialized) return;
  initialized = true;

  try {
    initMetaTable();

    // 1. 加载内置种子数据 (data/*.json)
    const builtin = loadAllKnowledge();
    console.log(`[VetLens] 内置知识库: ${builtin.terms} 术语, ${builtin.prices} 价格`);

    // 2. 加载外部知识库 (../data/*.jsonl, ../data/*.json)
    const external = importAllExternal();
    console.log(`[VetLens] 外部知识库: ${external.terms} 术语, ${external.insurance} 保险, ${external.breeds} 品种风险`);

    // 3. 加载医院数据
    const hospitals = loadSeedHospitals();
    console.log(`[VetLens] 医院数据: ${hospitals} 家`);

    const total = builtin.terms + external.terms;
    console.log(`[VetLens] ✅ 知识库初始化完成: ${total} 条术语`);
  } catch (err) {
    console.error('[VetLens] 知识库加载失败:', err);
  }
}

export const handle = async ({ event, resolve }) => {
  await initialize();
  return resolve(event);
};
