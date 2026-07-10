<script lang="ts">
  import { onMount } from 'svelte';
  import { pets, loadPets } from '$lib/stores/pets';

  let activePetId = $state<string | null>(null);
  let meds = $state<any[]>([]);
  let loading = $state(false);
  let showForm = $state(false);
  let form = $state({ medName:'', dosage:'', frequency:'每天', startDate: new Date().toISOString().split('T')[0], durationDays:'', nextDue:'', notes:'' });
  let editingId = $state<string | null>(null);
  let editForm = $state({ medName:'', dosage:'', frequency:'每天', startDate:'', nextDue:'', notes:'' });

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
    const body: Record<string, any> = {
      petId: activePetId,
      medName: form.medName,
      dosage: form.dosage,
      frequency: form.frequency,
      startDate: form.startDate,
      notes: form.notes,
    };
    if (form.durationDays) body.durationDays = parseInt(form.durationDays);
    if (form.nextDue) body.nextDue = form.nextDue;
    const res = await fetch('/api/medications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      showForm = false;
      loadMeds();
      form = { medName:'', dosage:'', frequency:'每天', startDate: new Date().toISOString().split('T')[0], durationDays:'', nextDue:'', notes:'' };
    }
  }

  async function markTaken(id: string) {
    const res = await fetch('/api/medications', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.completed) {
      // 疗程结束，直接刷新列表
    }
    loadMeds();
  }

  function startEdit(m: any) {
    editingId = m.id;
    editForm = {
      medName: m.med_name,
      dosage: m.dosage || '',
      frequency: m.frequency,
      startDate: m.start_date,
      nextDue: m.next_due?.includes(' ') ? m.next_due.replace(' ','T') : (m.next_due ? m.next_due + 'T08:00' : ''),
      notes: m.notes || '',
    };
  }

  function cancelEdit() { editingId = null; }

  async function saveEdit() {
    if (!editingId) return;
    await fetch('/api/medications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, ...editForm }),
    });
    editingId = null;
    loadMeds();
  }

  async function handleDelete(id: string) {
    await fetch('/api/medications', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadMeds();
  }

  function freqLabel(f: string): string {
    const m: Record<string,string> = { '每天':'日','每12小时':'12h','每8小时':'8h','每周':'周','每2周':'2周','每月':'月' };
    return m[f] || f;
  }

  function isOverdue(due: string): boolean {
    const now = new Date();
    // next_due 格式: "2026-07-10 08:00" 或 "2026-07-10"
    const dueDate = new Date(due.includes(' ') ? due.replace(' ','T') : due + 'T00:00');
    return dueDate < now;
  }

  function formatDue(due: string): string {
    if (!due) return '';
    if (due.includes(' ')) {
      // 含时分: "2026-07-10 08:00"
      const [d, t] = due.split(' ');
      return d.slice(5) + ' ' + t.slice(0,5);
    }
    return due.slice(5);
  }
</script>

<div class="max-w-4xl mx-auto space-y-6 animate-enter">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold text-warm-900">💊 用药提醒</h1>
    <button class="btn-primary text-sm" onclick={() => showForm = true}>+ 添加用药</button>
  </div>
  <div class="card bg-gradient-to-r from-rose-50 to-white border-rose-100 px-4 py-3"><div><h3 class="font-semibold text-sm text-rose-800">服药计划与提醒</h3><p class="text-xs text-warm-500 mt-0.5 leading-relaxed">管理长期或短期用药计划，支持 6 种频次（每天/8h/12h/周/2周/月），自动推算下一剂时间并到时提醒。</p></div></div>

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
        <input type="text" class="input-field" placeholder="药品名称 *" bind:value={form.medName} />
        <input type="text" class="input-field" placeholder="剂量（如 2.5mg/kg）" bind:value={form.dosage} />
        <select class="input-field" bind:value={form.frequency}>
          {#each FREQUENCIES as f}<option value={f}>{f}</option>{/each}
        </select>
        <input type="date" class="input-field" bind:value={form.startDate} title="开始日期" />
        <input type="number" class="input-field" placeholder="疗程天数（长期留空）" bind:value={form.durationDays} min="1" />
        <input type="datetime-local" class="input-field" bind:value={form.nextDue} title="首次提醒时间（留空自动推算）" />
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
        {@const overdue = isOverdue(m.next_due)}
        {#if editingId === m.id}
          <div class="card border-2 border-brand-300 bg-brand-50">
            <div class="grid grid-cols-3 gap-2 mb-2">
              <input type="text" class="input-field text-sm" placeholder="药品名称" bind:value={editForm.medName} />
              <input type="text" class="input-field text-sm" placeholder="剂量" bind:value={editForm.dosage} />
              <select class="input-field text-sm" bind:value={editForm.frequency}>
                {#each FREQUENCIES as f}<option value={f}>{f}</option>{/each}
              </select>
              <input type="date" class="input-field text-sm" bind:value={editForm.startDate} title="开始日期" />
              <input type="datetime-local" class="input-field text-sm" bind:value={editForm.nextDue} title="下次提醒时间" />
              <input type="text" class="input-field text-sm" placeholder="备注" bind:value={editForm.notes} />
            </div>
            <div class="flex gap-2 justify-end">
              <button class="btn-secondary text-xs" onclick={cancelEdit}>取消</button>
              <button class="btn-primary text-xs" onclick={saveEdit}>💾 保存</button>
            </div>
          </div>
        {:else}
        <div class="card flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-lg">💊</span>
            <div>
              <div class="font-medium text-sm text-warm-900">
                {m.med_name} {m.dosage ? `· ${m.dosage}` : ''}
                <span class="text-xs text-warm-400 ml-1">({freqLabel(m.frequency)})</span>
              </div>
              <div class="text-xs text-warm-500">
                下次: {formatDue(m.next_due)}
                {#if m.end_date}
                  <span class="text-warm-400 ml-1">· 至 {m.end_date}</span>
                {:else}
                  <span class="text-emerald-500 ml-1">· 长期</span>
                {/if}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs px-2 py-0.5 rounded-full {overdue ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}">
              {overdue ? '⏰ 到时间' : '正常'}
            </span>
            <button class="btn-primary text-xs !py-1 !px-2" onclick={()=>markTaken(m.id)}>✓ 已服</button>
            <button class="text-xs text-warm-400 hover:text-brand-600" onclick={()=>startEdit(m)} title="编辑">✏️</button>
            <button class="text-xs text-red-400 hover:text-red-600" onclick={()=>handleDelete(m.id)}>🗑️</button>
          </div>
        </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
