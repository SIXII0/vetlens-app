<script lang="ts">
  import { onMount } from 'svelte';

  let stats = $state({ termCount: 0, citiesWithPrices: [] as string[] });
  let terms = $state<any[]>([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let searchResult = $state<any>(null);

  onMount(async () => {
    // 加载统计
    try {
      const res = await fetch('/api/knowledge/search?action=stats');
      if (res.ok) stats = await res.json();
    } catch { /* ignore */ }

    // 加载所有术语
    try {
      const res = await fetch('/api/knowledge/search?action=all');
      if (res.ok) terms = await res.json();
    } catch { /* ignore */ }

    loading = false;
  });

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch(`/api/knowledge/search?action=match&q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) searchResult = await res.json();
    } catch { /* ignore */ }
  }
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold text-gray-900">📚 知识库</h1>
  </div>

  <!-- 统计 -->
  <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
    <div class="card text-center">
      <div class="text-2xl font-bold text-primary-600">{stats.termCount}</div>
      <div class="text-xs text-gray-500 mt-1">收录术语</div>
    </div>
    <div class="card text-center">
      <div class="text-2xl font-bold text-vet-green">{stats.citiesWithPrices.length}</div>
      <div class="text-xs text-gray-500 mt-1">价格覆盖城市</div>
    </div>
    <div class="card text-center">
      <div class="text-2xl font-bold text-vet-amber">5</div>
      <div class="text-xs text-gray-500 mt-1">知识库模块</div>
    </div>
  </div>

  <!-- 搜索 -->
  <div class="card">
    <h3 class="font-semibold text-gray-900 mb-3">术语查询</h3>
    <div class="flex gap-3 mb-4">
      <input
        type="text"
        class="input-field flex-1"
        placeholder="输入收费项目名称，如：生化全套"
        bind:value={searchQuery}
        onkeydown={(e) => e.key === 'Enter' && handleSearch()}
      />
      <button class="btn-primary" onclick={handleSearch}>查询</button>
    </div>

    {#if searchResult}
      {#if searchResult.match}
        <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div class="font-semibold text-emerald-800 mb-2">
            ✅ 已匹配: {searchResult.match.name}
            <span class="text-xs text-emerald-600 ml-2">
              (置信度: {(searchResult.match.confidence * 100).toFixed(0)}% · {searchResult.match.matchMethod})
            </span>
          </div>
          <div class="text-sm text-emerald-700 space-y-1">
            <div>📝 <strong>通俗解释</strong>: {searchResult.match.plainExplain}</div>
            <div>🏥 <strong>分类</strong>: {searchResult.match.category} · <strong>必要性</strong>: {searchResult.match.necessityHint}</div>
            {#if searchResult.match.aliases?.length}
              <div>🏷️ <strong>别名</strong>: {searchResult.match.aliases.join(', ')}</div>
            {/if}
          </div>
        </div>
      {:else}
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div class="font-semibold text-amber-800 mb-1">❌ 未找到匹配</div>
          <div class="text-sm text-amber-700">
            "{searchQuery}" 暂未收录在知识库中。系统分析账单时会自动标注为未知项目并加入贡献队列（如果你开启了自动上传）。
          </div>
        </div>
      {/if}
    {/if}
  </div>

  <!-- 术语列表 -->
  {#if loading}
    <div class="card text-center py-12 text-gray-500">加载中...</div>
  {:else}
    <div class="card">
      <h3 class="font-semibold text-gray-900 mb-4">全部术语 ({terms.length})</h3>

      <div class="space-y-1">
        {#each ['检查', '药品', '耗材', '处置', '手术', '其他'] as category}
          {@const catTerms = terms.filter((t: any) => t.category === category)}
          {#if catTerms.length > 0}
            <details class="group" open={category === '检查'}>
              <summary class="cursor-pointer py-2 px-3 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700">
                {category} ({catTerms.length})
              </summary>
              <div class="pl-4 space-y-0.5">
                {#each catTerms as term}
                  <div class="flex items-center gap-2 py-1.5 px-3 text-sm hover:bg-gray-50 rounded">
                    <span class="font-medium text-gray-800">{term.name}</span>
                    {#if term.aliases}
                      <span class="text-xs text-gray-400">{JSON.parse(term.aliases).join(', ')}</span>
                    {/if}
                    <span class="ml-auto text-xs text-gray-400">{term.necessity_hint || ''}</span>
                  </div>
                {/each}
              </div>
            </details>
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  <!-- 知识库扩展说明 -->
  <div class="card bg-blue-50 border-blue-200">
    <h3 class="font-semibold text-blue-800 mb-2">🔮 知识库扩展计划</h3>
    <div class="text-sm text-blue-700 space-y-2">
      <p>当前为内置种子数据（25 条术语 + 4 城市价格）。以下扩展通道已预留：</p>
      <ul class="list-disc list-inside space-y-1 text-xs">
        <li>📋 <strong>内置 JSON 文件</strong> — 随 Docker 镜像发布（当前）</li>
        <li>🔄 <strong>git pull 更新</strong> — 手动拉取 pet-med-kb 仓库</li>
        <li>📤 <strong>自动上传未知项目</strong> — 客户端 → api.vetlens.app（待建服务端）</li>
        <li>🤝 <strong>合作方 API</strong> — 双向同步价格/药品数据（预留）</li>
        <li>📡 <strong>Webhook 推送</strong> — 服务端增量更新（预留）</li>
        <li>👥 <strong>社区共建</strong> — GitHub PR → 审核 → 合并（预留）</li>
      </ul>
    </div>
  </div>
</div>
