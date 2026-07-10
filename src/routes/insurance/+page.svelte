<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCurrency, formatDate } from '$lib/utils/format';
  import { selectedPetId, pets, loadPets } from '$lib/stores/pets';

  let policies = $state<any[]>([]);
  let loading = $state(true);
  let showForm = $state(false);
  let linkedPetName = $state('');

  // 表单字段
  let formCompany = $state('');
  let formProductName = $state('');
  let formPolicyNumber = $state('');
  let formEffectiveDate = $state('');
  let formExpiryDate = $state('');
  let formWaitingPeriod = $state('30');
  let formDeductible = $state('200');
  let formReimbursementRate = $state('60');
  let formAnnualLimit = $state('15000');
  let formExclusions = $state('');       // 逗号分隔的除外责任
  let formCoverageItems = $state('');    // 逗号分隔的保障范围
  let formRawTerms = $state('');         // 条款备注
  let saving = $state(false);

  onMount(() => {
    loadPets();
    loadPolicies();
    // 如果有预选宠物
    if ($selectedPetId) {
      showForm = true;
      linkedPetName = $pets.find(p => p.id === $selectedPetId)?.name || '';
    }
  });

  async function loadPolicies() {
    loading = true;
    try {
      const res = await fetch('/api/insurance');
      if (res.ok) policies = await res.json();
    } catch { /* ignore */ }
    loading = false;
  }

  async function handleSubmit() {
    if (!formCompany || !formProductName) return;
    saving = true;
    try {
      // 构建结构化条款（除外责任 + 保障范围）
      const exclusions = formExclusions
        .split(/[,，、\s]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      const coverageItems = formCoverageItems
        .split(/[,，、\s]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const structuredTerms = (exclusions.length > 0 || coverageItems.length > 0)
        ? JSON.stringify({ exclusions, coverage_items: coverageItems })
        : undefined;

      await fetch('/api/insurance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          petId: $selectedPetId || undefined,
          company: formCompany,
          productName: formProductName,
          policyNumber: formPolicyNumber || undefined,
          effectiveDate: formEffectiveDate || undefined,
          expiryDate: formExpiryDate || undefined,
          waitingPeriod: parseInt(formWaitingPeriod) || 30,
          deductible: parseFloat(formDeductible) || 200,
          reimbursementRate: (parseFloat(formReimbursementRate) || 60) / 100,
          annualLimit: parseFloat(formAnnualLimit) || 15000,
          rawTermsText: formRawTerms || undefined,
          structuredTerms,
        })
      });
      await loadPolicies();
      showForm = false;
      resetForm();
    } catch { /* ignore */ }
    saving = false;
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除该保单吗？')) return;
    await fetch('/api/insurance', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    await loadPolicies();
  }

  /** 解析 structured_terms JSON，兼容两种格式 */
  function parseStructuredTerms(raw: string | null): {
    exclusions: string[];
    coverageItems: string[];
    insurer?: string;
    clause?: string;
    sourceUrl?: string;
    note?: string;
  } {
    if (!raw) return { exclusions: [], coverageItems: [] };
    try {
      const parsed = JSON.parse(raw);

      // 新格式: { exclusions: [...], coverage_items: [...] }
      if (parsed.exclusions || parsed.coverage_items) {
        return {
          exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions : [],
          coverageItems: Array.isArray(parsed.coverage_items) ? parsed.coverage_items : [],
        };
      }

      // 导入格式: { insurer, product_or_clause, source_url, structured_status, ... }
      return {
        exclusions: [],
        coverageItems: [],
        insurer: parsed.insurer || undefined,
        clause: parsed.product_or_clause || undefined,
        sourceUrl: parsed.source_url || undefined,
        note: parsed.structured_status || undefined,
      };
    } catch {
      return { exclusions: [], coverageItems: [] };
    }
  }

  /** 将 raw_terms_text 转为可读文本（非 JSON） */
  function formatRawTerms(text: string | null): string {
    if (!text) return '';
    // 如果是 JSON 格式（导入数据），提取关键信息展示
    try {
      const parsed = JSON.parse(text);
      const parts: string[] = [];
      if (parsed.structured_status) parts.push(parsed.structured_status);
      if (parsed.source_url) parts.push(parsed.source_url);
      return parts.join(' | ');
    } catch {
      // 纯文本，直接展示
      return text;
    }
  }

  function resetForm() {
    formCompany = '';
    formProductName = '';
    formPolicyNumber = '';
    formEffectiveDate = '';
    formExpiryDate = '';
    formWaitingPeriod = '30';
    formDeductible = '200';
    formReimbursementRate = '60';
    formAnnualLimit = '15000';
    formExclusions = '';
    formCoverageItems = '';
    formRawTerms = '';
  }
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold text-warm-900">🛡️ 保单管理</h1>
    <button class="btn-primary text-sm" onclick={() => { showForm = true; resetForm(); }}>
      + 添加保单
    </button>
    </div>
<div class="card bg-gradient-to-r from-indigo-50 to-white border-indigo-100 mb-4 px-4 py-3"><div><h3 class="font-semibold text-sm text-indigo-800">保险理赔预检</h3><p class="text-xs text-warm-500 mt-0.5 leading-relaxed">配置宠物保险保单，就诊后逐项判赔并预估自付金额，指导准备理赔材料，提升理赔通过率。</p></div></div>


  <!-- 添加保单表单 -->
  {#if showForm}
    <div class="card">
      <h3 class="font-semibold text-warm-900 mb-1">添加新保单</h3>
      {#if linkedPetName}
        <div class="flex items-center gap-2 mb-4 text-sm text-brand-700 bg-brand-50 rounded-lg px-3 py-1.5 border border-brand-200">
          🐾 关联宠物：<strong>{linkedPetName}</strong>
          <button class="text-xs text-warm-400 hover:text-red-500 ml-2" onclick={() => { selectedPetId.set(null); linkedPetName = ''; }}>✕ 取消关联</button>
        </div>
      {/if}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label class="block text-xs font-medium text-warm-500 mb-1">保险公司 *</label>
          <input type="text" class="input-field" bind:value={formCompany} placeholder="如：众安保险" />
        </div>
        <div>
          <label class="block text-xs font-medium text-warm-500 mb-1">产品名称 *</label>
          <input type="text" class="input-field" bind:value={formProductName} placeholder="如：宠物医疗险（升级版）" />
        </div>
        <div>
          <label class="block text-xs font-medium text-warm-500 mb-1">生效日期</label>
          <input type="date" class="input-field" bind:value={formEffectiveDate} />
        </div>
        <div>
          <label class="block text-xs font-medium text-warm-500 mb-1">到期日期</label>
          <input type="date" class="input-field" bind:value={formExpiryDate} />
        </div>
        <div>
          <label class="block text-xs font-medium text-warm-500 mb-1">等待期（天）</label>
          <input type="number" class="input-field" bind:value={formWaitingPeriod} />
        </div>
        <div>
          <label class="block text-xs font-medium text-warm-500 mb-1">免赔额（元）</label>
          <input type="number" class="input-field" bind:value={formDeductible} />
        </div>
        <div>
          <label class="block text-xs font-medium text-warm-500 mb-1">报销比例（%）</label>
          <input type="number" min="0" max="100" class="input-field" bind:value={formReimbursementRate} />
        </div>
        <div>
          <label class="block text-xs font-medium text-warm-500 mb-1">年度限额（元）</label>
          <input type="number" class="input-field" bind:value={formAnnualLimit} />
        </div>
        <div>
          <label class="block text-xs font-medium text-warm-500 mb-1">保单号</label>
          <input type="text" class="input-field" bind:value={formPolicyNumber} placeholder="如：P202401010001" />
        </div>
      </div>

      <!-- 保障条款区域 -->
      <div class="border-t border-warm-100 pt-4 mt-2 mb-4">
        <h4 class="text-sm font-semibold text-warm-700 mb-3">📋 保障与除外条款</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-warm-500 mb-1">
              ✅ 保障范围
              <span class="text-warm-400 font-normal">（逗号分隔）</span>
            </label>
            <textarea
              class="input-field min-h-[60px]"
              bind:value={formCoverageItems}
              placeholder="如：门诊费, 检查费, 药品费, 手术费, 住院费"
              rows="2"
            ></textarea>
          </div>
          <div>
            <label class="block text-xs font-medium text-warm-500 mb-1">
              ❌ 除外责任
              <span class="text-warm-400 font-normal">（逗号分隔）</span>
            </label>
            <textarea
              class="input-field min-h-[60px]"
              bind:value={formExclusions}
              placeholder="如：体检, 疫苗, 驱虫, 绝育, 先天性疾病"
              rows="2"
            ></textarea>
          </div>
        </div>
        <div class="mt-3">
          <label class="block text-xs font-medium text-warm-500 mb-1">
            📝 其他条款备注
          </label>
          <input type="text" class="input-field" bind:value={formRawTerms} placeholder="如：单次事故最高赔付5000元、门诊每日限额300元" />
        </div>
      </div>

      <div class="flex gap-3 justify-end">
        <button class="btn-secondary" onclick={() => showForm = false}>取消</button>
        <button class="btn-primary" onclick={handleSubmit} disabled={saving || !formCompany || !formProductName}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  {/if}

  <!-- 保单列表 -->
  {#if loading}
    <div class="card text-center py-12 text-warm-500">加载中...</div>
  {:else if policies.length === 0}
    <div class="card text-center py-12">
      <div class="text-5xl mb-4">🛡️</div>
      <h3 class="font-semibold text-warm-700 mb-2">还没有添加保单</h3>
      <p class="text-sm text-warm-500 mb-4">添加宠物保险保单，分析账单时自动预检能否理赔</p>
      <button class="btn-primary" onclick={() => { showForm = true; resetForm(); }}>
        + 添加保单
      </button>
    </div>
  {:else}
    <div class="space-y-3">
      {#each policies as p}
        {@const structured = parseStructuredTerms(p.structured_terms)}
        <div class="card">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-semibold text-warm-900">{p.company} — {p.product_name}</h3>
                {#if p.policy_number}
                  <span class="text-xs text-warm-400 font-mono">{p.policy_number}</span>
                {/if}
                <span class="badge text-xs" class:badge-green={p.status === 'active'} class:badge-red={p.status !== 'active'}>
                  {p.status === 'active' ? '生效中' : p.status}
                </span>
              </div>

              <!-- 核心参数 -->
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-sm">
                <div>
                  <span class="text-warm-400">等待期</span>
                  <span class="ml-1 font-medium">{p.waiting_period ?? 30} 天</span>
                </div>
                <div>
                  <span class="text-warm-400">免赔额</span>
                  <span class="ml-1 font-medium">{formatCurrency(p.deductible ?? 200)}</span>
                </div>
                <div>
                  <span class="text-warm-400">报销比例</span>
                  <span class="ml-1 font-medium">{((p.reimbursement_rate ?? 0.6) * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span class="text-warm-400">年度限额</span>
                  <span class="ml-1 font-medium">{formatCurrency(p.annual_limit ?? 15000)}</span>
                </div>
              </div>

              <!-- 保障与除外（新格式） -->
              {#if structured.coverageItems.length > 0 || structured.exclusions.length > 0}
                <div class="mt-3 pt-3 border-t border-warm-100 space-y-1.5">
                  {#if structured.coverageItems.length > 0}
                    <div class="flex items-start gap-2 text-xs">
                      <span class="text-emerald-500 font-medium flex-shrwarm-0">✅ 保障:</span>
                      <span class="text-warm-600">
                        {#each structured.coverageItems as item}
                          <span class="inline-block bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded mr-1 mb-1">{item}</span>
                        {/each}
                      </span>
                    </div>
                  {/if}
                  {#if structured.exclusions.length > 0}
                    <div class="flex items-start gap-2 text-xs">
                      <span class="text-red-400 font-medium flex-shrwarm-0">❌ 除外:</span>
                      <span class="text-warm-500">
                        {#each structured.exclusions as item}
                          <span class="inline-block bg-red-50 text-red-600 px-1.5 py-0.5 rounded mr-1 mb-1">{item}</span>
                        {/each}
                      </span>
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- 导入格式条款信息 -->
              {#if structured.insurer}
                <div class="mt-3 pt-3 border-t border-warm-100 space-y-1">
                  <div class="text-xs text-warm-500">
                    📄 条款来源：{structured.insurer}
                    {#if structured.clause} — {structured.clause}{/if}
                  </div>
                  {#if structured.note}
                    <div class="text-xs text-amber-600">⚠️ {structured.note}</div>
                  {/if}
                  {#if structured.sourceUrl}
                    <a href={structured.sourceUrl} target="_blank" rel="noopener noreferrer"
                       class="text-xs text-brand-500 hover:underline inline-block truncate max-w-full">
                      🔗 {structured.sourceUrl}
                    </a>
                  {/if}
                </div>
              {/if}

              <!-- 备注 + 日期 -->
              <div class="text-xs text-warm-400 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {#if p.raw_terms_text}
                  {@const termsDisplay = formatRawTerms(p.raw_terms_text)}
                  {#if termsDisplay}
                    <span>📝 {termsDisplay}</span>
                  {/if}
                {/if}
                {#if p.effective_date}生效: {formatDate(p.effective_date)}{/if}
                {#if p.expiry_date} · 到期: {formatDate(p.expiry_date)}{/if}
              </div>
            </div>
            <button
              class="btn-ghost text-red-400 hover:text-red-600 text-sm"
              onclick={() => handleDelete(p.id)}
            >
              🗑️
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
