<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { pets, loadPets } from '$lib/stores/pets';
  import { ArrowLeft, Syringe, Calendar, CheckCircle2, Clock, AlertTriangle } from '@lucide/svelte';

  let record = $state<any>(null);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    loadPets();
    try {
      const res = await fetch(`/api/vaccines?id=${$page.params.id}`);
      if (!res.ok) { error = '记录未找到'; loading = false; return; }
      record = await res.json();
    } catch { error = '加载失败'; }
    loading = false;
  });

  function getPetName(petId: string | null): string {
    if (!petId) return '未知宠物';
    const pet = $pets?.find(p => p.id === petId);
    return pet ? pet.name : '宠物';
  }

  function isOverdue(d: string): boolean { return new Date(d) < new Date(); }

  function formatDate(d: string): string {
    if (!d) return '';
    return d.slice(0, 10);
  }

  async function markDone() {
    if (!record) return;
    await fetch('/api/vaccines', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ petId: record.pet_id, vaccineType: record.vaccine_type, species: record.species, dateGiven: new Date().toISOString().split('T')[0], nextDate: record.next_date, notes: '已完成' }),
    });
    await fetch('/api/vaccines', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: record.id }) });
    goto('/vaccines');
  }
</script>

<svelte:head><title>{record ? record.vaccine_type : '疫苗详情'} — VetLens</title></svelte:head>

<div class="max-w-2xl mx-auto space-y-6 animate-enter">
  <a href="/vaccines" class="inline-flex items-center gap-1.5 text-sm text-warm-500 hover:text-brand-600 transition-colors">
    <ArrowLeft size={16} />返回疫苗日历
  </a>

  {#if loading}
    <div class="card text-center py-12"><div class="skeleton h-24 w-full rounded-xl"></div></div>
  {:else if error}
    <div class="card text-center py-12 text-warm-500">{error}</div>
  {:else}
    {@const overdue = isOverdue(record.next_date)}
    <div class="card {overdue ? 'border-red-200 bg-red-50/30' : 'border-warm-100'}">
      <div class="flex items-start justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl {overdue ? 'bg-red-100' : 'bg-amber-100'} flex items-center justify-center">
            <Syringe size={24} class={overdue ? 'text-red-500' : 'text-amber-500'} />
          </div>
          <div>
            <h1 class="text-lg font-bold text-warm-900">{record.vaccine_type}</h1>
            <p class="text-sm text-warm-500">{getPetName(record.pet_id)} · {record.species === '狗' ? '🐶' : '🐱'} {record.species}</p>
          </div>
        </div>
        <span class="badge {overdue ? 'badge-red' : 'badge-green'}">
          {overdue ? '已逾期' : record.status === 'done' ? '已完成' : '待接种'}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-4 text-sm">
        <div class="p-3 bg-warm-50 rounded-xl">
          <div class="flex items-center gap-1.5 text-xs text-warm-500 mb-1"><Calendar size={14} />接种日期</div>
          <div class="font-medium text-warm-900">{formatDate(record.date_given)}</div>
        </div>
        <div class="p-3 bg-warm-50 rounded-xl">
          <div class="flex items-center gap-1.5 text-xs text-warm-500 mb-1"><Clock size={14} />下次接种</div>
          <div class="font-medium {overdue ? 'text-red-600' : 'text-warm-900'}">{formatDate(record.next_date)}</div>
        </div>
      </div>

      {#if record.notes}
        <div class="mt-4 p-3 bg-warm-50 rounded-xl text-sm text-warm-600">{record.notes}</div>
      {/if}

      <div class="mt-6 flex gap-3">
        {#if !overdue && record.status !== 'done'}
          <button class="btn-primary inline-flex items-center gap-2" onclick={markDone}>
            <CheckCircle2 size={16} />标记已完成
          </button>
        {/if}
        {#if overdue}
          <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2 flex-1">
            <AlertTriangle size={16} class="flex-shrink-0 mt-0.5" />
            <span>该疫苗已超过建议接种时间，请尽快联系宠物医院安排接种。</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
