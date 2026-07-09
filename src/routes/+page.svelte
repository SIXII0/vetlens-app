<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { formatCurrency, timeAgo, formatDate } from '$lib/utils/format';
  import { loadPets, pets } from '$lib/stores/pets';

  let recentRecords: Array<{
    id: string; hospital_name: string | null; visit_date: string;
    total_amount: number; status: string; pet_id: string | null;
  }> = [];
  let stats = { recordCount: 0 };
  let loaded = $state(false);

  onMount(async () => {
    loadPets();
    try {
      const res = await fetch('/api/records?limit=5');
      if (res.ok) {
        const data = await res.json();
        recentRecords = data.records;
        stats.recordCount = data.total;
      }
    } catch { /* ignore */ }
    loaded = true;
  });

  function getPetName(petId: string | null): string {
    if (!petId) return '未指定';
    return '宠物';
  }
</script>

<svelte:head><title>VetLens — 宠医透镜</title></svelte:head>

<div class="max-w-5xl mx-auto space-y-6 animate-enter">
  <!-- Hero -->
  <div class="card bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 text-white border-0 shadow-raised overflow-hidden relative">
    <div class="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4"></div>
    <div class="relative flex flex-col md:flex-row items-center gap-6">
      <div class="flex-1">
        <h1 class="text-2xl md:text-3xl font-extrabold mb-2 tracking-tight">让每一笔收费被看懂</h1>
        <p class="text-brand-100/80 mb-6 text-sm md:text-base leading-relaxed max-w-lg">
          拍一张宠物医院账单，逐项解读——这个项目是什么、价格是否合理、医保能不能赔。
        </p>
        <div class="flex gap-3">
          <a href="/upload" class="inline-flex items-center gap-2 bg-white text-brand-700 px-5 py-3 rounded-xl font-semibold text-sm hover:bg-brand-50 transition-colors shadow-sm">
            📸 上传账单分析
          </a>
          <a href="/records" class="inline-flex items-center gap-2 bg-white/15 text-white px-5 py-3 rounded-xl font-medium text-sm hover:bg-white/25 transition-colors">
            📋 查看记录
          </a>
        </div>
      </div>
      <div class="text-7xl md:text-8xl opacity-90">🐾</div>
    </div>
  </div>

  <!-- Bento 网格 -->
  <div class="grid grid-cols-2 gap-4">
    {#if loaded}
      <div class="card text-center relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1 bg-brand-400"></div>
        <div class="text-2xl font-extrabold text-warm-900 tabular-nums">{stats.recordCount}</div>
        <div class="text-xs text-warm-500 mt-1">就诊记录</div>
      </div>
      <div class="card text-center relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1 bg-amber-400"></div>
        <div class="text-2xl font-extrabold text-warm-900">{($pets?.length || 0)}</div>
        <div class="text-xs text-warm-500 mt-1">宠物档案</div>
      </div>
    {:else}
      <div class="card text-center"><div class="skeleton h-10 w-16 mx-auto rounded"></div><div class="skeleton h-3 w-12 mx-auto mt-2 rounded"></div></div>
      <div class="card text-center"><div class="skeleton h-10 w-16 mx-auto rounded"></div><div class="skeleton h-3 w-12 mx-auto mt-2 rounded"></div></div>
    {/if}
  </div>

  <!-- 快捷操作 -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {#each [
      {href:'/upload',icon:'📸',title:'上传新账单',desc:'拍照或上传账单图片，获取逐项解读'},
      {href:'/pets',icon:'🐾',title:'管理宠物档案',desc:'添加你的猫咪/狗狗，追踪健康风险'},
      {href:'/hospitals',icon:'🏥',title:'附近好评医院',desc:'查看价格透明度高的宠物医院'},
      {href:'/insurance',icon:'🛡️',title:'保险理赔预检',desc:'就诊前预估能赔多少，准备材料'}
    ] as item}
      <a href={item.href} class="card-hover flex items-center gap-4 no-underline text-warm-900 group">
        <span class="text-2xl">{item.icon}</span>
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-sm">{item.title}</h3>
          <p class="text-xs text-warm-500 mt-0.5">{item.desc}</p>
        </div>
        <span class="text-warm-300 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all">→</span>
      </a>
    {/each}
  </div>

  <!-- 最近记录 -->
  {#if recentRecords.length > 0}
    <div class="card">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-bold text-warm-900">最近就诊</h3>
        <a href="/records" class="text-sm text-brand-600 hover:underline font-medium">全部 →</a>
      </div>
      <div class="divide-y divide-warm-50">
        {#each recentRecords as record}
          <a href="/analysis/{record.id}" class="flex items-center gap-4 py-3 -mx-3 px-3 rounded-xl hover:bg-warm-50 transition-colors no-underline text-warm-900 group">
            <span class="w-8 h-8 rounded-lg bg-warm-100 flex items-center justify-center text-sm group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
              {record.status === 'analyzed' ? '✅' : '📝'}
            </span>
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm truncate">{record.hospital_name || '未知医院'}</div>
              <div class="text-xs text-warm-500">{formatDate(record.visit_date)} · {getPetName(record.pet_id)}</div>
            </div>
            <div class="text-right">
              <div class="font-semibold text-sm tabular-nums">{formatCurrency(record.total_amount)}</div>
              <div class="text-xs text-warm-400">{timeAgo(record.visit_date)}</div>
            </div>
          </a>
        {/each}
      </div>
    </div>
  {:else if loaded}
    <div class="card text-center py-12">
      <div class="text-5xl mb-4">📋</div>
      <h3 class="font-semibold text-warm-700 mb-2">还没有就诊记录</h3>
      <p class="text-sm text-warm-500 mb-4">上传第一张宠物医院账单，开始你的宠物医疗档案</p>
      <a href="/upload" class="btn-primary inline-block">开始分析</a>
    </div>
  {/if}
</div>
