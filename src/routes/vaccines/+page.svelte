<script lang="ts">
  import { onMount } from 'svelte';
  import { pets, loadPets } from '$lib/stores/pets';

  let activePetId = $state<string | null>(null);
  let vaccines = $state<any[]>([]);
  let loading = $state(false);
  let showForm = $state(false);
  let form = $state({ vaccineType:'三联', dateGiven: new Date().toISOString().split('T')[0], nextDate:'', notes:'' });
  let msg = $state('');

  const VACCINE_TYPES: Record<string,{label:string,interval:number,unit:string,species:string[]}> = {
    '三联(FVRCP)': {label:'猫三联 FVRCP',interval:3,unit:'周',species:['猫']},
    '狂犬': {label:'狂犬疫苗',interval:12,unit:'月',species:['猫','狗']},
    '四联': {label:'猫四联',interval:3,unit:'周',species:['猫']},
    '六联(DHPP)': {label:'狗六联 DHPP',interval:3,unit:'周',species:['狗']},
    '八联': {label:'狗八联',interval:3,unit:'周',species:['狗']},
    '驱虫-体内': {label:'体内驱虫',interval:3,unit:'月',species:['猫','狗']},
    '驱虫-体外': {label:'体外驱虫',interval:1,unit:'月',species:['猫','狗']},
    '体检': {label:'年度体检',interval:12,unit:'月',species:['猫','狗']},
  };

  onMount(() => loadPets());

  $effect(() => { if (activePetId) loadVaccines(); });

  async function loadVaccines() {
    if (!activePetId) return;
    loading = true;
    const res = await fetch(`/api/vaccines?petId=${activePetId}`);
    if (res.ok) vaccines = await res.json();
    loading = false;
  }

  function autoSetNext(type: string) {
    const t = VACCINE_TYPES[type];
    if (!t) return;
    const d = new Date(form.dateGiven);
    if (t.unit === '周') d.setDate(d.getDate() + t.interval * 7);
    else d.setMonth(d.getMonth() + t.interval);
    form.nextDate = d.toISOString().split('T')[0];
  }

  async function handleSubmit() {
    if (!activePetId) return;
    const pet = $pets.find(p => p.id === activePetId);
    const species = pet?.species || '猫';
    const res = await fetch('/api/vaccines', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ petId: activePetId, vaccineType: form.vaccineType, species, dateGiven: form.dateGiven, nextDate: form.nextDate, notes: form.notes }),
    });
    if (res.ok) { showForm = false; loadVaccines(); msg = '已添加'; }
  }

  async function markDone(id: string) {
    const v = vaccines.find(v => v.id === id);
    if (!v) return;
    // Create next dose
    await fetch('/api/vaccines', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ petId: activePetId, vaccineType: v.vaccine_type, species: v.species, dateGiven: new Date().toISOString().split('T')[0], nextDate: v.next_date, notes: '已完成' }),
    });
    await fetch('/api/vaccines', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadVaccines(); msg = '已标记完成，下次自动添加';
  }

  async function handleDelete(id: string) {
    await fetch('/api/vaccines', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadVaccines();
  }

  function isOverdue(d: string): boolean { return new Date(d) < new Date(); }
  function isSoon(d: string): boolean { const n = new Date(); n.setDate(n.getDate() + 14); return new Date(d) <= n; }
</script>

<div class="max-w-4xl mx-auto space-y-6 animate-enter">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold text-warm-900">💉 疫苗与驱虫日历</h1>
    <button class="btn-primary text-sm" onclick={() => { showForm = true; form.dateGiven = new Date().toISOString().split('T')[0]; autoSetNext(form.vaccineType); }}>+ 添加记录</button>
    </div>
<div class="card bg-gradient-to-r from-amber-50 to-white border-amber-100 mb-4 px-4 py-3"><div><h3 class="font-semibold text-sm text-amber-800">预防保健日历</h3><p class="text-xs text-warm-500 mt-0.5 leading-relaxed">记录疫苗接种和驱虫时间，提前提醒下一针，建立完整的预防保健档案。支持猫三联/狂犬/体内外驱虫等。</p></div></div>

  <div class="flex gap-2 flex-wrap">
    {#each $pets as pet}
      <button class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors {activePetId===pet.id?'bg-brand-500 text-white':'bg-white text-warm-600 border border-warm-200 hover:border-warm-300'}" onclick={()=>activePetId=pet.id}>
        {pet.species==='猫'?'🐱':'🐶'} {pet.name}
      </button>
    {/each}
  </div>

  {#if msg}<div class="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-2 text-sm">{msg}</div>{/if}

  {#if showForm}
    <div class="card">
      <h3 class="font-semibold text-warm-900 mb-3">添加疫苗/驱虫记录</h3>
      <div class="grid grid-cols-2 gap-3 mb-3">
        <select class="input-field" bind:value={form.vaccineType} onchange={() => autoSetNext(form.vaccineType)}>
          {#each Object.entries(VACCINE_TYPES) as [k,v]}
            <option value={k}>{v.label}</option>
          {/each}
        </select>
        <input type="date" class="input-field" bind:value={form.dateGiven} onchange={() => autoSetNext(form.vaccineType)} />
        <input type="date" class="input-field" bind:value={form.nextDate} />
        <input type="text" class="input-field" placeholder="备注（可选）" bind:value={form.notes} />
      </div>
      <div class="flex gap-2 justify-end">
        <button class="btn-secondary" onclick={()=>showForm=false}>取消</button>
        <button class="btn-primary" onclick={handleSubmit} disabled={!form.nextDate}>保存</button>
      </div>
    </div>
  {/if}

  {#if !activePetId}
    <div class="card text-center py-12 text-warm-400">请先选择宠物</div>
  {:else if loading}
    <div class="card text-center py-8 text-warm-400">加载中...</div>
  {:else if vaccines.length === 0}
    <div class="card text-center py-12 text-warm-400">暂无记录，点击"+ 添加记录"开始</div>
  {:else}
    <div class="space-y-2">
      {#each vaccines as v}
        <div class="card flex items-center justify-between {isOverdue(v.next_date)?'border-red-200 bg-red-50/30':isSoon(v.next_date)?'border-amber-200 bg-amber-50/30':''}">
          <div class="flex items-center gap-3">
            <span class="text-lg">{v.vaccine_type?.includes('驱虫')?'💊':'💉'}</span>
            <div>
              <div class="font-medium text-sm text-warm-900">{v.vaccine_type}</div>
              <div class="text-xs text-warm-500">{v.date_given} 接种 → 下次 {v.next_date}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs px-2 py-0.5 rounded-full {isOverdue(v.next_date)?'bg-red-100 text-red-700':'bg-emerald-100 text-emerald-700'}">
              {isOverdue(v.next_date) ? '已逾期' : isSoon(v.next_date) ? '临近' : '正常'}
            </span>
            <button class="text-xs text-emerald-600 hover:underline" onclick={()=>markDone(v.id)}>完成</button>
            <button class="text-xs text-red-400" onclick={()=>handleDelete(v.id)}>🗑️</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
