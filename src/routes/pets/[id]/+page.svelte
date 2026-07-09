<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  const petId = $page.params.id;

  let pet = $state<any>(null);
  let spending = $state<any>(null);
  let selectedYear = $state(new Date().getFullYear());
  let records = $state<any[]>([]);
  let policies = $state<any[]>([]);
  let reports = $state<any[]>([]);
  let vaccines = $state<any[]>([]);
  let medications = $state<any[]>([]);
  let loading = $state(true);
  let activeTab = $state<'overview' | 'records' | 'reports'>('overview');

  onMount(async () => {
    try {
      const [petRes, spendingRes, recordsRes, policiesRes, reportsRes, vacRes, medRes] = await Promise.all([
        fetch('/api/pets'), fetch(`/api/pets/${petId}/spending?year=${selectedYear}`),
        fetch(`/api/records?petId=${petId}`), fetch(`/api/insurance?petId=${petId}`),
        fetch(`/api/reports?petId=${petId}`), fetch(`/api/vaccines?petId=${petId}`),
        fetch(`/api/medications?petId=${petId}`),
      ]);
      if (petRes.ok) { const pets = await petRes.json(); pet = pets.find((p:any)=>p.id===petId); }
      if (spendingRes.ok) spending = await spendingRes.json();
      if (recordsRes.ok) { const d=await recordsRes.json(); records=d.records||d||[]; }
      if (policiesRes.ok) policies = await policiesRes.json();
      if (reportsRes.ok) { const d=await reportsRes.json(); reports=d.reports||d||[]; }
      if (vacRes.ok) vaccines = await vacRes.json();
      if (medRes.ok) medications = await medRes.json();
    } catch {}
    loading = false;
  });

  function formatCurrency(n: number): string {
    return n>=10000 ? '¥'+(n/10000).toFixed(1)+'万' : '¥'+n.toLocaleString('zh-CN');
  }
  function barHeight(t: number, m: number): string { return m===0?'4px':Math.max((t/m)*100,t>0?8:4)+'%'; }
  function getCatColor(c: string): string {
    const m: Record<string,string>={'检查':'#fb923c','药品':'#ef4444','治疗':'#f59e0b','手术':'#8b5cf6','耗材':'#6b7280','服务':'#14b8a6','预防':'#22c55e'};
    return m[c]||'#9ca3af';
  }
  function upcomingCount(items: any[], dateField: string): number {
    const now = new Date();
    return items.filter((i:any)=>new Date(i[dateField])>=now).length;
  }

  $effect(() => {
    fetch(`/api/pets/${petId}/spending?year=${selectedYear}`).then(r=>r.ok&&r.json()).then(d=>d&&(spending=d));
  });
</script>

{#if loading}
  <div class="max-w-4xl mx-auto py-12 text-center text-warm-400">加载中...</div>
{:else if !pet}
  <div class="max-w-4xl mx-auto py-12 text-center text-warm-400">宠物不存在</div>
{:else}
<div class="max-w-4xl mx-auto space-y-5 animate-enter">
  <!-- 顶部 -->
  <div class="flex items-center gap-3">
    <button class="text-warm-400 hover:text-warm-600 text-lg" onclick={()=>goto('/pets')}>←</button>
    <span class="text-3xl">{pet.species==='狗'?'🐶':'🐱'}</span>
    <div class="flex-1">
      <h1 class="text-xl font-bold text-warm-900">{pet.name}</h1>
      <p class="text-sm text-warm-500">{ [pet.breed,pet.gender,pet.birth_date?'🎂'+pet.birth_date:'',pet.weight_kg?'⚖️'+pet.weight_kg+'kg':''].filter(Boolean).join(' · ') || '暂无详细信息' }</p>
    </div>
  </div>

  <!-- 快速操作 -->
  <div class="grid grid-cols-4 gap-2">
    {#each [
      {href:'/upload',icon:'📸',label:'上传账单',color:'bg-brand-50 text-brand-700'},
      {href:'/health',icon:'🩺',label:'健康监测',color:'bg-emerald-50 text-emerald-700'},
      {href:'/vaccines',icon:'💉',label:'疫苗驱虫'+(vaccines.length>0?` ${vaccines.length}`:''),color:'bg-amber-50 text-amber-700'},
      {href:'/medications',icon:'💊',label:'用药提醒'+(medications.length>0?` ${medications.length}`:''),color:'bg-red-50 text-red-700'}
    ] as btn}
      <a href={btn.href} class="flex flex-col items-center gap-1 p-3 rounded-xl text-center no-underline {btn.color} hover:opacity-80 transition-opacity">
        <span class="text-lg">{btn.icon}</span>
        <span class="text-2xs font-medium">{btn.label}</span>
      </a>
    {/each}
  </div>

  <!-- 状态条 -->
  <div class="grid grid-cols-4 gap-3">
    {#each [
      {label:'就诊记录',val:records.length+'次',sub:'总花费 '+formatCurrency(spending?.annualTotal||0)},
      {label:'生效保单',val:policies.filter((p:any)=>p.status==='active').length+'份',sub:policies.length>0?'已配置保障':'未配置'},
      {label:'疫苗驱虫',val:upcomingCount(vaccines,'next_date')+'项待办',sub:vaccines.length+'条记录'},
      {label:'用药计划',val:upcomingCount(medications,'next_due')+'项进行中',sub:medications.length+'条记录'}
    ] as st}
      <div class="card text-center p-3">
        <div class="text-lg font-extrabold text-warm-900">{st.val}</div>
        <div class="text-2xs text-warm-500 mt-0.5">{st.label}</div>
        <div class="text-2xs text-warm-400">{st.sub}</div>
      </div>
    {/each}
  </div>

  <!-- Tab -->
  <div class="flex gap-1 bg-warm-100 rounded-lg p-1">
    {#each [{k:'overview',l:'💰 花费总览'},{k:'records',l:'📋 就诊记录'},{k:'reports',l:'📄 医疗报告'}] as tab}
      <button class="flex-1 py-2 rounded-md text-sm font-medium transition-colors {activeTab===tab.k?'bg-white shadow-sm text-warm-900':'text-warm-500'}" onclick={()=>activeTab=tab.k as typeof activeTab}>{tab.l}</button>
    {/each}
  </div>

  <!-- ── 花费总览 ── -->
  {#if activeTab === 'overview' && spending}
    <div class="flex items-center gap-2">
      <button class="text-warm-400 hover:text-warm-600" onclick={()=>selectedYear--} disabled={selectedYear<=2020}>‹</button>
      <span class="font-semibold text-warm-900">{selectedYear}年</span>
      <button class="text-warm-400 hover:text-warm-600" onclick={()=>selectedYear++} disabled={selectedYear>=new Date().getFullYear()}>›</button>
    </div>
    <div class="grid grid-cols-3 gap-3">
      <div class="card text-center p-3"><div class="text-xl font-extrabold text-warm-900">{formatCurrency(spending.annualTotal)}</div><div class="text-2xs text-warm-500 mt-0.5">年度总花费</div></div>
      <div class="card text-center p-3"><div class="text-xl font-extrabold text-warm-900">{spending.visitCount}次</div><div class="text-2xs text-warm-500 mt-0.5">就诊次数</div></div>
      <div class="card text-center p-3"><div class="text-xl font-extrabold text-warm-900">{formatCurrency(spending.avgPerVisit)}</div><div class="text-2xs text-warm-500 mt-0.5">单次均价</div></div>
    </div>
    {#if spending.annualTotal > 0}
      <div class="card">
        <h3 class="font-semibold text-sm text-warm-700 mb-3">📊 月度趋势</h3>
        <div class="flex items-end gap-0.5 h-24">
          {#each spending.monthlyTrend as m}
            <div class="flex-1 h-full flex flex-col justify-end group relative">
              <div class="w-full rounded-t-sm bg-brand-400 hover:bg-brand-500 transition-colors" style="height:{barHeight(m.total,Math.max(...spending.monthlyTrend.map((x:any)=>x.total),1))}" title="{m.month}月: {formatCurrency(m.total)}"></div>
            </div>
          {/each}
        </div>
        <div class="flex justify-between text-2xs text-warm-400 mt-1"><span>1月</span><span>6月</span><span>12月</span></div>
      </div>
      <div class="card">
        <h3 class="font-semibold text-sm text-warm-700 mb-3">🎨 费用构成</h3>
        <div class="space-y-1.5">
          {#each spending.categoryBreakdown.slice(0,5) as cat}
            <div class="flex items-center gap-2 text-xs">
              <span class="w-10 flex-shrink-0 text-warm-500">{cat.category}</span>
              <div class="flex-1 h-2 bg-warm-100 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:{cat.pct}%;background:{getCatColor(cat.category)}"></div></div>
              <span class="text-warm-600 w-14 text-right tabular-nums">{formatCurrency(cat.total)}</span>
              <span class="text-warm-400 w-8 text-right">{cat.pct}%</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    {#if spending.insurance?.hasPolicy}
      {@const ins=spending.insurance}
      <div class="card border-emerald-200 bg-emerald-50/30">
        <h3 class="font-semibold text-sm text-warm-700 mb-2">🛡️ {ins.company} — {ins.productName}</h3>
        <div class="grid grid-cols-3 gap-2 text-center text-sm">
          <div class="bg-white rounded-lg p-2"><div class="font-semibold">{formatCurrency(ins.totalSpent)}</div><div class="text-2xs text-warm-400">总花费</div></div>
          <div class="bg-white rounded-lg p-2"><div class="font-semibold text-emerald-600">{formatCurrency(ins.estimatedPayout)}</div><div class="text-2xs text-warm-400">预计赔付</div></div>
          <div class="bg-white rounded-lg p-2"><div class="font-semibold text-amber-600">{formatCurrency(ins.netOutOfPocket)}</div><div class="text-2xs text-warm-400">自付</div></div>
        </div>
        <div class="mt-2 text-xs text-warm-500">免赔额 {formatCurrency(ins.deductible)} {ins.deductibleMet?'✅ 已满足':'⚠️ 未达到'} · 利用率 {ins.limitUsedPct}%</div>
      </div>
    {:else if spending.annualTotal>0}
      <div class="card text-center text-sm text-warm-500"><button class="text-brand-600 underline" onclick={()=>goto('/insurance')}>添加保单</button>后可查看赔付预估</div>
    {/if}

  <!-- ── 就诊记录 ── -->
  {:else if activeTab === 'records'}
    {#if records.length===0}
      <div class="card text-center py-10 text-warm-400">暂无就诊记录</div>
    {:else}
      <div class="space-y-2">
        {#each records as rec}
          <div class="card cursor-pointer hover:shadow-raised transition-all" onclick={()=>goto(`/analysis/${rec.id}`)} role="button" tabindex="0" onkeydown={(e)=>{if(e.key==='Enter')goto(`/analysis/${rec.id}`)}}>
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-sm text-warm-900">{rec.hospital_name||'未知医院'}</div>
                <div class="text-xs text-warm-500">{rec.visit_date}{#if rec.diagnosis} · {rec.diagnosis}{/if}</div>
              </div>
              <div class="text-right"><div class="font-semibold text-sm">{formatCurrency(rec.total_amount)}</div><div class="text-2xs text-warm-400">{rec.status==='analyzed'?'已分析':rec.status}</div></div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

  <!-- ── 医疗报告 ── -->
  {:else if activeTab === 'reports'}
    {#if reports.length===0}
      <div class="card text-center py-10 text-warm-400">暂无医疗报告<br><span class="text-2xs">分析就诊记录后可生成</span></div>
    {:else}
      <div class="space-y-2">
        {#each reports as rpt}
          <div class="card cursor-pointer hover:shadow-raised transition-all" onclick={()=>goto(`/reports/${rpt.id}`)} role="button" tabindex="0" onkeydown={(e)=>{if(e.key==='Enter')goto(`/reports/${rpt.id}`)}}>
            <div class="flex items-center justify-between">
              <div><div class="font-medium text-sm text-warm-900">{rpt.title||'医疗报告'}</div><div class="text-xs text-warm-500">{rpt.report_type} · {new Date(rpt.created_at).toLocaleDateString('zh-CN')}</div></div>
              <span class="text-xs px-2 py-0.5 rounded-full {rpt.qa_status==='passed'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}">{rpt.qa_status==='passed'?'✅':'⚠️'}</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
{/if}
