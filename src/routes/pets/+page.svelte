<script lang="ts">
  import { onMount } from 'svelte';
  import { pets, loadPets } from '$lib/stores/pets';

  let showForm = $state(false);
  let formName = $state('');
  let formSpecies = $state('猫');
  let formBreed = $state('');
  let formGender = $state('');
  let formBirthDate = $state('');
  let formWeight = $state('');
  let saving = $state(false);
  let risks = $state<any[]>([]);

  onMount(() => {
    loadPets();
  });

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
        <div class="card-hover">
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
            <button
              class="btn-ghost text-red-400 hover:text-red-600 text-sm"
              onclick={() => handleDelete(pet.id)}
            >
              🗑️
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
