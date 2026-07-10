<script lang="ts">
  import { page } from '$app/stores';
  import {
    Home, ClipboardList, FileText, Upload,
    PawPrint, Heart, Syringe, Pill,
    Hospital, Shield, BookOpen, Settings,
    ChevronRight
  } from '@lucide/svelte';

  let expandedGroup = $state<string | null>(null);
  function toggle(k: string) { expandedGroup = expandedGroup === k ? null : k; }
  function active(path: string): boolean {
    if (path === '/') return $page.url.pathname === '/';
    return $page.url.pathname.startsWith(path);
  }
</script>

<aside class="hidden lg:flex lg:flex-col w-56 bg-white border-r border-warm-200">
  <!-- Logo -->
  <a href="/" class="flex items-center gap-2.5 px-4 py-3.5 no-underline border-b border-warm-100">
    <div class="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
      <PawPrint size={18} class="text-brand-600" />
    </div>
    <div class="flex flex-col">
      <span class="text-sm font-bold text-warm-900">VetLens</span>
      <span class="text-2xs text-warm-500">宠医透镜</span>
    </div>
  </a>

  <nav class="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto text-sm">
    <a href="/" class="nv {active('/') && $page.url.pathname === '/' ? 'on' : ''}">
      <Home size={16} class="nv-icon" /><span>首页</span>
    </a>

    <button class="nv w-full" class:on={active('/upload')||active('/records')||active('/reports')} onclick={()=>toggle('medical')}>
      <ClipboardList size={16} class="nv-icon" /><span class="flex-1">医疗档案</span>
      <ChevronRight size={14} class="transition-transform duration-200 {expandedGroup==='medical'?'rotate-90':''}" />
    </button>
    <div class="sub {expandedGroup==='medical'?'open':''}">
      <a href="/upload" class="sub-i {active('/upload')?'on':''}">
        <Upload size={14} class="inline mr-1.5 opacity-60" />上传账单
      </a>
      <a href="/records" class="sub-i {active('/records')?'on':''}">
        <FileText size={14} class="inline mr-1.5 opacity-60" />就诊记录
      </a>
      <a href="/reports" class="sub-i {active('/reports')?'on':''}">
        <FileText size={14} class="inline mr-1.5 opacity-60" />分析报告
      </a>
    </div>

    <button class="nv w-full" class:on={active('/pets')||active('/health')||active('/vaccines')||active('/medications')} onclick={()=>toggle('pets')}>
      <PawPrint size={16} class="nv-icon" /><span class="flex-1">宠物档案</span>
      <ChevronRight size={14} class="transition-transform duration-200 {expandedGroup==='pets'?'rotate-90':''}" />
    </button>
    <div class="sub {expandedGroup==='pets'?'open':''}">
      <a href="/pets" class="sub-i {active('/pets') && !active('/health') && !active('/vaccines') && !active('/medications')?'on':''}">
        <PawPrint size={14} class="inline mr-1.5 opacity-60" />宠物列表
      </a>
      <a href="/health" class="sub-i {active('/health')?'on':''}">
        <Heart size={14} class="inline mr-1.5 opacity-60" />健康监测
      </a>
      <a href="/vaccines" class="sub-i {active('/vaccines')?'on':''}">
        <Syringe size={14} class="inline mr-1.5 opacity-60" />疫苗驱虫
      </a>
      <a href="/medications" class="sub-i {active('/medications')?'on':''}">
        <Pill size={14} class="inline mr-1.5 opacity-60" />用药提醒
      </a>
    </div>

    <div class="mx-2 my-1.5 border-t border-warm-100"></div>

    <a href="/hospitals" class="nv {active('/hospitals')?'on':''}">
      <Hospital size={16} class="nv-icon" /><span>医院查询</span>
    </a>
    <a href="/insurance" class="nv {active('/insurance')?'on':''}">
      <Shield size={16} class="nv-icon" /><span>保单管理</span>
    </a>
    <a href="/knowledge" class="nv {active('/knowledge')?'on':''}">
      <BookOpen size={16} class="nv-icon" /><span>知识库</span>
    </a>
    <a href="/settings" class="nv {active('/settings')?'on':''}">
      <Settings size={16} class="nv-icon" /><span>设置</span>
    </a>
  </nav>

  <div class="px-4 py-2.5 border-t border-warm-100">
    <p class="text-2xs text-warm-500">VetLens · 宠物医疗账单解读</p>
  </div>
</aside>

<style lang="postcss">
  .nv {
    @apply flex items-center gap-2 px-3 py-2 rounded-xl text-warm-700 font-medium;
    transition: all 0.15s;
  }
  .nv:hover { @apply bg-warm-100 text-warm-900; }
  .nv.on { @apply bg-brand-50 text-brand-700 font-semibold; }
  .nv :global(.nv-icon) { @apply flex-shrink-0 opacity-70; }
  .nv.on :global(.nv-icon) { @apply opacity-100; }
  .sub {
    @apply ml-3 pl-3 overflow-hidden;
    max-height: 0;
    transition: max-height 0.25s ease;
  }
  .sub.open { max-height: 200px; }
  .sub-i {
    @apply flex items-center px-2 py-1.5 rounded-lg text-xs text-warm-500;
    transition: all 0.15s;
  }
  .sub-i:hover { @apply text-warm-900 bg-warm-100; }
  .sub-i.on { @apply text-brand-700 bg-brand-50 font-medium; }
</style>
