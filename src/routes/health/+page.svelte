<script lang="ts">
  import { onMount } from 'svelte';
  import { pets, loadPets } from '$lib/stores/pets';

  let activePetId = $state<string | null>(null);
  let species = $state<'猫' | '狗'>('猫');
  let activeTab = $state<'input' | 'trend'>('input');
  let loading = $state(false);
  let msg = $state('');

  let testDate = $state(new Date().toISOString().split('T')[0]);
  let form: Record<string, string> = $state({ bun:'', crea:'', glu:'', amy:'', wbc:'', rbc:'', hct:'' });
  let notes = $state('');

  let lastResult = $state<any>(null);
  let history = $state<any[]>([]);

  let selectedIndicator = $state<'overall' | 'kidney' | 'pancreas' | 'cbc'>('overall');

  onMount(() => { loadPets(); });

  $effect(() => {
    if (activePetId) {
      const pet = $pets.find(p => p.id === activePetId);
      if (pet) species = (pet.species === '狗' ? '狗' : '猫');
      loadHistory();
    }
  });

  async function loadHistory() {
    if (!activePetId) return;
    const res = await fetch(`/api/health-scores?petId=${activePetId}&limit=100`);
    if (res.ok) {
      history = await res.json();
      if (history.length > 0) lastResult = history[0];
    }
  }

  async function handleSubmit() {
    if (!activePetId) { msg = '请先选择宠物'; return; }
    loading = true; msg = '';
    try {
      const body: Record<string, any> = { petId: activePetId, testDate, species, notes };
      for (const [k, v] of Object.entries(form)) body[k] = v ? parseFloat(v) : null;
      const res = await fetch('/api/health-scores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('提交失败');
      const data = await res.json();
      lastResult = data;
      await loadHistory();
      activeTab = 'trend';
      msg = `评分完成: ${data.grade} (${data.overallScore}分)`;
    } catch (e) { msg = '提交失败: ' + (e as Error).message; }
    loading = false;
  }

  async function handleDelete(id: string) {
    if (!confirm('删除这条记录？')) return;
    await fetch('/api/health-scores', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    await loadHistory();
    if (lastResult?.id === id) lastResult = null;
  }

  function trendPoints(ind: string) {
    return [...history].reverse().filter(h => {
      if (ind === 'overall') return h.overall_score !== null;
      if (ind === 'kidney') return h.kidney_score !== null;
      if (ind === 'pancreas') return h.pancreas_score !== null;
      if (ind === 'cbc') return h.cbc_score !== null;
      return false;
    }).map((h, i) => ({ x: i, y: ind === 'overall' ? h.overall_score : ind === 'kidney' ? h.kidney_score : ind === 'pancreas' ? h.pancreas_score : h.cbc_score, label: h.test_date }));
  }

  let trendSvg = $derived.by(() => {
    const pts = trendPoints(selectedIndicator);
    if (pts.length < 2) return null;
    const maxY = Math.max(...pts.map(p => p.y), 1);
    return { pts, maxY, w: pts.length * 40, h: 180, pointsStr: pts.map((p, i) => `${i*40+20},${180 - (p.y/maxY)*160}`).join(' ') };
  });

  function scoreColor(s: number | null): string {
    if (s === null) return 'text-gray-400';
    if (s >= 80) return 'text-emerald-600'; else if (s >= 50) return 'text-amber-600';
    return 'text-red-600';
  }
  function gradeColor(g: string): string {
    if (g === 'A+' || g === 'A') return 'bg-emerald-100 text-emerald-800';
    if (g === 'B') return 'bg-blue-100 text-blue-800';
    if (g === 'C') return 'bg-amber-100 text-amber-800';
    if (g === 'D') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-500';
  }

  const FIELDS = [
    { key:'bun', name:'尿素氮 BUN', placeholder:'mmol/L (猫5.7-12.9, 狗2.5-9.6)', sec:'kidney' },
    { key:'crea', name:'肌酐 CREA', placeholder:'μmol/L (猫71-212, 狗44-159)', sec:'kidney' },
    { key:'glu', name:'血糖 GLU', placeholder:'mmol/L (猫3.9-8.3, 狗4.1-7.9)', sec:'pancreas' },
    { key:'amy', name:'淀粉酶 AMY', placeholder:'U/L (猫500-1500, 狗300-1500)', sec:'pancreas' },
    { key:'wbc', name:'白细胞 WBC', placeholder:'10^9/L (猫5.5-19.5, 狗6-17)', sec:'cbc' },
    { key:'rbc', name:'红细胞 RBC', placeholder:'10^12/L (猫5-10, 狗5.5-8.5)', sec:'cbc' },
    { key:'hct', name:'红细胞比容 HCT', placeholder:'% (猫24-45, 狗37-55)', sec:'cbc' },
  ];
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <h1 class="text-xl font-bold text-gray-900">🩺 健康监测</h1>

  <div class="flex gap-2 flex-wrap">
    {#each $pets as pet}
      <button class="px-4 py-2 rounded-lg text-sm font-medium transition-colors border-2 {activePetId === pet.id ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-600 border-gray-200'}" onclick={() => activePetId = pet.id}>
        {pet.species === '猫' ? '🐱' : '🐶'} {pet.name}
      </button>
    {/each}
  </div>

  {#if !activePetId}
    <div class="card text-center py-12 text-gray-400">请先选择一只宠物</div>
  {:else}
    <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
      <button class="flex-1 py-2 rounded-md text-sm font-medium transition-colors {activeTab==='input'?'bg-white shadow-sm text-gray-900':'text-gray-500'}" onclick={()=>activeTab='input'}>📝 录入数据</button>
      <button class="flex-1 py-2 rounded-md text-sm font-medium transition-colors {activeTab==='trend'?'bg-white shadow-sm text-gray-900':'text-gray-500'}" onclick={()=>activeTab='trend'}>📈 趋势曲线</button>
    </div>

    {#if msg}
      <div class="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-2 text-sm">{msg}</div>
    {/if}

    {#if activeTab === 'input'}
      <div class="card">
        <div class="flex items-center gap-4 mb-4">
          <input type="date" class="input-field w-40" bind:value={testDate} />
          <select class="input-field w-24" bind:value={species}><option value="猫">🐱 猫</option><option value="狗">🐶 狗</option></select>
        </div>
        {#each [{t:'🫘 肾功能 (32%)',s:'kidney',n:2},{t:'🍬 血糖+胰腺 (28%)',s:'pancreas',n:2},{t:'🩸 血常规 (30%)',s:'cbc',n:3}] as sec}
          <div class="mb-6">
            <h3 class="font-semibold text-gray-700 mb-3">{sec.t}</h3>
            <div class="grid grid-cols-2 gap-3">
              {#each FIELDS.filter(f=>f.sec===sec.s) as fld}
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">{fld.name}</label>
                  <input type="number" step="any" class="input-field" placeholder={fld.placeholder} bind:value={form[fld.key]} />
                </div>
              {/each}
            </div>
          </div>
        {/each}
        <input type="text" class="input-field mb-4" placeholder="备注（可选）" bind:value={notes} />
        <button class="btn-primary w-full" onclick={handleSubmit} disabled={loading}>{loading ? '计算中...' : '📊 提交并计算评分'}</button>
      </div>
    {:else}
      {#if lastResult}
        <div class="card bg-gradient-to-br from-white to-gray-50">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-gray-700">最新评分 ({lastResult.test_date?.slice(0,10)})</h3>
            <span class="px-3 py-1 rounded-full text-sm font-bold {gradeColor(lastResult.grade||'')}">{lastResult.grade||'—'}</span>
          </div>
          <div class="flex items-center gap-4 mb-6">
            <div class="text-5xl font-bold {scoreColor(lastResult.overall_score)}">{lastResult.overall_score ?? '—'}</div>
            <div class="text-sm text-gray-500">综合健康评分 /100</div>
          </div>
          <div class="space-y-3">
            {#each [{l:'肾功能',p:32,s:lastResult.kidney_score,c:'bg-amber-500'},{l:'血糖+胰腺',p:28,s:lastResult.pancreas_score,c:'bg-blue-500'},{l:'血常规',p:30,s:lastResult.cbc_score,c:'bg-emerald-500'}] as cat}
              <div class="flex items-center gap-3">
                <span class="text-sm w-20 text-gray-600">{cat.l}</span>
                <div class="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                  {#if cat.s !== null}<div class="h-full {cat.c} rounded-full transition-all" style="width:{cat.s}%"></div>{/if}
                </div>
                <span class="text-sm font-semibold {scoreColor(cat.s)} w-10 text-right">{cat.s ?? '—'}</span>
                <span class="text-xs text-gray-400 w-12 text-right">x{cat.p}%</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if history.length > 0}
        <div class="card">
          <h3 class="font-semibold text-gray-700 mb-3">📈 趋势曲线</h3>
          <div class="flex gap-2 mb-4">
            {#each [{k:'overall',l:'综合'},{k:'kidney',l:'肾功能'},{k:'pancreas',l:'血糖+胰腺'},{k:'cbc',l:'血常规'}] as opt}
              <button class="px-3 py-1 rounded-full text-xs font-medium {selectedIndicator===opt.k?'bg-primary-500 text-white':'bg-gray-100 text-gray-600'}" onclick={()=>selectedIndicator=opt.k as any}>{opt.l}</button>
            {/each}
          </div>
          {#if trendSvg}
            <div class="relative h-48">
              <svg viewBox="0 0 {trendSvg.w} {trendSvg.h}" class="w-full h-full">
                {#each [0,25,50,75,100] as gy}
                  <line x1="0" y1={trendSvg.h-gy*1.6} x2={trendSvg.w} y2={trendSvg.h-gy*1.6} stroke="#e5e7eb" stroke-width="1"/>
                  <text x="0" y={trendSvg.h+3-gy*1.6} fill="#9ca3af" font-size="10">{gy}</text>
                {/each}
                <polyline fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" points={trendSvg.pointsStr}/>
                {#each trendSvg.pts as pt, i}
                  <circle cx={i*40+20} cy={trendSvg.h-(pt.y/trendSvg.maxY)*160} r="5" fill="#3b82f6" stroke="white" stroke-width="2"/>
                  <text x={i*40+20} y="195" fill="#9ca3af" font-size="9" text-anchor="middle">{pt.label.slice(5)}</text>
                  <title>{pt.label}: {pt.y}分</title>
                {/each}
              </svg>
            </div>
          {:else}
            <div class="text-center py-8 text-gray-400 text-sm">至少需要2次记录才能生成趋势曲线</div>
          {/if}
        </div>
      {/if}

      {#if history.length > 0}
        <div class="card">
          <h3 class="font-semibold text-gray-700 mb-3">📋 历史记录</h3>
          <div class="space-y-2">
            {#each history as h}
              <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div><span class="text-sm font-medium text-gray-800">{h.test_date?.slice(0,10)}</span><span class="text-xs text-gray-400 ml-2">{h.species==='狗'?'🐶':'🐱'}</span></div>
                <div class="flex items-center gap-3">
                  <span class="text-xs text-gray-500">肾:{h.kidney_score??'—'} 胰:{h.pancreas_score??'—'} 血:{h.cbc_score??'—'}</span>
                  <span class="text-sm font-bold {scoreColor(h.overall_score)}">{h.overall_score??'—'}分</span>
                  <span class="px-1.5 py-0.5 rounded text-xs {gradeColor(h.grade||'')}">{h.grade||'—'}</span>
                  <button class="text-red-400 text-xs hover:text-red-600" onclick={()=>handleDelete(h.id)}>🗑️</button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else if !lastResult}
        <div class="card text-center py-12 text-gray-400">暂无健康数据，请先录入</div>
      {/if}
    {/if}
  {/if}
</div>
