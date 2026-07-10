<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { formatCurrency, formatDate, priceLevelBadge, priceLevelIcon, necessityBadge } from '$lib/utils/format';
  import { markdownToHtml } from '$lib/utils/markdown';
  import { pets, loadPets } from '$lib/stores/pets';

  let loading = $state(true);
  let error = $state<string | null>(null);
  let record: any = $state(null);
  let items: any[] = $state([]);
  let hospitals: any[] = $state([]);
  let showAllHospitals = $state(false);

  // 报告相关状态
  let activeTab = $state<'items' | 'report'>('items');
  let reportMarkdown = $state<string | null>(null);
  let reportLoading = $state(false);
  let reportError = $state<string | null>(null);
  let reportQa = $state<{ passed: boolean; warnings: string[] } | null>(null);

  onMount(async () => {
    // 加载宠物列表（用于关联宠物名）
    loadPets();

    try {
      const res = await fetch(`/api/records/${$page.params.id}`);
      if (!res.ok) {
        error = '记录不存在';
        loading = false;
        return;
      }
      const data = await res.json();
      record = data.record;
      items = data.items || [];

      // 加载医院推荐
      if (record.hospital_city) {
        try {
          const hRes = await fetch(`/api/hospitals?city=${encodeURIComponent(record.hospital_city)}&limit=5`);
          if (hRes.ok) hospitals = await hRes.json();
        } catch { /* ignore */ }
      }

      // 检查是否有已生成的报告
      await loadExistingReport();
    } catch (e) {
      error = '加载失败';
    } finally {
      loading = false;
    }
  });

  /** 尝试加载已生成的报告 */
  async function loadExistingReport() {
    try {
      const res = await fetch(`/api/reports?type=&limit=5`);
      if (!res.ok) return;
      const data = await res.json();
      // 查找关联到本记录的报告
      const relatedReport = data.reports.find((r: any) =>
        r.recordId === $page.params.id
      );
      if (relatedReport) {
        reportMarkdown = relatedReport.markdown;
        reportQa = relatedReport.qaResult;
      }
    } catch { /* ignore */ }
  }

  /** 生成报告 */
  async function generateReport() {
    reportLoading = true;
    reportError = null;
    try {
      // 获取项目数据用于报告生成
      const analysisBody = {
        items: items.map((it: any) => ({
          rawName: it.raw_name,
          amount: it.amount,
          category: it.category,
        })),
        hospitalName: record.hospital_name,
        city: record.hospital_city,
        visitDate: record.visit_date,
        visitReason: record.visit_reason,
        diagnosis: record.diagnosis,
        totalAmount: record.total_amount,
        rawOcrText: record.raw_ocr_text,
        useLlm: false,
        format: 'report',
        recordId: record.id,
        reportType: 'auto',
        requestText: record.visit_reason || '账单分析',
        petId: record.pet_id || undefined,
        petName: record.pet_id
          ? ($pets.find(p => p.id === record.pet_id)?.name || undefined)
          : undefined,
      };

      const res = await fetch('/api/analyze?format=report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analysisBody),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '报告生成失败');
      }

      const data = await res.json();
      if (data.report?.markdown) {
        reportMarkdown = data.report.markdown;
        reportQa = { passed: data.report.qaPassed, warnings: data.report.qaWarnings || [] };
        activeTab = 'report';
      } else {
        throw new Error('报告生成成功但未返回内容');
      }
    } catch (e) {
      reportError = e instanceof Error ? e.message : '报告生成失败';
    } finally {
      reportLoading = false;
    }
  }

  let pdfGenerating = $state(false);

  async function generatePdf() {
    pdfGenerating = true;
    try {
      const res = await fetch('/api/report/pdf', { method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ recordId: $page.params.id,
          items: items.map((it:any)=>({name:it.raw_name,amount:it.amount})),
          hospitalName: record.hospital_name, visitDate: record.visit_date,
          petName: record.pet_id ? ($pets.find((p:any)=>p.id===record.pet_id)?.name) : undefined,
          requestText: record.visit_reason||'账单解释报告', pdfPolicy:'required' }) });
      const d = await res.json();
      if (d.success && d.pdfBase64) {
        const b = Uint8Array.from(atob(d.pdfBase64), c=>c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([b],{type:'application/pdf'}));
        const a = document.createElement('a'); a.href = url;
        a.download = `${record?.visit_date||'report'}_${record?.hospital_name||''}_报告.pdf`;
        a.click(); URL.revokeObjectURL(url);
      }
    } catch(e) { console.error(e); }
    finally { pdfGenerating = false; }
  }

  /** 下载报告 */
  function downloadReport() {
    if (!reportMarkdown) return;
    const blob = new Blob([reportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const petName = record?.hospital_name || '未知医院';
    const date = record?.visit_date || new Date().toISOString().split('T')[0];
    a.download = `${date}_${petName}_报告.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printedAmount(item: any): number {
    return item.amount || 0;
  }

  function isPriceHigh(item: any): boolean {
    return item.price_level === '偏高' || item.price_level === '略高';
  }

  /** 分类视觉配置：图标 + 进度条颜色 + badge 样式 */
  const CATEGORY_CONFIG: Record<string, { icon: string; barClass: string; badgeClass: string }> = {
    '检查': { icon: '🔬', barClass: 'bg-brand-500', badgeClass: 'badge-cat-check' },
    '药品': { icon: '💊', barClass: 'bg-emerald-500', badgeClass: 'badge-cat-drug' },
    '治疗': { icon: '💉', barClass: 'bg-sky-500', badgeClass: 'badge-cat-treat' },
    '手术': { icon: '🏥', barClass: 'bg-amber-500', badgeClass: 'badge-cat-surgery' },
    '耗材': { icon: '🧤', barClass: 'bg-purple-500', badgeClass: 'badge-cat-supply' },
    '处置': { icon: '🩹', barClass: 'bg-rose-500', badgeClass: 'badge-cat-proc' },
    '服务': { icon: '🛎️', barClass: 'bg-cyan-500', badgeClass: 'badge-cat-service' },
    '预防': { icon: '🛡️', barClass: 'bg-teal-500', badgeClass: 'badge-cat-prev' },
  };
  const DEFAULT_CATEGORY = { icon: '📋', barClass: 'bg-warm-400', badgeClass: 'badge-cat-other' };

  function catIcon(cat: string): string {
    return CATEGORY_CONFIG[cat]?.icon ?? DEFAULT_CATEGORY.icon;
  }
  function catBarClass(cat: string): string {
    return CATEGORY_CONFIG[cat]?.barClass ?? DEFAULT_CATEGORY.barClass;
  }
  function catBadgeClass(cat: string): string {
    return CATEGORY_CONFIG[cat]?.badgeClass ?? DEFAULT_CATEGORY.badgeClass;
  }

  let categories = $derived.by(() => {
    const cats: Record<string, number> = {};
    for (const item of items) {
      const cat = item.category || '其他';
      cats[cat] = (cats[cat] || 0) + (item.amount || 0);
    }
    return Object.entries(cats).map(([cat, amt]) => ({
      cat,
      amt,
      pct: record ? (amt / record.total_amount * 100).toFixed(1) : '0'
    }));
  });
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <!-- 加载状态 -->
  {#if loading}
    <div class="card text-center py-12">
      <div class="text-3xl mb-3">🔄</div>
      <p class="text-warm-500">加载分析结果...</p>
    </div>
  {:else if error}
    <div class="card text-center py-12">
      <div class="text-3xl mb-3">😿</div>
      <p class="text-red-500">{error}</p>
      <a href="/records" class="btn-primary inline-block mt-4">返回记录列表</a>
    </div>
  {:else}
    <!-- 总览卡片 -->
    <div class="card bg-white">
      <div class="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <h1 class="text-xl font-bold text-warm-900">
              {record.hospital_name || '未知医院'}
            </h1>
            <span class="badge-blue">已解读</span>
          </div>
          <div class="text-sm text-warm-500 space-x-3">
            <span>📅 {formatDate(record.visit_date)}</span>
            {#if record.hospital_city}
              <span>📍 {record.hospital_city}</span>
            {/if}
            {#if record.visit_reason}
              <span>🩺 {record.visit_reason}</span>
            {/if}
          </div>
        </div>
        <div class="text-right">
          <div class="text-xs text-warm-500 mb-1">总费用</div>
          <div class="text-3xl font-bold text-warm-900">{formatCurrency(record.total_amount)}</div>
          <div class="text-xs text-warm-400">{items.length} 个项目</div>
        </div>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="flex border-b border-warm-200 gap-1">
      <button
        class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px]"
        class:border-brand-500={activeTab === 'items'}
        class:text-brand-600={activeTab === 'items'}
        class:border-transparent={activeTab !== 'items'}
        class:text-warm-500={activeTab !== 'items'}
        class:hover:text-warm-700={activeTab !== 'items'}
        onclick={() => activeTab = 'items'}
      >
        📋 逐项解读
      </button>
      <button
        class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px]"
        class:border-brand-500={activeTab === 'report'}
        class:text-brand-600={activeTab === 'report'}
        class:border-transparent={activeTab !== 'report'}
        class:text-warm-500={activeTab !== 'report'}
        class:hover:text-warm-700={activeTab !== 'report'}
        onclick={() => activeTab = 'report'}
      >
        📄 综合报告
      </button>
    </div>

    <!-- Tab 内容: 逐项解读 -->
    {#if activeTab === 'items'}

    <!-- 分析摘要 -->
    {#if items.length > 0}
      {@const matchedCount = items.filter((it: any) => !it.is_unknown).length}
      {@const unknownCount = items.filter((it: any) => it.is_unknown).length}
      {@const highPriceCount = items.filter((it: any) => it.price_level === '偏高' || it.price_level === '略高').length}

      <div class="card bg-warm-50 border border-warm-200">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div class="text-lg font-bold text-warm-900">{items.length}</div>
            <div class="text-xs text-warm-500">费用项目</div>
          </div>
          <div>
            <div class="text-lg font-bold text-emerald-600">{matchedCount}</div>
            <div class="text-xs text-warm-500">知识库匹配</div>
          </div>
          <div>
            <div class="text-lg font-bold" class:text-amber-600={unknownCount > 0} class:text-warm-400={unknownCount === 0}>
              {unknownCount}
            </div>
            <div class="text-xs text-warm-500">未识别项目</div>
          </div>
          <div>
            <div class="text-lg font-bold" class:text-amber-600={highPriceCount > 0} class:text-emerald-600={highPriceCount === 0}>
              {highPriceCount}
            </div>
            <div class="text-xs text-warm-500">价格偏高</div>
          </div>
        </div>
      </div>
    {/if}

    <!-- 逐项解读 -->
    <div class="space-y-3">
      <h2 class="text-lg font-semibold text-warm-900">📋 逐项解读</h2>

      {#if items.length === 0}
        <div class="card text-center py-8">
          <div class="text-3xl mb-2">📝</div>
          <p class="text-sm text-warm-500">暂无分析项目。请确认账单数据已正确录入。</p>
        </div>
      {/if}

      {#each items as item, i}
        <div class="card" class:border-amber-200={item.is_unknown} style:background-color={item.is_unknown ? 'rgb(255 251 235 / 0.3)' : ''}>
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <!-- 标题行 -->
              <div class="flex items-center gap-2 mb-2 flex-wrap">
                <span class="text-sm font-semibold text-warm-900">{item.raw_name}</span>
                {#if item.category}
                  <span class="badge {catBadgeClass(item.category)}">{catIcon(item.category)} {item.category}</span>
                {/if}
                {#if item.necessity}
                  <span class={necessityBadge(item.necessity)}>{item.necessity}</span>
                {/if}
                {#if item.price_level}
                  <span class={priceLevelBadge(item.price_level)}>{priceLevelIcon(item.price_level)} {item.price_level}</span>
                {/if}
                {#if item.is_unknown}
                  <span class="badge-amber">未知项目</span>
                {/if}
              </div>

              <!-- 解释 -->
              {#if item.explanation}
                <div class="text-sm text-warm-600 leading-relaxed whitespace-pre-line">
                  {item.explanation}
                </div>
              {/if}

              <!-- 未知项目提示 -->
              {#if item.is_unknown}
                <div class="mt-2 p-3 bg-amber-100/50 rounded-lg text-xs text-amber-800">
                  ⚠️ 该项目在知识库中未找到匹配。以下解释基于通用知识推断，仅供参考。下次更新知识库后将自动匹配。
                </div>
              {/if}
            </div>

            <!-- 金额 -->
            <div class="text-right flex-shrwarm-0">
              <div class="text-lg font-bold {isPriceHigh(item) ? 'text-amber-600' : 'text-warm-900'}">
                {formatCurrency(printedAmount(item))}
              </div>
              {#if item.confidence != null}
                <div class="text-xs text-warm-400">
                  匹配置信度: {(item.confidence * 100).toFixed(0)}%
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- 费用分布 -->
    {#if items.length > 0}
      <div class="card">
        <h3 class="font-semibold text-warm-900 mb-4">📊 费用构成</h3>
        <div class="space-y-2">
          {#each categories as { cat, amt, pct }}
            <div class="flex items-center gap-3">
              <span class="text-base w-8 text-center" title={cat}>{catIcon(cat)}</span>
              <span class="text-sm text-warm-600 w-14">{cat}</span>
              <div class="flex-1 h-3 bg-warm-100 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all {catBarClass(cat)}"
                  style="width: {pct}%"
                ></div>
              </div>
              <span class="text-sm text-warm-900 font-medium w-24 text-right tabular-nums">{formatCurrency(amt)}</span>
              <span class="text-xs text-warm-400 w-12 text-right tabular-nums">{pct}%</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- 医院推荐 -->
    {#if hospitals.length > 0}
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-warm-900">
            🏥 {record.hospital_city || ''}附近好评医院
          </h3>
        </div>
        <p class="text-xs text-warm-500 mb-4">
          以下医院基于价格透明度和用户评价综合推荐，数据来自公开信息，仅供参考
        </p>
        <div class="space-y-3">
          {#each hospitals.slice(0, showAllHospitals ? 10 : 3) as h}
            <div class="flex items-center gap-4 p-3 bg-warm-50 rounded-lg">
              <div class="flex-1">
                <div class="font-medium text-sm text-warm-900">{h.name}</div>
                <div class="text-xs text-warm-500">
                  {h.type || ''} · {h.address || ''}
                </div>
              </div>
              <div class="flex items-center gap-4 text-sm">
                <div class="text-center">
                  <div class="text-amber-500 font-semibold">⭐ {h.rating ?? '—'}</div>
                  <div class="text-xs text-warm-400">用户评分</div>
                </div>
                <div class="text-center">
                  <div class="text-emerald-600 font-semibold">💰 {h.transparency_score ?? '—'}</div>
                  <div class="text-xs text-warm-400">价格透明</div>
                </div>
                <span class="badge text-xs">
                  {h.price_level === '低' ? '经济型' : h.price_level === '高' ? '高端' : '中等'}
                </span>
              </div>
            </div>
          {/each}
        </div>
        {#if hospitals.length > 3}
          <button
            class="btn-ghost text-sm w-full mt-3"
            onclick={() => showAllHospitals = !showAllHospitals}
          >
            {showAllHospitals ? '收起' : `查看更多 (${hospitals.length - 3} 家)`}
          </button>
        {/if}
      </div>
    {/if}

    <!-- 操作按钮 (逐项解读 Tab) -->
    <div class="flex gap-3 justify-end">
      <a href="/records" class="btn-secondary">返回记录</a>
      <a href="/upload" class="btn-primary">分析新账单</a>
    </div>

    {:else}
    <!-- Tab 内容: 综合报告 -->
    <div class="space-y-4">
      {#if reportMarkdown}
        <!-- QA 状态条 -->
        {#if reportQa}
          <div class="flex items-center gap-3 p-3 rounded-lg {reportQa.passed ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}">
            <span class="text-lg">{reportQa.passed ? '✅' : '⚠️'}</span>
            <div>
              <span class="text-sm font-medium {reportQa.passed ? 'text-emerald-700' : 'text-amber-700'}">
                {reportQa.passed ? '报告质检通过' : '报告质检有警告'}
              </span>
              {#if reportQa.warnings.length > 0}
                <div class="text-xs text-amber-600 mt-0.5">
                  {reportQa.warnings.join('；')}
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- 报告内容 -->
        <div class="card bg-white prose-sm max-w-none">
          {@html markdownToHtml(reportMarkdown)}
        </div>

        <!-- 下载按钮 -->
        <div class="flex gap-3 justify-end">
          <button class="btn-secondary" onclick={downloadReport}>
            📥 下载 Markdown
          </button>
          <button class="btn-primary" onclick={generatePdf} disabled={pdfGenerating}>
            {pdfGenerating ? '⏳ 生成中...' : '📄 下载 PDF'}
          </button>
          <button class="btn-secondary" onclick={() => {
            if (!reportMarkdown) return;
            const blob = new Blob([reportMarkdown], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            URL.revokeObjectURL(url);
          }}>
            🖨️ 打印
          </button>
        </div>
      {:else}
        <!-- 未生成报告 -->
        <div class="card text-center py-12">
          <div class="text-4xl mb-4">📄</div>
          <h3 class="text-lg font-semibold text-warm-800 mb-2">综合报告</h3>
          <p class="text-sm text-warm-500 mb-6 max-w-md mx-auto">
            报告将生成完整叙事结构，包含费用来源、逐项解读、合理性分析和后续建议，
            并以 Markdown 格式输出，支持下载和打印。
          </p>

          {#if reportError}
            <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 mb-4 max-w-md mx-auto">
              ❌ {reportError}
            </div>
          {/if}

          <button
            class="btn-primary text-base px-6 py-2.5"
            onclick={generateReport}
            disabled={reportLoading}
          >
            {reportLoading ? '⏳ 生成中...' : '✨ 生成报告'}
          </button>

          <p class="text-xs text-warm-400 mt-3">
            基于 pet-vault-skill 报告编排引擎生成
          </p>
        </div>
      {/if}
    </div>

    <!-- 底部操作 (报告 Tab) -->
    <div class="flex gap-3 justify-end">
      <a href="/records" class="btn-secondary">返回记录</a>
      <a href="/reports" class="btn-secondary">报告列表</a>
    </div>
  {/if}
  {/if}
</div>
