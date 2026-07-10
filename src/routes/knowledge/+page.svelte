<script lang="ts">
  import { onMount } from 'svelte';

  let searchQuery = $state('');

  const stats = { diseases: 298, breeds: 857, drugs: 691, citations: '11K+' };

  onMount(() => {});
</script>

<div class="max-w-4xl mx-auto space-y-10 animate-enter">
  <!-- ── Hero ── -->
  <section class="text-center py-10 space-y-6">
    <h1 class="text-3xl font-extrabold text-warm-900 tracking-tight">宠物医疗知识库</h1>
    <p class="text-sm text-warm-500 max-w-lg mx-auto">
      兽医级宠物百科。每条资料都附有教科书出处，杜绝 AI 虚构。
    </p>
    <div class="relative max-w-md mx-auto">
      <span class="absolute left-4 top-1/2 -translate-y-1/2 text-warm-400">🔎</span>
      <input
        type="text"
        class="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-warm-200 text-sm placeholder:text-warm-400
               focus:outline-none focus:ring-2 focus:ring-brand-400/30 focus:border-brand-400 shadow-sm transition-all"
        placeholder="搜索疾病、药物、品种、症状..."
        bind:value={searchQuery}
      />
    </div>
  </section>

  <!-- ── 核心数据 ── -->
  <div class="grid grid-cols-4 gap-3">
    {#each [
      {v:stats.diseases,l:'疾病总数'},
      {v:stats.breeds,l:'收录品种'},
      {v:stats.drugs,l:'收录药物'},
      {v:stats.citations,l:'原文引用'}
    ] as s}
      <div class="text-center p-4 bg-white rounded-2xl border border-warm-100">
        <div class="text-xl font-extrabold text-warm-900">{s.v}</div>
        <div class="text-2xs text-warm-400 mt-0.5">{s.l}</div>
      </div>
    {/each}
  </div>

  <!-- ── 分类浏览 ── -->
  <section>
    <h2 class="text-lg font-bold text-warm-900 mb-4">分类浏览</h2>

    <!-- Row 1 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <a href="/knowledge/diseases" class="group card hover:shadow-raised hover:-translate-y-0.5 transition-all duration-200 no-underline">
        <span class="text-2xl mb-2 block">🩺</span>
        <h3 class="font-bold text-warm-900 group-hover:text-brand-600 transition-colors">疾病</h3>
        <p class="text-xs text-warm-500 mt-1">按名称、品种、症状搜索，每条资料附出处。</p>
      </a>
      <a href="/knowledge/symptoms" class="group card hover:shadow-raised hover:-translate-y-0.5 transition-all duration-200 no-underline">
        <span class="text-2xl mb-2 block">🔍</span>
        <h3 class="font-bold text-warm-900 group-hover:text-brand-600 transition-colors">症状</h3>
        <p class="text-xs text-warm-500 mt-1">从观察到的症状入手，反查可能的疾病。</p>
      </a>
      <a href="/knowledge/terms" class="group card hover:shadow-raised hover:-translate-y-0.5 transition-all duration-200 no-underline">
        <span class="text-2xl mb-2 block">📋</span>
        <h3 class="font-bold text-warm-900 group-hover:text-brand-600 transition-colors">诊疗项目</h3>
        <p class="text-xs text-warm-500 mt-1">常见检查、药品、治疗的通俗解释和必要性。</p>
      </a>
    </div>

    <!-- Row 2 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <a href="/knowledge/breeds" class="group card hover:shadow-raised hover:-translate-y-0.5 transition-all duration-200 no-underline">
        <span class="text-2xl mb-2 block">🧬</span>
        <h3 class="font-bold text-warm-900 group-hover:text-brand-600 transition-colors">品种</h3>
        <p class="text-xs text-warm-500 mt-1">品种高发疾病、遗传检测与饲养需求。</p>
      </a>
      <a href="/knowledge/drugs" class="group card hover:shadow-raised hover:-translate-y-0.5 transition-all duration-200 no-underline">
        <span class="text-2xl mb-2 block">💊</span>
        <h3 class="font-bold text-warm-900 group-hover:text-brand-600 transition-colors">药物</h3>
        <p class="text-xs text-warm-500 mt-1">数百种兽医药物的剂量、副作用与交互作用。</p>
      </a>
      <a href="/knowledge/care-guides" class="group card hover:shadow-raised hover:-translate-y-0.5 transition-all duration-200 no-underline">
        <span class="text-2xl mb-2 block">💟</span>
        <h3 class="font-bold text-warm-900 group-hover:text-brand-600 transition-colors">护理指南</h3>
        <p class="text-xs text-warm-500 mt-1">主人易读、兽医级准确的日常护理指导。</p>
      </a>
    </div>

  </section>

  <!-- ── 我们如何构建 ── -->
  <section>
    <h2 class="text-lg font-bold text-warm-900 mb-4">我们如何构建这个知识库</h2>
    <div class="space-y-3">
      <div class="card flex gap-4">
        <span class="text-2xl flex-shrink-0">📖</span>
        <div>
          <h4 class="font-semibold text-sm text-warm-900">出处优先</h4>
          <p class="text-xs text-warm-500 mt-0.5">每条资料都从权威兽医教科书原文摘取，引文逐字保留，绝不脱离来源。</p>
        </div>
      </div>
      <div class="card flex gap-4">
        <span class="text-2xl flex-shrink-0">🔗</span>
        <div>
          <h4 class="font-semibold text-sm text-warm-900">相互链接</h4>
          <p class="text-xs text-warm-500 mt-0.5">疾病页面与药物、品种、诊断检查及相关疾病双向链接。</p>
        </div>
      </div>
      <div class="card flex gap-4">
        <span class="text-2xl flex-shrink-0">🧬</span>
        <div>
          <h4 class="font-semibold text-sm text-warm-900">品种感知</h4>
          <p class="text-xs text-warm-500 mt-0.5">每个（品种×疾病）配对都记录证据强度、遗传模式与DNA测试是否可用。</p>
        </div>
      </div>
      <div class="card flex gap-4">
        <span class="text-2xl flex-shrink-0">👩‍⚕️</span>
        <div>
          <h4 class="font-semibold text-sm text-warm-900">面向宠主</h4>
          <p class="text-xs text-warm-500 mt-0.5">文章顶部简明白话，下方提供完整临床细节。</p>
        </div>
      </div>
    </div>
  </section>
</div>

