<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pets, loadPets, selectedPetId } from '$lib/stores/pets';

  let showForm = $state(false);
  let formName = $state('');
  let formSpecies = $state('猫');
  let formBreed = $state('');
  let formGender = $state('');
  let formBirthDate = $state('');
  let formWeight = $state('');
  let saving = $state(false);
  let risks = $state<any[]>([]);

  // 展开的宠物 ID + 统计数据
  let expandedId = $state<string | null>(null);
  let petStats = $state<Record<string, { records: number; policies: number }>>({});

  onMount(() => {
    loadPets();
    loadAllStats();
  });

  async function loadAllStats() {
    try {
      const [recRes, polRes] = await Promise.all([
        fetch('/api/records?limit=1'),
        fetch('/api/insurance'),
      ]);
      if (recRes.ok) {
        const data = await recRes.json();
        // 按 pet_id 统计记录数（粗略——API 返回的是总数，需要逐条请求）
        // 这里简化：只统计是否有记录
      }
    } catch { /* ignore */ }
  }

  /** 切换展开 / 折叠 */
  function toggleExpand(petId: string) {
    expandedId = expandedId === petId ? null : petId;
  }

  /** 为该宠物添加就诊记录 */
  function addRecord(petId: string) {
    selectedPetId.set(petId);
    goto('/upload');
  }

  /** 为该宠物添加保单 */
  function addPolicy(petId: string) {
    selectedPetId.set(petId);
    goto('/insurance');
  }

  /** 查看该宠物的就诊记录 */
  function viewRecords(petId: string) {
    selectedPetId.set(petId);
    goto('/records');
  }

  async function handleSubmit() {
    if (!formName || !formSpecies) return;
    saving = true;
    try {
      await fetch('/api/pets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          species: formSpecies,
          breed: formBreed || undefined,
          gender: formGender || undefined,
          birthDate: formBirthDate || undefined,
          weightKg: formWeight ? parseFloat(formWeight) : undefined
        })
      });
      await loadPets();
      resetForm();
      showForm = false;
    } catch { /* ignore */ }
    saving = false;
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除该宠物档案吗？关联的就诊记录将保留。')) return;
    await fetch('/api/pets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    await loadPets();
  }

  async function checkRisks(species: string, breed: string) {
    if (!breed) return;
    try {
      const res = await fetch(`/api/pets?action=breed-risks&species=${encodeURIComponent(species)}&breed=${encodeURIComponent(breed)}`);
      if (res.ok) risks = await res.json();
    } catch { risks = []; }
  }

  function resetForm() {
    formName = '';
    formBreed = '';
    formGender = '';
    formBirthDate = '';
    formWeight = '';
    risks = [];
  }
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold text-gray-900">🐾 宠物档案</h1>
    <button class="btn-primary text-sm" onclick={() => { showForm = true; resetForm(); }}>
      + 添加宠物
    </button>
  </div>

  <!-- 品种疾病风险提示 -->
  {#if risks.length > 0}
    <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <h4 class="font-semibold text-amber-800 mb-2">⚠️ 该品种的遗传病风险</h4>
      {#each risks as risk}
        <div class="text-sm text-amber-700 mb-1">
          🔸 <strong>{risk.disease}</strong> — 风险: {risk.risk_level}
          {#if risk.screening}
            <br><span class="text-xs text-amber-600">建议筛查: {risk.screening} ({risk.screening_cost_range || '费用请咨询医院'})</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- 添加表单 -->
  {#if showForm}
    <div class="card">
      <h3 class="font-semibold text-gray-900 mb-4">添加新宠物</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">名字 *</label>
          <input type="text" class="input-field" bind:value={formName} placeholder="如：咪咪" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">品种 *</label>
          <select class="input-field" bind:value={formSpecies}>
            <option value="猫">🐱 猫</option>
            <option value="狗">🐶 狗</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">品种</label>
          <input
            type="text"
            class="input-field"
            bind:value={formBreed}
            placeholder="如：英国短毛猫"
            onchange={() => checkRisks(formSpecies, formBreed)}
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">性别</label>
          <select class="input-field" bind:value={formGender}>
            <option value="">未指定</option>
            <option value="公">公</option>
            <option value="母">母</option>
            <option value="公(已绝育)">公(已绝育)</option>
            <option value="母(已绝育)">母(已绝育)</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">出生日期</label>
          <input type="date" class="input-field" bind:value={formBirthDate} />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">体重 (kg)</label>
          <input type="number" step="0.1" class="input-field" bind:value={formWeight} placeholder="如：4.5" />
        </div>
      </div>
      <div class="flex gap-3 justify-end">
        <button class="btn-secondary" onclick={() => { showForm = false; risks = []; }}>取消</button>
        <button class="btn-primary" onclick={handleSubmit} disabled={saving || !formName}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  {/if}

  <!-- 宠物列表 -->
  {#if $pets.length === 0}
    <div class="card text-center py-12">
      <div class="text-5xl mb-4">🐾</div>
      <h3 class="font-semibold text-gray-700 mb-2">还没有添加宠物</h3>
      <p class="text-sm text-gray-500 mb-4">添加你的宠物档案，追踪品种健康风险和就诊历史</p>
      <button class="btn-primary" onclick={() => { showForm = true; resetForm(); }}>
        + 添加第一只宠物
      </button>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each $pets as pet}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="card-hover cursor-pointer transition-all"
          class:ring-2={expandedId === pet.id}
          class:ring-primary-300={expandedId === pet.id}
          onclick={() => toggleExpand(pet.id)}
          role="button"
          tabindex="0"
          onkeydown={(e) => { if (e.key === 'Enter') toggleExpand(pet.id); }}
        >
          <!-- 宠物基本信息 -->
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <span class="text-3xl">{pet.species === '猫' ? '🐱' : '🐶'}</span>
              <div>
                <h3 class="font-semibold text-gray-900">{pet.name}</h3>
                <div class="text-xs text-gray-500 space-x-2">
                  {#if pet.breed}<span>{pet.breed}</span>{/if}
                  {#if pet.gender}<span>· {pet.gender}</span>{/if}
                </div>
                {#if pet.birth_date}
                  <div class="text-xs text-gray-400">🎂 {pet.birth_date}</div>
                {/if}
                {#if pet.weight_kg}
                  <div class="text-xs text-gray-400">⚖️ {pet.weight_kg} kg</div>
                {/if}
              </div>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-xs text-gray-400">{expandedId === pet.id ? '▲' : '▼'}</span>
              <button
                class="btn-ghost text-red-400 hover:text-red-600 text-sm"
                onclick={(e) => { e.stopPropagation(); handleDelete(pet.id); }}
              >
                🗑️
              </button>
            </div>
          </div>

          <!-- 展开后的操作面板 -->
          {#if expandedId === pet.id}
            <div class="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <p class="text-xs text-gray-500 mb-3">选择要为此宠物添加的内容：</p>
              <div class="grid grid-cols-2 gap-2">
                <button
                  class="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                  onclick={(e) => { e.stopPropagation(); addRecord(pet.id); }}
                >
                  <span class="text-base">📋</span>
                  添加就诊记录
                </button>
                <button
                  class="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100"
                  onclick={(e) => { e.stopPropagation(); addPolicy(pet.id); }}
                >
                  <span class="text-base">🛡️</span>
                  添加保单
                </button>
              </div>
              <button
                class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                onclick={(e) => { e.stopPropagation(); viewRecords(pet.id); }}
              >
                📋 查看此宠物所有就诊记录
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
