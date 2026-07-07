<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { formatCurrency, formatDate, priceLevelBadge } from '$lib/utils/format';

  let loading = $state(true);
  let error = $state<string | null>(null);
  let record: any = $state(null);
  let items: any[] = $state([]);
  let hospitals: any[] = $state([]);
  let showAllHospitals = $state(false);

  onMount(async () => {
    try {
      const res = await fetch(`/api/records/${$page.params.id}`);
      if (!res.ok) {
        error = '记录不存在';
        loading = false;
        return;
      }
      const data = await res.json();
      record = data.record;
      items = data.items || [];

      // 加载医院推荐
      if (record.hospital_city) {
        try {
          const hRes = await fetch(`/api/hospitals?city=${encodeURIComponent(record.hospital_city)}&limit=5`);
          if (hRes.ok) hospitals = await hRes.json();
        } catch { /* ignore */ }
      }
    } catch (e) {
      error = '加载失败';
    } finally {
      loading = false;
    }
  });

  function printedAmount(item: any): number {
    return item.amount || 0;
  }

  function isPriceHigh(item: any): boolean {
    return item.price_level === '偏高' || item.price_level === '略高';
  }

  let categories = $derived.by(() => {
    const cats: Record<string, number> = {};
    for (const item of items) {
      const cat = item.category || '其他';
      cats[cat] = (cats[cat] || 0) + (item.amount || 0);
    }
    return Object.entries(cats).map(([cat, amt]) => ({
      cat,
      amt,
      pct: record ? (amt / record.total_amount * 100).toFixed(1) : '0'
    }));
  });
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <!-- 加载状态 -->
  {#if loading}
    <div class="card text-center py-12">
      <div class="text-3xl mb-3">🔄</div>
      <p class="text-gray-500">加载分析结果...</p>
    </div>
  {:else if error}
    <div class="card text-center py-12">
      <div class="text-3xl mb-3">😿</div>
      <p class="text-red-500">{error}</p>
      <a href="/records" class="btn-primary inline-block mt-4">返回记录列表</a>
    </div>
  {:else}
    <!-- 总览卡片 -->
    <div class="card bg-white">
      <div class="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <h1 class="text-xl font-bold text-gray-900">
              {record.hospital_name || '未知医院'}
            </h1>
            <span class="badge-blue">已解读</span>
          </div>
          <div class="text-sm text-gray-500 space-x-3">
            <span>📅 {formatDate(record.visit_date)}</span>
            {#if record.hospital_city}
              <span>📍 {record.hospital_city}</span>
            {/if}
            {#if record.visit_reason}
              <span>🩺 {record.visit_reason}</span>
            {/if}
          </div>
        </div>
        <div class="text-right">
          <div class="text-xs text-gray-500 mb-1">总费用</div>
          <div class="text-3xl font-bold text-gray-900">{formatCurrency(record.total_amount)}</div>
          <div class="text-xs text-gray-400">{items.length} 个项目</div>
        </div>
      </div>
    </div>

    <!-- 分析摘要 -->
    {#if items.length > 0}
      {@const matchedCount = items.filter((it: any) => !it.is_unknown).length}
      {@const unknownCount = items.filter((it: any) => it.is_unknown).length}
      {@const highPriceCount = items.filter((it: any) => it.price_level === '偏高' || it.price_level === '略高').length}

      <div class="card bg-gray-50 border border-gray-200">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div class="text-lg font-bold text-gray-900">{items.length}</div>
            <div class="text-xs text-gray-500">费用项目</div>
          </div>
          <div>
            <div class="text-lg font-bold text-emerald-600">{matchedCount}</div>
            <div class="text-xs text-gray-500">知识库匹配</div>
          </div>
          <div>
            <div class="text-lg font-bold" class:text-amber-600={unknownCount > 0} class:text-gray-400={unknownCount === 0}>
              {unknownCount}
            </div>
            <div class="text-xs text-gray-500">未识别项目</div>
          </div>
          <div>
            <div class="text-lg font-bold" class:text-amber-600={highPriceCount > 0} class:text-emerald-600={highPriceCount === 0}>
              {highPriceCount}
            </div>
            <div class="text-xs text-gray-500">价格偏高</div>
          </div>
        </div>
      </div>
    {/if}

    <!-- 逐项解读 -->
    <div class="space-y-3">
      <h2 class="text-lg font-semibold text-gray-900">📋 逐项解读</h2>

      {#if items.length === 0}
        <div class="card text-center py-8">
          <div class="text-3xl mb-2">📝</div>
          <p class="text-sm text-gray-500">暂无分析项目。请确认账单数据已正确录入。</p>
        </div>
      {/if}

      {#each items as item, i}
        <div class="card" class:border-amber-200={item.is_unknown} style:background-color={item.is_unknown ? 'rgb(255 251 235 / 0.3)' : ''}>
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <!-- 标题行 -->
              <div class="flex items-center gap-2 mb-2 flex-wrap">
                <span class="text-sm font-semibold text-gray-900">{item.raw_name}</span>
                {#if item.category}
                  <span class="badge-gray">{item.category}</span>
                {/if}
                {#if item.necessity}
                  <span class="badge text-xs">{item.necessity}</span>
                {/if}
                {#if item.price_level}
                  <span class={priceLevelBadge(item.price_level)}>{item.price_level}</span>
                {/if}
                {#if item.is_unknown}
                  <span class="badge-amber">未知项目</span>
                {/if}
              </div>

              <!-- 解释 -->
              {#if item.explanation}
                <div class="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                  {item.explanation}
                </div>
              {/if}

              <!-- 未知项目提示 -->
              {#if item.is_unknown}
                <div class="mt-2 p-3 bg-amber-100/50 rounded-lg text-xs text-amber-800">
                  ⚠️ 该项目在知识库中未找到匹配。以下解释基于通用知识推断，仅供参考。下次更新知识库后将自动匹配。
                </div>
              {/if}
            </div>

            <!-- 金额 -->
            <div class="text-right flex-shrink-0">
              <div class="text-lg font-bold {isPriceHigh(item) ? 'text-amber-600' : 'text-gray-900'}">
                {formatCurrency(printedAmount(item))}
              </div>
              {#if item.confidence != null}
                <div class="text-xs text-gray-400">
                  匹配置信度: {(item.confidence * 100).toFixed(0)}%
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- 费用分布 -->
    {#if items.length > 0}
      <div class="card">
        <h3 class="font-semibold text-gray-900 mb-4">📊 费用构成</h3>
        <div class="space-y-2">
          {#each categories as { cat, amt, pct }}
            <div class="flex items-center gap-3">
              <span class="text-sm text-gray-600 w-16">{cat}</span>
              <div class="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  class:bg-primary-500={cat === '检查'}
                  class:bg-emerald-500={cat === '药品'}
                  class:bg-amber-500={cat === '手术'}
                  class:bg-purple-500={cat === '耗材'}
                  class:bg-gray-400={cat === '其他' || cat === '处置'}
                  style="width: {pct}%"
                ></div>
              </div>
              <span class="text-sm text-gray-900 font-medium w-24 text-right">{formatCurrency(amt)}</span>
              <span class="text-xs text-gray-400 w-12 text-right">{pct}%</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- 医院推荐 -->
    {#if hospitals.length > 0}
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-900">
            🏥 {record.hospital_city || ''}附近好评医院
          </h3>
        </div>
        <p class="text-xs text-gray-500 mb-4">
          以下医院基于价格透明度和用户评价综合推荐，数据来自公开信息，仅供参考
        </p>
        <div class="space-y-3">
          {#each hospitals.slice(0, showAllHospitals ? 10 : 3) as h}
            <div class="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
              <div class="flex-1">
                <div class="font-medium text-sm text-gray-900">{h.name}</div>
                <div class="text-xs text-gray-500">
                  {h.type || ''} · {h.address || ''}
                </div>
              </div>
              <div class="flex items-center gap-4 text-sm">
                <div class="text-center">
                  <div class="text-amber-500 font-semibold">⭐ {h.rating ?? '—'}</div>
                  <div class="text-xs text-gray-400">用户评分</div>
                </div>
                <div class="text-center">
                  <div class="text-emerald-600 font-semibold">💰 {h.transparency_score ?? '—'}</div>
                  <div class="text-xs text-gray-400">价格透明</div>
                </div>
                <span class="badge text-xs">
                  {h.price_level === '低' ? '经济型' : h.price_level === '高' ? '高端' : '中等'}
                </span>
              </div>
            </div>
          {/each}
        </div>
        {#if hospitals.length > 3}
          <button
            class="btn-ghost text-sm w-full mt-3"
            onclick={() => showAllHospitals = !showAllHospitals}
          >
            {showAllHospitals ? '收起' : `查看更多 (${hospitals.length - 3} 家)`}
          </button>
        {/if}
      </div>
    {/if}

    <!-- 操作按钮 -->
    <div class="flex gap-3 justify-end">
      <a href="/records" class="btn-secondary">返回记录</a>
      <a href="/upload" class="btn-primary">分析新账单</a>
    </div>
  {/if}
</div>
