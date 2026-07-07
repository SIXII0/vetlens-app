<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCurrency, formatDate } from '$lib/utils/format';

  let policies = $state<any[]>([]);
  let loading = $state(true);
  let showForm = $state(false);

  // 表单字段
  let formCompany = $state('');
  let formProductName = $state('');
  let formEffectiveDate = $state('');
  let formExpiryDate = $state('');
  let formWaitingPeriod = $state('30');
  let formDeductible = $state('200');
  let formReimbursementRate = $state('60');
  let formAnnualLimit = $state('15000');
  let saving = $state(false);

  onMount(() => { loadPolicies(); });

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
      await fetch('/api/insurance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: formCompany,
          productName: formProductName,
          effectiveDate: formEffectiveDate || undefined,
          expiryDate: formExpiryDate || undefined,
          waitingPeriod: parseInt(formWaitingPeriod) || 30,
          deductible: parseFloat(formDeductible) || 200,
          reimbursementRate: (parseFloat(formReimbursementRate) || 60) / 100,
          annualLimit: parseFloat(formAnnualLimit) || 15000
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

  function resetForm() {
    formCompany = '';
    formProductName = '';
    formEffectiveDate = '';
    formExpiryDate = '';
    formWaitingPeriod = '30';
    formDeductible = '200';
    formReimbursementRate = '60';
    formAnnualLimit = '15000';
  }
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold text-gray-900">🛡️ 保单管理</h1>
    <button class="btn-primary text-sm" onclick={() => { showForm = true; resetForm(); }}>
      + 添加保单
    </button>
  </div>

  <!-- 添加保单表单 -->
  {#if showForm}
    <div class="card">
      <h3 class="font-semibold text-gray-900 mb-4">添加新保单</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">保险公司 *</label>
          <input type="text" class="input-field" bind:value={formCompany} placeholder="如：众安保险" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">产品名称 *</label>
          <input type="text" class="input-field" bind:value={formProductName} placeholder="如：宠物医疗险（升级版）" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">生效日期</label>
          <input type="date" class="input-field" bind:value={formEffectiveDate} />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">到期日期</label>
          <input type="date" class="input-field" bind:value={formExpiryDate} />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">等待期（天）</label>
          <input type="number" class="input-field" bind:value={formWaitingPeriod} />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">免赔额（元）</label>
          <input type="number" class="input-field" bind:value={formDeductible} />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">报销比例（%）</label>
          <input type="number" min="0" max="100" class="input-field" bind:value={formReimbursementRate} />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">年度限额（元）</label>
          <input type="number" class="input-field" bind:value={formAnnualLimit} />
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
    <div class="card text-center py-12 text-gray-500">加载中...</div>
  {:else if policies.length === 0}
    <div class="card text-center py-12">
      <div class="text-5xl mb-4">🛡️</div>
      <h3 class="font-semibold text-gray-700 mb-2">还没有添加保单</h3>
      <p class="text-sm text-gray-500 mb-4">添加宠物保险保单，分析账单时自动预检能否理赔</p>
      <button class="btn-primary" onclick={() => { showForm = true; resetForm(); }}>
        + 添加保单
      </button>
    </div>
  {:else}
    <div class="space-y-3">
      {#each policies as p}
        <div class="card">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-semibold text-gray-900">{p.company} — {p.product_name}</h3>
                <span class="badge text-xs" class:badge-green={p.status === 'active'} class:badge-red={p.status !== 'active'}>
                  {p.status === 'active' ? '生效中' : p.status}
                </span>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-sm">
                <div>
                  <span class="text-gray-400">等待期</span>
                  <span class="ml-1 font-medium">{p.waiting_period ?? 30} 天</span>
                </div>
                <div>
                  <span class="text-gray-400">免赔额</span>
                  <span class="ml-1 font-medium">{formatCurrency(p.deductible ?? 200)}</span>
                </div>
                <div>
                  <span class="text-gray-400">报销比例</span>
                  <span class="ml-1 font-medium">{((p.reimbursement_rate ?? 0.6) * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span class="text-gray-400">年度限额</span>
                  <span class="ml-1 font-medium">{formatCurrency(p.annual_limit ?? 15000)}</span>
                </div>
              </div>
              {#if p.effective_date || p.expiry_date}
                <div class="text-xs text-gray-400 mt-2">
                  {#if p.effective_date}生效: {formatDate(p.effective_date)}{/if}
                  {#if p.expiry_date} · 到期: {formatDate(p.expiry_date)}{/if}
                </div>
              {/if}
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
