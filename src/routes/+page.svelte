<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { formatCurrency, timeAgo, formatDate } from '$lib/utils/format';
  import { loadPets, pets } from '$lib/stores/pets';

  let recentRecords: Array<{
    id: string;
    hospital_name: string | null;
    visit_date: string;
    total_amount: number;
    status: string;
    pet_id: string | null;
  }> = [];
  let stats = { termCount: 0, recordCount: 0 };

  onMount(async () => {
    // 加载宠物
    loadPets();

    // 加载最近记录
    try {
      const res = await fetch('/api/records?limit=5');
      if (res.ok) {
        const data = await res.json();
        recentRecords = data.records;
        stats.recordCount = data.total;
      }
    } catch { /* ignore */ }

    // 加载知识库统计
    try {
      const res = await fetch('/api/knowledge/search?action=stats');
      if (res.ok) {
        const data = await res.json();
        stats.termCount = data.termCount;
      }
    } catch { /* ignore */ }
  });

  function getPetName(petId: string | null): string {
    if (!petId) return '未指定';
    // 从 store 查找
    const petsList = $pets;
    // 简单 fallback
    return '宠物';
  }
</script>

<svelte:head>
  <title>VetLens — 宠医透镜</title>
</svelte:head>

<div class="max-w-5xl mx-auto space-y-6">
  <!-- Hero 区域 -->
  <div class="card bg-gradient-to-br from-primary-600 to-primary-800 text-white border-0">
    <div class="flex flex-col md:flex-row items-center gap-6">
      <div class="flex-1">
        <h1 class="text-2xl md:text-3xl font-bold mb-3">
          🐱 让每一笔收费被看懂
        </h1>
        <p class="text-primary-100 mb-6 text-sm md:text-base leading-relaxed">
          拍一张宠物医院账单，VetLens 帮你逐项解读——这个项目是什么、价格是否合理、医保能不能赔。
          把被动付款变成主动决策。
        </p>
        <div class="flex gap-3">
          <a href="/upload" class="inline-flex items-center gap-2 bg-white text-primary-700 px-5 py-3 rounded-lg font-semibold hover:bg-primary-50 transition-colors shadow-sm">
            📸 上传账单分析
          </a>
          <a href="/records" class="inline-flex items-center gap-2 bg-primary-500/30 text-white px-5 py-3 rounded-lg font-medium hover:bg-primary-500/40 transition-colors">
            📋 查看记录
          </a>
        </div>
      </div>
      <div class="text-7xl md:text-8xl">
        🐾
      </div>
    </div>
  </div>

  <!-- 统计卡片 -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="card text-center">
      <div class="text-2xl font-bold text-primary-600">{stats.termCount}</div>
      <div class="text-xs text-gray-500 mt-1">知识库术语</div>
    </div>
    <div class="card text-center">
      <div class="text-2xl font-bold text-vet-green">{stats.recordCount}</div>
      <div class="text-xs text-gray-500 mt-1">就诊记录</div>
    </div>
    <div class="card text-center">
      <div class="text-2xl font-bold text-vet-amber">{$pets.length}</div>
      <div class="text-xs text-gray-500 mt-1">宠物档案</div>
    </div>
    <div class="card text-center">
      <div class="text-2xl font-bold text-vet-purple">离线可用</div>
      <div class="text-xs text-gray-500 mt-1">本地运行</div>
    </div>
  </div>

  <!-- 快捷操作 -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <a href="/upload" class="card-hover flex items-center gap-4 no-underline text-gray-900">
      <span class="text-3xl">📸</span>
      <div>
        <h3 class="font-semibold">上传新账单</h3>
        <p class="text-sm text-gray-500">拍照或上传账单图片，获取逐项解读</p>
      </div>
      <span class="ml-auto text-gray-400">→</span>
    </a>
    <a href="/pets" class="card-hover flex items-center gap-4 no-underline text-gray-900">
      <span class="text-3xl">🐾</span>
      <div>
        <h3 class="font-semibold">管理宠物档案</h3>
        <p class="text-sm text-gray-500">添加你的猫咪/狗狗，追踪品种健康风险</p>
      </div>
      <span class="ml-auto text-gray-400">→</span>
    </a>
    <a href="/hospitals" class="card-hover flex items-center gap-4 no-underline text-gray-900">
      <span class="text-3xl">🏥</span>
      <div>
        <h3 class="font-semibold">附近好评医院</h3>
        <p class="text-sm text-gray-500">查看价格透明度高的宠物医院推荐</p>
      </div>
      <span class="ml-auto text-gray-400">→</span>
    </a>
    <a href="/insurance" class="card-hover flex items-center gap-4 no-underline text-gray-900">
      <span class="text-3xl">🛡️</span>
      <div>
        <h3 class="font-semibold">保险预检</h3>
        <p class="text-sm text-gray-500">管理保单，就诊前预估能赔多少</p>
      </div>
      <span class="ml-auto text-gray-400">→</span>
    </a>
  </div>

  <!-- 最近记录 -->
  {#if recentRecords.length > 0}
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-gray-900">最近就诊记录</h3>
        <a href="/records" class="text-sm text-primary-600 hover:underline">查看全部 →</a>
      </div>
      <div class="divide-y divide-gray-100">
        {#each recentRecords as record}
          <a href="/analysis/{record.id}" class="flex items-center gap-4 py-3 hover:bg-gray-50 -mx-3 px-3 rounded-lg transition-colors no-underline text-gray-900">
            <span class="text-lg">
              {record.status === 'analyzed' ? '✅' : '📝'}
            </span>
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm truncate">
                {record.hospital_name || '未知医院'}
              </div>
              <div class="text-xs text-gray-500">
                {formatDate(record.visit_date)} · {getPetName(record.pet_id)}
              </div>
            </div>
            <div class="text-right">
              <div class="font-semibold text-sm">{formatCurrency(record.total_amount)}</div>
              <div class="text-xs text-gray-400">{timeAgo(record.visit_date)}</div>
            </div>
          </a>
        {/each}
      </div>
    </div>
  {:else}
    <div class="card text-center py-12">
      <div class="text-5xl mb-4">📋</div>
      <h3 class="text-lg font-semibold text-gray-700 mb-2">还没有就诊记录</h3>
      <p class="text-sm text-gray-500 mb-4">上传第一张宠物医院账单，开始你的宠物医疗档案</p>
      <a href="/upload" class="btn-primary inline-block">开始分析</a>
    </div>
  {/if}
</div>
