<script lang="ts">
  import { onMount } from 'svelte';
  import { settings } from '$lib/stores/settings';

  let hospitals = $state<any[]>([]);
  let loading = $state(true);
  let city = $state('');
  let searchQuery = $state('');

  onMount(() => {
    city = $settings.defaultCity || '北京';
    loadHospitals();
  });

  async function loadHospitals() {
    loading = true;
    try {
      const params = new URLSearchParams();
      if (city) params.set('city', city);
      if (searchQuery) params.set('q', searchQuery);
      params.set('limit', '20');

      const res = await fetch(`/api/hospitals?${params}`);
      if (res.ok) hospitals = await res.json();
    } catch { /* ignore */ }
    loading = false;
  }

  function handleSearch() {
    loadHospitals();
  }
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold text-gray-900">🏥 医院推荐</h1>
  </div>

  <!-- 搜索/筛选 -->
  <div class="card">
    <div class="flex gap-3 flex-wrap">
      <select class="input-field w-32" bind:value={city} onchange={loadHospitals}>
        <option value="">全部城市</option>
        <option value="北京">北京</option>
        <option value="上海">上海</option>
        <option value="广州">广州</option>
        <option value="深圳">深圳</option>
        <option value="杭州">杭州</option>
        <option value="成都">成都</option>
        <option value="武汉">武汉</option>
      </select>
      <input
        type="text"
        class="input-field flex-1"
        placeholder="搜索医院名称..."
        bind:value={searchQuery}
        onkeydown={(e) => e.key === 'Enter' && handleSearch()}
      />
      <button class="btn-primary" onclick={handleSearch}>搜索</button>
    </div>
  </div>

  <!-- 结果 -->
  {#if loading}
    <div class="card text-center py-12 text-gray-500">加载中...</div>
  {:else if hospitals.length === 0}
    <div class="card text-center py-12">
      <div class="text-5xl mb-4">🏥</div>
      <h3 class="font-semibold text-gray-700 mb-2">暂无医院数据</h3>
      <p class="text-sm text-gray-500">
        知识库正在建设中，医院数据将逐步完善。你可以通过"设置 → 知识库"查看当前覆盖范围。
      </p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each hospitals as h}
        <div class="card">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-semibold text-gray-900">{h.name}</h3>
                <span class="badge-gray text-xs">{h.type || '未分类'}</span>
                <span class="badge text-xs">
                  {h.price_level === '低' ? '💰 经济型' : h.price_level === '高' ? '💰💰 高端' : '💰 中等'}
                </span>
              </div>
              <div class="text-xs text-gray-500 mb-2">
                {[h.district, h.address].filter(Boolean).join(' · ')}
                {#if h.phone} · 📞 {h.phone}{/if}
              </div>
            </div>
            <div class="flex items-center gap-4 text-center">
              <div>
                <div class="text-lg font-bold text-amber-500">⭐ {h.rating ?? '—'}</div>
                <div class="text-xs text-gray-400">用户评分</div>
              </div>
              <div>
                <div class="text-lg font-bold text-emerald-600">
                  {h.transparency_score != null ? h.transparency_score.toFixed(1) : '—'}
                </div>
                <div class="text-xs text-gray-400">价格透明</div>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <div class="text-xs text-gray-400 text-center">
      数据来源：公开信息采集和用户贡献 · 仅供参考
    </div>
  {/if}
</div>
