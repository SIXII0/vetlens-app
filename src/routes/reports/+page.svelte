<script lang="ts">
  import { onMount } from 'svelte';
  import { formatDate } from '$lib/utils/format';

  let reports = $state<any[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let deleting = $state<string | null>(null);
  let typeFilter = $state('');

  const REPORT_LABELS: Record<string, { icon: string; label: string }> = {
    general: { icon: '📋', label: '综合报告' },
    medical_summary: { icon: '🩺', label: '兽医解读' },
    bill_explain: { icon: '💰', label: '账单解释' },
    claim_check: { icon: '🛡️', label: '理赔检查' },
    timeline: { icon: '📅', label: '就诊时间线' },
    chronic_review: { icon: '🔄', label: '慢病复盘' },
    clinic_client_summary: { icon: '🏥', label: '客户材料' },
  };

  function reportLabel(type: string) {
    return REPORT_LABELS[type] || { icon: '📄', label: type };
  }

  onMount(() => {
    loadReports();
  });

  async function loadReports() {
    loading = true;
    try {
      let url = '/api/reports?limit=50';
      if (typeFilter) url += `&type=${encodeURIComponent(typeFilter)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        reports = data.reports;
        total = data.total;
      }
    } catch { /* ignore */ }
    loading = false;
  }

  function applyTypeFilter(type: string) {
    typeFilter = typeFilter === type ? '' : type;
    loadReports();
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除这份报告吗？')) return;
    deleting = id;
    try {
      const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      if (res.ok) {
        reports = reports.filter(r => r.id !== id);
        total--;
      }
    } catch { /* ignore */ }
    deleting = null;
  }
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold text-gray-900">📄 分析报告</h1>
    <a href="/upload" class="btn-primary text-sm">+ 新建分析</a>
  </div>

  <!-- 类型过滤 -->
  <div class="flex gap-2 flex-wrap">
    {#each Object.entries(REPORT_LABELS) as [type, { icon, label }]}
      <button
        class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors border"
        class:bg-primary-50={typeFilter === type}
        class:border-primary-300={typeFilter === type}
        class:text-primary-700={typeFilter === type}
        class:bg-white={typeFilter !== type}
        class:border-gray-200={typeFilter !== type}
        class:text-gray-600={typeFilter !== type}
        class:hover:bg-gray-50={typeFilter !== type}
        onclick={() => applyTypeFilter(type)}
      >
        {icon} {label}
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="card text-center py-12 text-gray-500">加载中...</div>
  {:else if reports.length === 0}
    <div class="card text-center py-12">
      <div class="text-5xl mb-4">📄</div>
      <h3 class="font-semibold text-gray-700 mb-2">暂无分析报告</h3>
      <p class="text-sm text-gray-500 mb-4">上传账单并选择报告格式即可生成结构化报告</p>
      <a href="/upload" class="btn-primary inline-block">上传账单</a>
    </div>
  {:else}
    <div class="text-sm text-gray-500">
      共 {total} 份报告
    </div>
    <div class="space-y-3">
      {#each reports as report}
        <div class="card-hover flex items-center gap-4">
          <span class="text-2xl">{reportLabel(report.reportType).icon}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <a href="/reports/{report.id}" class="font-medium truncate hover:text-primary-600 text-gray-900 no-underline">
                {report.title}
              </a>
              {#if report.qaResult?.passed}
                <span class="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">✅ QA</span>
              {:else}
                <span class="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">⚠️ QA</span>
              {/if}
            </div>
            <div class="text-xs text-gray-500">
              {reportLabel(report.reportType).label}
              {#if report.petName && report.petName !== '待确认'}
                · 🐾 {report.petName}
              {/if}
              {#if report.recordId}
                · <a href="/analysis/{report.recordId}" class="text-primary-500 hover:underline">查看就诊记录</a>
              {/if}
            </div>
            <div class="text-xs text-gray-400 mt-0.5">
              {formatDate(report.createdAt.split('T')[0])} 生成
              {#if report.hasPdf}
                · 📎 PDF 可用
              {/if}
            </div>
          </div>
          <button
            class="btn-ghost text-red-400 hover:text-red-600 text-sm px-2"
            onclick={() => handleDelete(report.id)}
            disabled={deleting === report.id}
          >
            {deleting === report.id ? '...' : '🗑️'}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
