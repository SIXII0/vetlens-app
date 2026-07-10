<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { formatCurrency, timeAgo, formatDate } from '$lib/utils/format';
  import { loadPets, pets } from '$lib/stores/pets';
  import {
    Camera, ClipboardList, Hospital, Shield,
    FileText, CheckCircle, Edit3, PawPrint,
    Syringe, Pill, ArrowRight, Plus,
    Bell, Clock, Calendar
  } from '@lucide/svelte';

  let recentRecords = $state<Array<{
    id: string; hospital_name: string | null; visit_date: string;
    total_amount: number; status: string; pet_id: string | null;
  }>>([]);
  let stats = $state({ recordCount: 0 });
  let loaded = $state(false);
  let upcomingVaccines = $state<any[]>([]);
  let upcomingMeds = $state<any[]>([]);

  onMount(async () => {
    loadPets();
    try {
      const [recRes, vacRes, medRes] = await Promise.all([
        fetch('/api/records?limit=5'),
        fetch('/api/vaccines?status=upcoming'),
        fetch('/api/medications'),
      ]);
      if (recRes.ok) { const d = await recRes.json(); recentRecords = d.records; stats.recordCount = d.total; }
      if (vacRes.ok) upcomingVaccines = (await vacRes.json()).filter((v:any) => new Date(v.next_date) <= new Date(Date.now() + 30*86400000));
      if (medRes.ok) upcomingMeds = (await medRes.json()).filter((m:any) => new Date(m.next_due) <= new Date(Date.now() + 7*86400000));
    } catch { /* ignore */ }
    loaded = true;
  });

  function getPetName(petId: string | null): string {
    if (!petId) return '未指定宠物';
    const pet = $pets?.find(p => p.id === petId);
    return pet ? pet.name : '宠物';
  }

  function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 12) return '早上好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  function getDaysLeft(dateStr: string): number {
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  }

  function formatDaysLabel(days: number): string {
    if (days <= 0) return '今天';
    if (days === 1) return '明天';
    if (days <= 3) return `${days}天后`;
    return `还有${days}天`;
  }

  function getDaysClass(days: number, threshold: number): string {
    if (days <= threshold) return 'text-red-500';
    if (days <= threshold * 2) return 'text-amber-500';
    return 'text-warm-400';
  }
</script>

<svelte:head><title>VetLens — 宠医透镜</title></svelte:head>

<div class="max-w-5xl mx-auto space-y-6 animate-enter">
  <!-- Hero -->
  <div class="card bg-gradient-to-br from-brand-600 via-brand-500 to-brand-700 text-white border-0 shadow-raised overflow-hidden relative">
    <div class="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4"></div>
    <div class="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4"></div>
    <div class="absolute bottom-4 right-4 opacity-[0.06]">
      <PawPrint size={120} class="text-white" />
    </div>
    <div class="relative flex flex-col md:flex-row items-center gap-6">
      <div class="flex-1">
        <h1 class="text-2xl md:text-3xl font-extrabold mb-2 tracking-tight">
          {stats.recordCount > 0 ? `${getGreeting()}，欢迎回来` : '别让账单里的问号，变成心里的担忧'}
        </h1>
        <p class="text-brand-100/80 mb-6 text-sm md:text-base leading-relaxed max-w-lg">
          {stats.recordCount > 0
            ? `你已记录 ${stats.recordCount} 次就诊，让我们继续守护毛孩子的健康。`
            : '拍一张宠物医院账单，我们会帮你逐项看懂——每一项是什么、价格合不合理、保险能不能赔。'}
        </p>
        <div class="flex gap-3">
          <a href="/upload" class="inline-flex items-center gap-2 bg-white text-brand-700 px-5 py-3 rounded-xl font-semibold text-sm hover:bg-brand-50 transition-colors shadow-sm">
            <Camera size={18} />上传账单分析
          </a>
          <a href="/records" class="inline-flex items-center gap-2 bg-white/15 text-white px-5 py-3 rounded-xl font-medium text-sm hover:bg-white/25 transition-colors">
            <ClipboardList size={18} />查看记录
          </a>
        </div>
      </div>
      <div class="hidden md:flex items-center justify-center">
        <div class="w-32 h-32 rounded-3xl bg-white/10 backdrop-blur-sm flex items-center justify-center animate-gentle-bounce">
          <PawPrint size={64} class="text-white/80" />
        </div>
      </div>
    </div>
  </div>

  <!-- Bento 网格 -->
  <div class="grid grid-cols-2 gap-4">
    {#if loaded}
      <a href="/records" class="card text-center relative overflow-hidden hover:shadow-raised transition-shadow">
        <div class="absolute top-0 left-0 right-0 h-1 bg-brand-400"></div>
        <div class="text-2xl font-extrabold text-warm-900 tabular-nums">{stats.recordCount}</div>
        <div class="text-xs text-warm-500 mt-1">就诊记录</div>
      </a>
      <a href="/pets" class="card text-center relative overflow-hidden hover:shadow-raised transition-shadow">
        <div class="absolute top-0 left-0 right-0 h-1 bg-amber-400"></div>
        <div class="text-2xl font-extrabold text-warm-900">{($pets?.length || 0)}</div>
        <div class="text-xs text-warm-500 mt-1">宠物档案</div>
      </a>
    {:else}
      <div class="card text-center"><div class="skeleton h-10 w-16 mx-auto rounded"></div><div class="skeleton h-3 w-12 mx-auto mt-2 rounded"></div></div>
      <div class="card text-center"><div class="skeleton h-10 w-16 mx-auto rounded"></div><div class="skeleton h-3 w-12 mx-auto mt-2 rounded"></div></div>
    {/if}
  </div>

  <!-- 近期提醒 -->
  {#if upcomingVaccines.length > 0 || upcomingMeds.length > 0}
    <div class="card overflow-hidden">
      <div class="flex items-center gap-2 mb-3">
        <Bell size={16} class="text-warm-500" />
        <h3 class="font-semibold text-sm text-warm-900">近期提醒</h3>
        <span class="text-2xs text-warm-400 ml-auto">{upcomingVaccines.length + upcomingMeds.length} 项待办</span>
      </div>
      <div class="divide-y divide-warm-100">
        {#each upcomingVaccines.slice(0, 2) as v}
          {@const daysLeft = getDaysLeft(v.next_date)}
          <a href="/vaccines/{v.id}" class="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-warm-50 transition-colors no-underline text-warm-900 group">
            <div class="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Syringe size={15} class="text-amber-500" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-medium text-warm-800 truncate">{v.vaccine_type}</div>
              <div class="text-2xs text-warm-400">{getPetName(v.pet_id)} · {v.next_date}</div>
            </div>
            <span class="text-2xs flex items-center gap-1 flex-shrink-0 {getDaysClass(daysLeft, 3)}">
              <Clock size={11} />
              {formatDaysLabel(daysLeft)}
            </span>
          </a>
        {/each}
        {#each upcomingMeds.slice(0, 2) as m}
          {@const daysLeft = getDaysLeft(m.next_due)}
          <a href="/medications/{m.id}" class="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-warm-50 transition-colors no-underline text-warm-900 group">
            <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Pill size={15} class="text-blue-500" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-medium text-warm-800 truncate">{m.med_name}</div>
              <div class="text-2xs text-warm-400">{getPetName(m.pet_id)}{#if m.dosage} · {m.dosage}{/if} · {m.next_due}</div>
            </div>
            <span class="text-2xs flex items-center gap-1 flex-shrink-0 {getDaysClass(daysLeft, 1)}">
              <Clock size={11} />
              {formatDaysLabel(daysLeft)}
            </span>
          </a>
        {/each}
      </div>
      <!-- 展开更多 -->
      {#if upcomingVaccines.length + upcomingMeds.length > 4}
        <div class="mt-2 pt-2 border-t border-warm-100 flex gap-4">
          {#if upcomingVaccines.length > 2}
            <a href="/vaccines" class="text-2xs text-warm-500 hover:text-brand-600 transition-colors flex items-center gap-1">
              查看全部 {upcomingVaccines.length} 项疫苗 <ArrowRight size={10} />
            </a>
          {/if}
          {#if upcomingMeds.length > 2}
            <a href="/medications" class="text-2xs text-warm-500 hover:text-brand-600 transition-colors flex items-center gap-1">
              查看全部 {upcomingMeds.length} 项用药 <ArrowRight size={10} />
            </a>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- 快捷操作 -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {#each [
      {href:'/upload',icon:Camera,title:'上传新账单',desc:'拍照或上传账单图片，获取逐项解读',color:'bg-brand-50 text-brand-600'},
      {href:'/pets',icon:PawPrint,title:'管理宠物档案',desc:'添加你的猫咪/狗狗，追踪健康风险',color:'bg-amber-50 text-amber-600'},
      {href:'/hospitals',icon:Hospital,title:'附近好评医院',desc:'查看价格透明度高的宠物医院',color:'bg-emerald-50 text-emerald-600'},
      {href:'/insurance',icon:Shield,title:'保险理赔预检',desc:'就诊前预估能赔多少，准备材料',color:'bg-blue-50 text-blue-600'}
    ] as item, i}
      <a
        href={item.href}
        class="card-hover flex items-center gap-4 no-underline text-warm-900 group animate-stagger"
        style="animation-delay: {i * 60}ms"
      >
        <div class="w-10 h-10 rounded-xl {item.color} flex items-center justify-center flex-shrink-0">
          <item.icon size={20} />
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-sm">{item.title}</h3>
          <p class="text-xs text-warm-500 mt-0.5">{item.desc}</p>
        </div>
        <ArrowRight size={16} class="text-warm-300 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
      </a>
    {/each}
  </div>

  <!-- 最近记录 -->
  {#if recentRecords.length > 0}
    <div class="card">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-bold text-warm-900">最近就诊</h3>
        <a href="/records" class="text-sm text-brand-600 hover:underline font-medium flex items-center gap-1">
          全部 <ArrowRight size={14} />
        </a>
      </div>
      <div class="divide-y divide-warm-100">
        {#each recentRecords as record, i}
          <a
            href="/analysis/{record.id}"
            class="flex items-center gap-4 py-3 -mx-3 px-3 rounded-xl hover:bg-warm-50 transition-colors no-underline text-warm-900 group animate-stagger"
            style="animation-delay: {i * 50}ms"
          >
            <span class="w-8 h-8 rounded-lg bg-warm-100 flex items-center justify-center group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
              {#if record.status === 'analyzed'}
                <CheckCircle size={16} class="text-emerald-500" />
              {:else}
                <Edit3 size={16} class="text-warm-400" />
              {/if}
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
    <div class="card text-center py-12 bg-gradient-to-b from-brand-50/30 to-white">
      <div class="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4 animate-gentle-bounce">
        <ClipboardList size={32} class="text-brand-400" />
      </div>
      <h3 class="font-semibold text-warm-800 mb-2 text-lg">你的宠物医疗档案还没有记录</h3>
      <p class="text-sm text-warm-500 mb-1">第一次来？很简单——</p>
      <p class="text-sm text-warm-600 mb-6 font-medium">拍一张账单照片，我们帮你把每一笔费用都看明白</p>
      <a href="/upload" class="btn-primary inline-flex items-center gap-2 text-base px-6 py-3">
        <Camera size={18} />上传第一张账单
      </a>
      <p class="text-xs text-warm-400 mt-4">无需注册 · 数据存在你的设备上 · 30秒即可完成</p>
    </div>
  {/if}
</div>
