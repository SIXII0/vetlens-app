<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  let detail = $state<any>(null);
  let loading = $state(true);
  let relatedDrugs = $state<any[]>([]);
  let relatedSymptoms = $state<any[]>([]);

  onMount(async () => {
    const slug = $page.params.slug;
    const res = await fetch(`/api/knowledge-base?type=diseases&id=${slug}`);
    if (res.ok) detail = await res.json();
    if (detail) {
      try { relatedDrugs = JSON.parse(detail.drugs || '[]'); } catch {}
      try { relatedSymptoms = JSON.parse(detail.symptoms || '[]'); } catch {}
    }
    loading = false;
  });

  function getName(i18n: any, fallback: string) {
    if (!i18n) return fallback;
    return i18n.zh_HK || i18n.zh_TW || fallback;
  }
</script>

<div class="max-w-4xl mx-auto space-y-6 animate-enter">
  <a href="/knowledge/diseases" class="text-sm text-warm-400 hover:text-brand-600">← 疾病列表</a>

  {#if loading}
    <div class="space-y-4">{#each Array(4) as _}<div class="skeleton h-6 w-3/4"></div><div class="skeleton h-32 w-full"></div>{/each}</div>
  {:else if !detail}
    <div class="card text-center py-16 text-warm-400">未找到该疾病</div>
  {:else}
    <div>
      <span class="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">{detail.category || '未分类'}</span>
      <h1 class="text-2xl font-extrabold text-warm-900 mt-2">{detail.name_zh || detail.canonical_name}</h1>
      <p class="text-sm text-warm-400 mt-1">{detail.canonical_name}</p>
    </div>

    {#if detail.urgency > 0}
      <div class="card bg-red-50/50 border-red-200">
        <span class="font-semibold text-red-700">🚨 紧急程度: {['','低','中','高','紧急','危急'][detail.urgency]||detail.urgency}/5</span>
      </div>
    {/if}

    {#if detail.description_zh}
      <div class="card">
        <h3 class="font-semibold text-warm-900 mb-2">概述</h3>
        <p class="text-sm text-warm-600 leading-relaxed">{detail.description_zh}</p>
      </div>
    {/if}

    {#if relatedSymptoms.length > 0}
      <div class="card">
        <h3 class="font-semibold text-warm-900 mb-2">相关症状</h3>
        <div class="flex flex-wrap gap-2">
          {#each relatedSymptoms as s}
            <a href="/knowledge/symptoms?q={s.slug}" class="px-3 py-1.5 rounded-full text-xs bg-warm-100 text-warm-700 hover:bg-brand-50 hover:text-brand-700 transition-colors no-underline">
              {getName(s.name_i18n, s.canonical_name)}
              {#if s.frequency}<span class="text-warm-400 ml-1">({s.frequency})</span>{/if}
            </a>
          {/each}
        </div>
      </div>
    {/if}

    {#if relatedDrugs.length > 0}
      <div class="card">
        <h3 class="font-semibold text-warm-900 mb-2">相关药物</h3>
        <div class="flex flex-wrap gap-2">
          {#each relatedDrugs.slice(0,20) as d}
            <a href="/knowledge/drugs?q={d.slug}" class="px-3 py-1.5 rounded-full text-xs bg-warm-100 text-warm-700 hover:bg-brand-50 hover:text-brand-700 transition-colors no-underline">
              {getName(d.nameI18n, d.genericName || d.canonical_name)}
              {#if d.lineOfTherapy}<span class="text-warm-400 ml-1">({d.lineOfTherapy})</span>{/if}
            </a>
          {/each}
        </div>
      </div>
    {/if}

    {#if detail.species}
      <div class="text-xs text-warm-400">关联物种: {detail.species || '未指定'}</div>
    {/if}
  {/if}
</div>
