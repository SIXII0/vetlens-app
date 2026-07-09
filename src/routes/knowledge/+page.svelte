<script lang="ts">
  import { onMount } from 'svelte';

  let stats = $state({ termCount: 0, citiesWithPrices: [] as string[] });
  let sourceCounts = $state<Array<{ source: string; count: number }>>([]);
  let terms = $state<any[]>([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let searchResult = $state<any>(null);

  // Tab 状态
  let activeTab = $state<'builtin' | 'seed_unreviewed' | 'user_contributed'>('seed_unreviewed');
  let expandedId = $state<string | null>(null);
  let reviewMsg = $state('');
  let aiReviewingId = $state<string | null>(null);
  let categoryFilter = $state<string>('全部');

  let filteredCategories = $derived(
    ['全部', ...new Set(terms.map((t: any) => t.category || '其他')).values()].sort()
  );

  const SOURCE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
    builtin: { label: '已确认', icon: '✅', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    seed_unreviewed: { label: '待审核', icon: '⚠️', color: 'bg-amber-100 text-amber-700 border-amber-300' },
    user_contributed: { label: '用户贡献', icon: '📝', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  };

  onMount(async () => {
    const [sRes, rRes] = await Promise.all([
      fetch('/api/knowledge/search?action=stats'),
      fetch('/api/knowledge/review?action=stats'),
    ]);
    if (sRes.ok) stats = await sRes.json();
    if (rRes.ok) {
      const data = await rRes.json();
      sourceCounts = data.counts;
    }
    await loadTerms();
    loading = false;
  });

  async function loadTerms() {
    loading = true;
    const res = await fetch(`/api/knowledge/review?source=${activeTab}&limit=100`);
    if (res.ok) {
      const data = await res.json();
      terms = data.terms;
    }
    loading = false;
  }

  function switchTab(tab: typeof activeTab) {
    activeTab = tab;
    expandedId = null;
    loadTerms();
  }

  async function approveTerm(id: string, name: string) {
    reviewMsg = '';
    const res = await fetch('/api/knowledge/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, reviewer: 'admin' }),
    });
    if (res.ok) {
      terms = terms.filter(t => t.id !== id);
      updateCounts(activeTab, -1);
      reviewMsg = `✅ "${name}" 已确认`;
    } else {
      reviewMsg = `❌ 操作失败`;
    }
  }

  async function deleteTerm(id: string, name: string) {
    reviewMsg = '';
    if (!confirm(`确定删除 "${name}"？`)) return;
    const res = await fetch('/api/knowledge/review', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      terms = terms.filter(t => t.id !== id);
      updateCounts(activeTab, -1);
      reviewMsg = `🗑️ "${name}" 已删除`;
    }
  }

  function updateCounts(source: string, delta: number) {
    const idx = sourceCounts.findIndex(c => c.source === source);
    if (idx >= 0) sourceCounts[idx].count += delta;
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    const res = await fetch(`/api/knowledge/search?action=match&q=${encodeURIComponent(searchQuery)}`);
    if (res.ok) searchResult = await res.json();
  }

  function getSourceInfo(source: string) {
    return SOURCE_LABELS[source] || { label: source, icon: '📋', color: 'bg-warm-100 text-warm-700 border-warm-300' };
  }

  async function aiReviewTerm(term: any) {
    reviewMsg = '';
    aiReviewingId = term.id;
    const res = await fetch('/api/knowledge/review', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: term.id, name: term.name, aliases: term.aliases }),
    });
    aiReviewingId = null;
    if (!res.ok) {
      const err = await res.json();
      reviewMsg = `❌ AI审核失败: ${err.error}`;
      return;
    }
    const data = await res.json();
    const r = data.review;
    if (r.verdict === 'valid') {
      terms = terms.filter(t => t.id !== term.id);
      updateCounts(activeTab, -1);
      const hints = [r.category, r.necessity_hint, r.plain_explain].filter(Boolean).join(' · ');
      reviewMsg = `🤖✅ "${term.name}" → ${hints || '已确认'}（AI自动审核）`;
    } else if (r.verdict === 'uncertain') {
      reviewMsg = `🤖⚠️ "${term.name}" 无法确定: ${r.reason || 'AI不确定'} — 请手动审核`;
    } else {
      reviewMsg = `🤖❌ "${term.name}" 不是有效宠物医疗术语: ${r.reason || ''}`;
    }
  }
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold text-warm-900">📚 知识库审核</h1>
  </div>

  <!-- 统计卡片 -->
  <div class="grid grid-cols-3 gap-4">
    {#each sourceCounts as sc}
      {@const info = getSourceInfo(sc.source)}
      <button
        class="card text-center cursor-pointer transition-all border-2
               {activeTab === sc.source ? 'ring-2 ring-brand-300 scale-[1.02]' : 'border-transparent hover:border-warm-200'}"
        onclick={() => switchTab(sc.source as typeof activeTab)}
      >
        <div class="text-lg">{info.icon}</div>
        <div class="text-2xl font-bold mt-1">{sc.count}</div>
        <div class="text-xs text-warm-500 mt-0.5">{info.label}</div>
      </button>
    {/each}
  </div>

  <!-- 操作反馈 -->
  {#if reviewMsg}
    <div class="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-2 text-sm">
      {reviewMsg}
    </div>
  {/if}

  <!-- 搜索 -->
  <div class="flex gap-2">
    <input type="text" class="input-field flex-1" placeholder="搜索术语..." bind:value={searchQuery} onkeydown={(e) => e.key === 'Enter' && handleSearch()} />
    <button class="btn-primary text-sm" onclick={handleSearch}>搜索</button>
  </div>

  {#if searchResult}
    <div class="bg-warm-50 rounded-lg p-4 text-sm">
      <div class="font-semibold mb-2">搜索结果: {searchResult.length} 条</div>
      {#each searchResult as item}
        <div class="py-1 border-b border-warm-100 last:border-0">
          <span class="font-medium">{item.name}</span>
          <span class="text-warm-400 ml-2">{item.category}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- 术语列表 + 审核 -->
  <div>
    <!-- 分类筛选 -->
    <div class="flex flex-wrap gap-1.5 mb-3">
      {#each filteredCategories as cat}
        <button
          class="px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                 {categoryFilter === cat ? 'bg-brand-500 text-white' : 'bg-warm-100 text-warm-600 hover:bg-warm-200'}"
          onclick={() => categoryFilter = cat}
        >
          {cat}
        </button>
      {/each}
    </div>

    <div class="flex items-center justify-between mb-3">
      <h3 class="font-semibold text-warm-700">
        {getSourceInfo(activeTab).icon} {getSourceInfo(activeTab).label}
        <span class="text-warm-400 text-sm font-normal ml-2">{terms.length} 条</span>
      </h3>
      {#if activeTab !== 'builtin'}
        <span class="text-xs text-warm-400">点击卡片展开详情，一键确认或删除</span>
      {/if}
    </div>

    {#if loading}
      <div class="text-center py-12 text-warm-400">加载中...</div>
    {:else if terms.length === 0}
      <div class="text-center py-12 text-warm-400">暂无术语</div>
    {:else}
      <div class="space-y-2">
        {#each terms.filter((t: any) => categoryFilter === '全部' || (t.category || '其他') === categoryFilter) as term}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="card cursor-pointer hover:shadow-md transition-all"
            class:ring-2={expandedId === term.id}
            class:ring-brand-300={expandedId === term.id}
            onclick={() => expandedId = expandedId === term.id ? null : term.id}
            role="button" tabindex="0"
            onkeydown={(e) => { if (e.key === 'Enter') expandedId = expandedId === term.id ? null : term.id; }}
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <span class="font-medium text-warm-900 truncate">{term.name}</span>
                <span class="text-xs px-1.5 py-0.5 rounded {term.category === '检查' ? 'bg-blue-100 text-blue-700' : term.category === '药品' ? 'bg-red-100 text-red-700' : term.category === '治疗' ? 'bg-amber-100 text-amber-700' : term.category === '手术' ? 'bg-purple-100 text-purple-700' : term.category === '耗材' ? 'bg-warm-100 text-warm-600' : term.category === '服务' ? 'bg-teal-100 text-teal-700' : term.category === '预防' ? 'bg-green-100 text-green-700' : 'bg-warm-100 text-warm-500'} flex-shrwarm-0">{term.category || '其他'}</span>
                {#if term.aliases}
                  <span class="text-xs text-warm-400 truncate hidden sm:inline">
                    {typeof term.aliases === 'string' ? term.aliases.slice(0, 60) : String(term.aliases).slice(0, 60)}
                  </span>
                {/if}
              </div>
              <span class="text-xs text-warm-400 flex-shrwarm-0 ml-2">{expandedId === term.id ? '▲' : '▼'}</span>
            </div>

            <!-- 展开详情 -->
            {#if expandedId === term.id}
              <div class="mt-3 pt-3 border-t border-warm-100 space-y-2 text-sm">
                {#if term.medical_explain}
                  <div><span class="text-warm-400">医学解释：</span>{term.medical_explain}</div>
                {/if}
                {#if term.plain_explain}
                  <div><span class="text-warm-400">通俗解释：</span>{term.plain_explain}</div>
                {/if}
                <div class="flex gap-4 text-xs text-warm-400">
                  {#if term.necessity_hint}<span>必要性：{term.necessity_hint}</span>{/if}
                  {#if term.reviewed_by}<span>审核人：{term.reviewed_by}</span>{/if}
                </div>

                <!-- 审核按钮 -->
                {#if activeTab !== 'builtin'}
                  <div class="flex gap-2 pt-2">
                    <button
                      class="flex-1 py-1.5 rounded text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                      onclick={(e) => { e.stopPropagation(); approveTerm(term.id, term.name); }}
                    >
                      ✅ 手动确认
                    </button>
                    <button
                      class="flex-1 py-1.5 rounded text-sm font-medium bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-60"
                      disabled={aiReviewingId === term.id}
                      onclick={(e) => { e.stopPropagation(); aiReviewTerm(term); }}
                    >
                      {aiReviewingId === term.id ? '🤖 审核中...' : '🤖 AI审核'}
                    </button>
                    <button
                      class="flex-1 py-1.5 rounded text-sm font-medium bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                      onclick={(e) => { e.stopPropagation(); deleteTerm(term.id, term.name); }}
                    >
                      🗑️ 删除
                    </button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
