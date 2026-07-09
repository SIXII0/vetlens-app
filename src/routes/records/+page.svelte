<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCurrency, formatDate, timeAgo } from '$lib/utils/format';

  let records = $state<any[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let deleting = $state<string | null>(null);

  onMount(async () => {
    await loadRecords();
  });

  async function loadRecords() {
    loading = true;
    try {
      const res = await fetch('/api/records?limit=50');
      if (res.ok) {
        const data = await res.json();
        records = data.records;
        total = data.total;
      }
    } catch { /* ignore */ }
    loading = false;
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除这条记录吗？')) return;
    deleting = id;
    try {
      await fetch('/api/records', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      records = records.filter(r => r.id !== id);
    } catch { /* ignore */ }
    deleting = null;
  }
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold text-warm-900">📋 就诊记录</h1>
    <a href="/upload" class="btn-primary text-sm">+ 新建分析</a>
  </div>

  {#if loading}
    <div class="card text-center py-12 text-warm-500">加载中...</div>
  {:else if records.length === 0}
    <div class="card text-center py-12">
      <div class="text-5xl mb-4">📋</div>
      <h3 class="font-semibold text-warm-700 mb-2">暂无就诊记录</h3>
      <p class="text-sm text-warm-500 mb-4">上传第一张宠物医院账单</p>
      <a href="/upload" class="btn-primary inline-block">开始分析</a>
    </div>
  {:else}
    <div class="space-y-3">
      {#each records as record}
        <a href="/analysis/{record.id}" class="card-hover flex items-center gap-4 no-underline text-warm-900">
          <span class="text-xl">
            {record.status === 'analyzed' ? '✅' : '📝'}
          </span>
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate">
              {record.hospital_name || '未知医院'}
              {#if record.hospital_city}
                <span class="text-xs text-warm-400 ml-1">{record.hospital_city}</span>
              {/if}
            </div>
            <div class="text-xs text-warm-500">
              {formatDate(record.visit_date)}
              {#if record.visit_reason}
                · {record.visit_reason}
              {/if}
            </div>
          </div>
          <div class="text-right flex-shrwarm-0">
            <div class="font-semibold">{formatCurrency(record.total_amount)}</div>
            <div class="text-xs text-warm-400">{timeAgo(record.visit_date)}</div>
          </div>
          <button
            class="btn-ghost text-red-400 hover:text-red-600 text-sm px-2 ml-2"
            onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(record.id); }}
            disabled={deleting === record.id}
          >
            {deleting === record.id ? '...' : '🗑️'}
          </button>
        </a>
      {/each}
    </div>
  {/if}
</div>
