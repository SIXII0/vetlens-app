<script lang="ts">
  import { onMount } from 'svelte';
  import { pets, loadPets } from '$lib/stores/pets';

  let activePetId = $state<string | null>(null);
  let meds = $state<any[]>([]);
  let loading = $state(false);
  let showForm = $state(false);
  let form = $state({ medName:'', dosage:'', frequency:'每天', startDate: new Date().toISOString().split('T')[0], nextDue:'', notes:'' });

  const FREQUENCIES = ['每天','每12小时','每8小时','每周','每2周','每月'];

  onMount(() => loadPets());
  $effect(() => { if (activePetId) loadMeds(); });

  async function loadMeds() {
    if (!activePetId) return;
    loading = true;
    const res = await fetch(`/api/medications?petId=${activePetId}`);
    if (res.ok) meds = await res.json();
    loading = false;
  }

  async function handleSubmit() {
    if (!activePetId || !form.medName) return;
    const res = await fetch('/api/medications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ petId: activePetId, medName: form.medName, dosage: form.dosage, frequency: form.frequency, startDate: form.startDate, nextDue: form.nextDue || form.startDate, notes: form.notes }),
    });
    if (res.ok) { showForm = false; loadMeds(); form = { medName:'',dosage:'',frequency:'每天',startDate:new Date().toISOString().split('T')[0],nextDue:'',notes:'' }; }
  }

  async function markTaken(id: string) {
    const m = meds.find(x => x.id === id);
    if (!m) return;
    const next = new Date();
    if (m.frequency === '每天') next.setDate(next.getDate() + 1);
    else if (m.frequency === '每12小时') next.setHours(next.getHours() + 12);
    else if (m.frequency === '每周') next.setDate(next.getDate() + 7);
    else next.setDate(next.getDate() + 1);
    await fetch('/api/medications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, nextDue: next.toISOString().split('T')[0] }) });
    loadMeds();
  }

  async function handleDelete(id: string) {
    await fetch('/api/medications', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadMeds();
  }
</script>

<div class="max-w-4xl mx-auto space-y-6 animate-enter">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold text-warm-900">💊 用药提醒</h1>
    <button class="btn-primary text-sm" onclick={() => showForm = true}>+ 添加用药</button>
  </div>

  <div class="flex gap-2 flex-wrap">
    {#each $pets as pet}
      <button class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors {activePetId===pet.id?'bg-brand-500 text-white':'bg-white text-warm-600 border border-warm-200'}" onclick={()=>activePetId=pet.id}>
        {pet.species==='猫'?'🐱':'🐶'} {pet.name}
      </button>
    {/each}
  </div>

  {#if showForm}
    <div class="card">
      <h3 class="font-semibold text-warm-900 mb-3">添加用药提醒</h3>
      <div class="grid grid-cols-2 gap-3 mb-3">
        <input type="text" class="input-field" placeholder="药品名称" bind:value={form.medName} />
        <input type="text" class="input-field" placeholder="剂量（如 2.5mg/kg）" bind:value={form.dosage} />
        <select class="input-field" bind:value={form.frequency}>
          {#each FREQUENCIES as f}<option value={f}>{f}</option>{/each}
        </select>
        <input type="date" class="input-field" bind:value={form.nextDue} />
      </div>
      <div class="flex gap-2 justify-end">
        <button class="btn-secondary" onclick={()=>showForm=false}>取消</button>
        <button class="btn-primary" onclick={handleSubmit} disabled={!form.medName}>保存</button>
      </div>
    </div>
  {/if}

  {#if !activePetId}
    <div class="card text-center py-12 text-warm-400">请先选择宠物</div>
  {:else if loading}
    <div class="card text-center py-8 text-warm-400">加载中...</div>
  {:else if meds.length === 0}
    <div class="card text-center py-12 text-warm-400">暂无用药提醒</div>
  {:else}
    <div class="space-y-2">
      {#each meds as m}
        <div class="card flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-lg">💊</span>
            <div>
              <div class="font-medium text-sm text-warm-900">{m.med_name} {m.dosage ? `· ${m.dosage}` : ''}</div>
              <div class="text-xs text-warm-500">{m.frequency} · 下次: {m.next_due}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs px-2 py-0.5 rounded-full {new Date(m.next_due) < new Date() ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}">
              {new Date(m.next_due) < new Date() ? '已到时间' : '正常'}
            </span>
            <button class="text-xs text-emerald-600 hover:underline" onclick={()=>markTaken(m.id)}>已服</button>
            <button class="text-xs text-red-400" onclick={()=>handleDelete(m.id)}>🗑️</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
