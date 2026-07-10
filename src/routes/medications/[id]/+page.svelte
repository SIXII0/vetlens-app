<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { pets, loadPets } from '$lib/stores/pets';
  import { ArrowLeft, Pill, Calendar, Clock, CheckCircle2, AlertTriangle, Edit3, RotateCcw } from '@lucide/svelte';

  let record = $state<any>(null);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    loadPets();
    try {
      const res = await fetch(`/api/medications?id=${$page.params.id}`);
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

  function isOverdue(due: string): boolean {
    const dueDate = new Date(due.includes(' ') ? due.replace(' ', 'T') : due + 'T00:00');
    return dueDate < new Date();
  }

  function formatDate(d: string): string {
    if (!d) return '';
    if (d.includes(' ')) {
      const [date, time] = d.split(' ');
      return date.slice(5) + ' ' + time.slice(0, 5);
    }
    return d.slice(5);
  }

  function freqLabel(f: string): string {
    const m: Record<string, string> = { '每天': '每日一次', '每12小时': '每12小时一次', '每8小时': '每8小时一次', '每周': '每周一次', '每2周': '每两周一次', '每月': '每月一次' };
    return m[f] || f;
  }

  async function markTaken() {
    if (!record) return;
    const res = await fetch('/api/medications', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: record.id }),
    });
    const data = await res.json();
    if (data.completed) {
      goto('/medications');
    } else {
      // 刷新
      const refetch = await fetch(`/api/medications?id=${record.id}`);
      if (refetch.ok) record = await refetch.json();
    }
  }
</script>

<svelte:head><title>{record ? record.med_name : '用药详情'} — VetLens</title></svelte:head>

<div class="max-w-2xl mx-auto space-y-6 animate-enter">
  <a href="/medications" class="inline-flex items-center gap-1.5 text-sm text-warm-500 hover:text-brand-600 transition-colors">
    <ArrowLeft size={16} />返回用药管理
  </a>

  {#if loading}
    <div class="card text-center py-12"><div class="skeleton h-24 w-full rounded-xl"></div></div>
  {:else if error}
    <div class="card text-center py-12 text-warm-500">{error}</div>
  {:else}
    {@const overdue = isOverdue(record.next_due)}
    <div class="card {overdue ? 'border-red-200 bg-red-50/30' : 'border-warm-100'}">
      <div class="flex items-start justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl {overdue ? 'bg-red-100' : 'bg-blue-100'} flex items-center justify-center">
            <Pill size={24} class={overdue ? 'text-red-500' : 'text-blue-500'} />
          </div>
          <div>
            <h1 class="text-lg font-bold text-warm-900">{record.med_name}</h1>
            <p class="text-sm text-warm-500">{getPetName(record.pet_id)}{#if record.dosage} · {record.dosage}{/if}</p>
          </div>
        </div>
        <span class="badge {overdue ? 'badge-red' : record.active ? 'badge-green' : 'badge-gray'}">
          {overdue ? '已到时间' : record.active ? '服药中' : '已停用'}
        </span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div class="p-3 bg-warm-50 rounded-xl">
          <div class="flex items-center gap-1.5 text-xs text-warm-500 mb-1"><RotateCcw size={14} />服用频次</div>
          <div class="font-medium text-warm-900">{freqLabel(record.frequency)}</div>
        </div>
        <div class="p-3 bg-warm-50 rounded-xl">
          <div class="flex items-center gap-1.5 text-xs text-warm-500 mb-1"><Calendar size={14} />开始日期</div>
          <div class="font-medium text-warm-900">{formatDate(record.start_date).split(' ')[0]}</div>
        </div>
        <div class="p-3 bg-warm-50 rounded-xl">
          <div class="flex items-center gap-1.5 text-xs text-warm-500 mb-1"><Clock size={14} />下次用药</div>
          <div class="font-medium {overdue ? 'text-red-600' : 'text-warm-900'}">{formatDate(record.next_due)}</div>
        </div>
      </div>

      {#if record.end_date}
        <div class="mt-3 text-xs text-warm-500">疗程截止: {formatDate(record.end_date).split(' ')[0]}</div>
      {:else}
        <div class="mt-3 text-xs text-emerald-600 font-medium">长期用药</div>
      {/if}

      {#if record.notes}
        <div class="mt-4 p-3 bg-warm-50 rounded-xl text-sm text-warm-600">{record.notes}</div>
      {/if}

      <div class="mt-6 flex gap-3">
        {#if record.active}
          <button class="btn-primary inline-flex items-center gap-2" onclick={markTaken}>
            <CheckCircle2 size={16} />标记已服用
          </button>
        {/if}
        {#if overdue}
          <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2 flex-1">
            <AlertTriangle size={16} class="flex-shrink-0 mt-0.5" />
            <span>该用药已超过预定时间，请尽快按医嘱给药。</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
