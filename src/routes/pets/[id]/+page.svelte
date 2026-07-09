<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  const petId = $page.params.id;

  // 宠物信息
  let pet = $state<any>(null);
  // 花费数据
  let spending = $state<any>(null);
  let selectedYear = $state(new Date().getFullYear());
  // 就诊记录
  let records = $state<any[]>([]);
  // 保单
  let policies = $state<any[]>([]);
  // 报告
  let reports = $state<any[]>([]);
  // 页面状态
  let loading = $state(true);
  let activeTab = $state<'overview' | 'records' | 'reports'>('overview');
  let maxMonthlyTotal = $derived(spending ? Math.max(...spending.monthlyTrend.map((m:any)=>m.total), 1) : 1);

  onMount(async () => {
    try {
      const [petRes, spendingRes, recordsRes, policiesRes, reportsRes] = await Promise.all([
        fetch('/api/pets'),
        fetch(`/api/pets/${petId}/spending?year=${selectedYear}`),
        fetch(`/api/records?petId=${petId}`),
        fetch(`/api/insurance?petId=${petId}`),
        fetch(`/api/reports?petId=${petId}`),
      ]);

      if (petRes.ok) {
        const pets = await petRes.json();
        pet = pets.find((p: any) => p.id === petId);
      }
      if (spendingRes.ok) spending = await spendingRes.json();
      if (recordsRes.ok) {
        const d = await recordsRes.json();
        records = d.records || d || [];
      }
      if (policiesRes.ok) policies = await policiesRes.json(); // 返回数组
      if (reportsRes.ok) {
        const d = await reportsRes.json();
        reports = d.reports || d || [];
      }
    } catch { /* ignore */ }
    loading = false;
  });

  function formatCurrency(n: number): string {
    if (n >= 10000) return '¥' + (n / 10000).toFixed(1) + '万';
    return '¥' + n.toLocaleString('zh-CN');
  }

  function barHeight(total: number, maxTotal: number): string {
    if (maxTotal === 0) return '4px';
    return Math.max((total / maxTotal) * 100, total > 0 ? 8 : 4) + '%';
  }

  function getCategoryColor(cat: string): string {
    const map: Record<string, string> = {
      '检查': '#3b82f6', '药品': '#ef4444', '治疗': '#f59e0b', '手术': '#8b5cf6',
      '耗材': '#6b7280', '服务': '#14b8a6', '预防': '#22c55e',
    };
    return map[cat] || '#9ca3af';
  }

  $effect(() => {
    fetch(`/api/pets/${petId}/spending?year=${selectedYear}`)
      .then(r => r.ok && r.json())
      .then(d => d && (spending = d));
  });
</script>

{#if loading}
  <div class="max-w-4xl mx-auto py-12 text-center text-warm-400">加载中...</div>
{:else if !pet}
  <div class="max-w-4xl mx-auto py-12 text-center text-warm-400">宠物不存在</div>
{:else}
<div class="max-w-4xl mx-auto space-y-6">
  <!-- 顶部栏 -->
  <div class="flex items-center gap-3">
    <button class="text-warm-400 hover:text-warm-600 text-lg" onclick={() => goto('/pets')}>←</button>
    <span class="text-3xl">{pet.species === '猫' ? '🐱' : pet.species === '狗' ? '🐶' : '🐾'}</span>
    <div>
      <h1 class="text-xl font-bold text-warm-900">{pet.name}</h1>
      <p class="text-sm text-warm-500">
        {[pet.breed, pet.gender, pet.birth_date ? '🎂 ' + pet.birth_date : '', pet.weight_kg ? '⚖️ ' + pet.weight_kg + 'kg' : ''].filter(Boolean).join(' · ') || '暂无详细信息'}
      </p>
    </div>
    <div class="ml-auto flex gap-2">
      <button class="btn-primary text-sm" onclick={() => goto('/upload')}>+ 添加就诊记录</button>
      <button class="btn-secondary text-sm" onclick={() => goto('/insurance')}>+ 添加保单</button>
    </div>
  </div>

  <!-- Tab 切换 -->
  <div class="flex gap-1 bg-warm-100 rounded-lg p-1">
    {#each [{k:'overview',l:'💰 花费总览'},{k:'records',l:'📋 就诊记录'},{k:'reports',l:'📄 医疗报告'}] as tab}
      <button
        class="flex-1 py-2 rounded-md text-sm font-medium transition-colors {activeTab === tab.k ? 'bg-white text-warm-900 shadow-sm' : 'text-warm-500 hover:text-warm-700'}"
        onclick={() => activeTab = tab.k as typeof activeTab}
      >
        {tab.l}
      </button>
    {/each}
  </div>

  <!-- ── 花费总览 Tab ── -->
  {#if activeTab === 'overview' && spending}
    <!-- 年度选择 -->
    <div class="flex items-center gap-2">
      <button class="text-warm-400 hover:text-warm-600" onclick={() => selectedYear--} disabled={selectedYear <= 2020}>‹</button>
      <span class="font-semibold text-warm-900">{selectedYear}年</span>
      <button class="text-warm-400 hover:text-warm-600" onclick={() => selectedYear++} disabled={selectedYear >= new Date().getFullYear()}>›</button>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div class="card text-center">
        <div class="text-2xl font-bold text-warm-900">{formatCurrency(spending.annualTotal)}</div>
        <div class="text-xs text-warm-500 mt-1">年度总花费</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-warm-900">{spending.visitCount} 次</div>
        <div class="text-xs text-warm-500 mt-1">就诊次数</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-warm-900">{formatCurrency(spending.avgPerVisit)}</div>
        <div class="text-xs text-warm-500 mt-1">单次均价</div>
      </div>
    </div>

    <!-- 月度趋势柱状图 -->
    {#if spending.annualTotal > 0}
      <div class="card">
        <h3 class="font-semibold text-warm-700 mb-4">📊 月度花费趋势</h3>
        <!-- maxH computed as maxMonthlyTotal in script -->
        <div class="flex items-end gap-0.5 h-32">
          {#each spending.monthlyTrend as m}
            <div class="flex-1 flex flex-col items-center justify-end h-full group relative">
              <div
                class="w-full rounded-t-sm bg-brand-400 hover:bg-brand-500 transition-all cursor-pointer"
                style="height: {barHeight(m.total, maxMonthlyTotal)}"
                title="{m.month}月: {formatCurrency(m.total)}"
              ></div>
              {#if m.total > 0}
                <div class="hidden group-hover:block absolute -top-7 bg-warm-800 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap z-10">
                  {m.month}月: {formatCurrency(m.total)}
                </div>
              {/if}
            </div>
          {/each}
        </div>
        <div class="flex justify-between text-xs text-warm-400 mt-2">
          <span>1月</span><span>3月</span><span>5月</span><span>7月</span><span>9月</span><span>11月</span>
        </div>
      </div>

      <!-- 费用构成环形图 -->
      <div class="card">
        <h3 class="font-semibold text-warm-700 mb-4">🎨 费用构成</h3>
        <div class="space-y-2">
          {#each spending.categoryBreakdown.slice(0, 6) as cat}
            <div class="flex items-center gap-3">
              <div class="w-3 h-3 rounded-full flex-shrwarm-0" style="background: {getCategoryColor(cat.category)}"></div>
              <span class="text-sm w-12 flex-shrwarm-0">{cat.category}</span>
              <div class="flex-1 h-3 bg-warm-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all" style="width:{cat.pct}%;background:{getCategoryColor(cat.category)}"></div>
              </div>
              <span class="text-sm text-warm-500 w-12 text-right">{formatCurrency(cat.total)}</span>
              <span class="text-xs text-warm-400 w-8 text-right">{cat.pct}%</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- 保险 -->
    {#if spending.insurance?.hasPolicy}
      {@const ins = spending.insurance}
      <div class="card border-emerald-200 bg-emerald-50/50">
        <h3 class="font-semibold text-warm-700 mb-3">🛡️ 保险保障</h3>
        <div class="text-sm text-warm-600 mb-2">{ins.company} — {ins.productName}</div>
        <div class="grid grid-cols-3 gap-3 text-center text-sm">
          <div class="bg-white rounded-lg p-2">
            <div class="font-semibold">{formatCurrency(ins.totalSpent)}</div>
            <div class="text-xs text-warm-400">总花费</div>
          </div>
          <div class="bg-white rounded-lg p-2">
            <div class="font-semibold text-emerald-600">{formatCurrency(ins.estimatedPayout)}</div>
            <div class="text-xs text-warm-400">预计赔付</div>
          </div>
          <div class="bg-white rounded-lg p-2">
            <div class="font-semibold text-amber-600">{formatCurrency(ins.netOutOfPocket)}</div>
            <div class="text-xs text-warm-400">实际自付</div>
          </div>
        </div>
        <div class="mt-3 space-y-1 text-xs text-warm-500">
          <div class="flex items-center gap-2">
            <span class="w-16">保单利用率</span>
            <div class="flex-1 h-1.5 bg-warm-200 rounded-full overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full" style="width:{Math.min(ins.limitUsedPct, 100)}%"></div>
            </div>
            <span>{ins.limitUsedPct}%</span>
          </div>
          <div>免赔额 {formatCurrency(ins.deductible)} {ins.deductibleMet ? '✅ 已满足' : '⚠️ 未达到'}</div>
        </div>
      </div>
    {:else if spending.annualTotal > 0}
      <div class="card text-center text-sm text-warm-500 py-4">
        💡 <button class="text-brand-500 underline" onclick={() => goto('/insurance')}>添加保单</button>后可查看预计赔付和实际自付
      </div>
    {/if}

    <!-- 保单列表 -->
    {#if policies.length > 0}
      <div class="card">
        <h3 class="font-semibold text-warm-700 mb-3">📜 所有保单</h3>
        <div class="space-y-2">
          {#each policies as pol}
            <div class="flex items-center justify-between py-2 border-b border-warm-100 last:border-0">
              <div>
                <div class="text-sm font-medium text-warm-800">{pol.company} — {pol.product_name}</div>
                <div class="text-xs text-warm-400">
                  {#if pol.effective_date}生效: {pol.effective_date}{/if}
                  {#if pol.expiry_date} · 到期: {pol.expiry_date}{/if}
                </div>
              </div>
              <span class="text-xs px-2 py-0.5 rounded-full {pol.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-warm-100 text-warm-500'}">
                {pol.status === 'active' ? '生效中' : pol.status}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

  <!-- ── 就诊记录 Tab ── -->
  {:else if activeTab === 'records'}
    {#if records.length === 0}
      <div class="text-center py-12 text-warm-400">暂无就诊记录</div>
    {:else}
      <div class="space-y-3">
        {#each records as rec}
          <div class="card cursor-pointer hover:shadow-md transition-all"
               onclick={() => goto(`/analysis/${rec.id}`)} role="button" tabindex="0"
               onkeydown={(e) => { if (e.key === 'Enter') goto(`/analysis/${rec.id}`); }}>
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-warm-900">{rec.hospital_name || '未知医院'}</div>
                <div class="text-sm text-warm-500">{rec.visit_date}</div>
                {#if rec.diagnosis}
                  <div class="text-xs text-warm-400 mt-0.5">诊断: {rec.diagnosis}</div>
                {/if}
              </div>
              <div class="text-right">
                <div class="font-semibold text-warm-900">{formatCurrency(rec.total_amount)}</div>
                <div class="text-xs text-warm-400">{rec.status === 'analyzed' ? '已分析' : rec.status}</div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

  <!-- ── 医疗报告 Tab ── -->
  {:else if activeTab === 'reports'}
    {#if reports.length === 0}
      <div class="text-center py-12 text-warm-400">
        暂无医疗报告<br>
        <span class="text-xs text-warm-300">分析就诊记录后可生成报告</span>
      </div>
    {:else}
      <div class="space-y-3">
        {#each reports as rpt}
          <div class="card cursor-pointer hover:shadow-md transition-all"
               onclick={() => goto(`/reports/${rpt.id}`)} role="button" tabindex="0"
               onkeydown={(e) => { if (e.key === 'Enter') goto(`/reports/${rpt.id}`); }}>
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-warm-900">{rpt.title || '医疗报告'}</div>
                <div class="text-sm text-warm-500">{rpt.report_type} · {new Date(rpt.created_at).toLocaleDateString('zh-CN')}</div>
              </div>
              <div class="flex items-center gap-2">
                {#if rpt.pdf_status === 'compiled'}
                  <span class="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">PDF</span>
                {/if}
                <span class="text-xs px-1.5 py-0.5 rounded {rpt.qa_status === 'passed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                  {rpt.qa_status === 'passed' ? '✅' : '⚠️'}
                </span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
{/if}
