<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { formatDate } from '$lib/utils/format';

  let loading = $state(true);
  let error = $state<string | null>(null);
  let report: any = $state(null);

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

  onMount(async () => {
    try {
      const res = await fetch(`/api/reports/${$page.params.id}`);
      if (!res.ok) {
        error = '报告不存在';
        loading = false;
        return;
      }
      report = await res.json();
    } catch (e) {
      error = '加载失败';
    } finally {
      loading = false;
    }
  });

  function downloadMarkdown() {
    if (!report?.markdown) return;
    const blob = new Blob([report.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.title || 'report'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function markdownToHtml(md: string): string {
    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-5 mb-2 text-gray-800">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-6 mb-3 text-gray-900 border-b pb-1">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-4 text-gray-900">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/^\|(.+)\|$/gm, (match) => {
        if (match.includes('---')) return '<tr class="border-b border-gray-200"></tr>';
        const cells = match.split('|').filter(c => c.trim()).map(c => c.trim());
        return `<tr class="border-b border-gray-100">${cells.map(c =>
          `<td class="px-2 py-1.5 text-sm">${c}</td>`
        ).join('')}</tr>`;
      })
      .replace(/^> (.+)$/gm, '<blockquote class="border-l-3 border-amber-400 bg-amber-50 pl-3 py-1 my-2 text-sm text-amber-800 rounded-r">$1</blockquote>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 text-sm text-gray-600">• $1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-sm text-gray-600">$1</li>')
      .replace(/^---$/gm, '<hr class="my-4 border-gray-200">')
      .replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto my-2">$1</pre>')
      .replace(/\n\n/g, '</p><p class="text-sm text-gray-600 leading-relaxed my-2">')
      .replace(/\n/g, '<br>');
    return `<p class="text-sm text-gray-600 leading-relaxed my-2">${html}</p>`;
  }
</script>

<div class="max-w-4xl mx-auto space-y-6">
  {#if loading}
    <div class="card text-center py-12">
      <div class="text-3xl mb-3">🔄</div>
      <p class="text-gray-500">加载报告...</p>
    </div>
  {:else if error}
    <div class="card text-center py-12">
      <div class="text-3xl mb-3">😿</div>
      <p class="text-red-500">{error}</p>
      <a href="/reports" class="btn-primary inline-block mt-4">返回报告列表</a>
    </div>
  {:else}
    <!-- 报告头部 -->
    <div class="card bg-white">
      <div class="flex items-center gap-3 mb-3">
        <span class="text-2xl">{reportLabel(report.reportType).icon}</span>
        <div>
          <h1 class="text-xl font-bold text-gray-900">{report.title}</h1>
          <div class="text-sm text-gray-500">
            {reportLabel(report.reportType).label}
            {#if report.petName && report.petName !== '待确认'}
              · 🐾 {report.petName}
            {/if}
            · {formatDate(report.createdAt.split('T')[0])}
          </div>
        </div>
      </div>

      <!-- QA 状态 -->
      {#if report.qaResult}
        <div class="flex items-center gap-3 p-3 rounded-lg {report.qaResult.passed ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}">
          <span class="text-lg">{report.qaResult.passed ? '✅' : '⚠️'}</span>
          <div>
            <span class="text-sm font-medium {report.qaResult.passed ? 'text-emerald-700' : 'text-amber-700'}">
              {report.qaResult.passed ? '报告质检通过' : '报告质检存在警告'}
            </span>
            {#if report.qaResult.warnings?.length > 0}
              <div class="text-xs text-amber-600 mt-0.5">
                {report.qaResult.warnings.join('；')}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- 操作栏 -->
      <div class="flex gap-2 mt-4 pt-3 border-t border-gray-100">
        <button class="btn-secondary text-sm" onclick={downloadMarkdown}>
          📥 下载 Markdown
        </button>
        {#if report.recordId}
          <a href="/analysis/{report.recordId}" class="btn-ghost text-sm">📋 查看就诊记录</a>
        {/if}
        <a href="/reports" class="btn-ghost text-sm">← 返回列表</a>
      </div>
    </div>

    <!-- 报告正文 -->
    <div class="card bg-white prose-sm max-w-none">
      {@html markdownToHtml(report.markdown)}
    </div>

    <!-- 清单信息 -->
    {#if report.manifest}
      <details class="card bg-gray-50 border border-gray-200">
        <summary class="cursor-pointer text-sm font-medium text-gray-600">📋 报告清单 (Manifest)</summary>
        <div class="mt-3 p-3 bg-white rounded border border-gray-100">
          <pre class="text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto">{JSON.stringify(report.manifest, null, 2)}</pre>
        </div>
      </details>
    {/if}

    <!-- QA 详情 -->
    {#if report.qaResult?.checks?.length > 0}
      <details class="card bg-gray-50 border border-gray-200">
        <summary class="cursor-pointer text-sm font-medium text-gray-600">🔍 质检详情 (QA Checks)</summary>
        <div class="mt-3 space-y-2">
          {#each report.qaResult.checks as check}
            <div class="flex items-center gap-2 p-2 bg-white rounded border border-gray-100">
              <span>{check.passed ? '✅' : '❌'}</span>
              <span class="text-sm text-gray-700">{check.rule}</span>
              <span class="text-xs text-gray-500 flex-1 text-right">{check.detail}</span>
            </div>
          {/each}
        </div>
      </details>
    {/if}
  {/if}
</div>
