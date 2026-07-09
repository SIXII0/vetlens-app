<script lang="ts">
  import { page } from '$app/stores';
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
    <div class="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center text-sm flex-shrink-0">🐱</div>
    <span class="text-sm font-bold text-warm-900">VetLens</span>
  </a>

  <nav class="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto text-sm">
    <a href="/" class="nv {active('/') && $page.url.pathname === '/' ? 'on' : ''}">
      <span class="nv-icon">🏠</span><span>首页</span>
    </a>

    <button class="nv w-full" class:on={active('/upload')||active('/records')||active('/reports')} onclick={()=>toggle('medical')}>
      <span class="nv-icon">📋</span><span class="flex-1">医疗档案</span>
      <svg class="w-3 h-3 transition-transform duration-200 {expandedGroup==='medical'?'rotate-90':''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>
    </button>
    <div class="sub {expandedGroup==='medical'?'open':''}">
      <a href="/upload" class="sub-i {active('/upload')?'on':''}">📸 上传账单</a>
      <a href="/records" class="sub-i {active('/records')?'on':''}">📋 就诊记录</a>
      <a href="/reports" class="sub-i {active('/reports')?'on':''}">📄 分析报告</a>
    </div>

    <button class="nv w-full" class:on={active('/pets')||active('/health')||active('/vaccines')||active('/medications')} onclick={()=>toggle('pets')}>
      <span class="nv-icon">🐾</span><span class="flex-1">宠物档案</span>
      <svg class="w-3 h-3 transition-transform duration-200 {expandedGroup==='pets'?'rotate-90':''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>
    </button>
    <div class="sub {expandedGroup==='pets'?'open':''}">
      <a href="/pets" class="sub-i {active('/pets') && !active('/health') && !active('/vaccines') && !active('/medications')?'on':''}">🐱 宠物列表</a>
      <a href="/health" class="sub-i {active('/health')?'on':''}">🩺 健康监测</a>
      <a href="/vaccines" class="sub-i {active('/vaccines')?'on':''}">💉 疫苗驱虫</a>
      <a href="/medications" class="sub-i {active('/medications')?'on':''}">💊 用药提醒</a>
    </div>

    <div class="mx-2 my-1.5 border-t border-warm-100"></div>

    <a href="/hospitals" class="nv {active('/hospitals')?'on':''}"><span class="nv-icon">🏥</span><span>医院查询</span></a>
    <a href="/insurance" class="nv {active('/insurance')?'on':''}"><span class="nv-icon">🛡️</span><span>保单管理</span></a>
    <a href="/knowledge" class="nv {active('/knowledge')?'on':''}"><span class="nv-icon">📚</span><span>知识库</span></a>
    <a href="/settings" class="nv {active('/settings')?'on':''}"><span class="nv-icon">⚙️</span><span>设置</span></a>
  </nav>

  <div class="px-4 py-2.5 border-t border-warm-100">
    <p class="text-2xs text-warm-400">VetLens · 站在宠物主这一方</p>
  </div>
</aside>

<style>
  .nv {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.5rem 0.75rem; border-radius: 0.75rem;
    color: #524d47; font-weight: 500;
    transition: all 0.15s;
  }
  .nv:hover { background: #f5f3f0; color: #2d2a26; }
  .nv.on { background: #fef7f2; color: #9e4f25; font-weight: 600; }
  .nv-icon { width: 1.25rem; text-align: center; flex-shrink: 0; font-size: 0.875rem; }
  .sub {
    margin-left: 0.75rem; padding-left: 0.75rem;
    border-left: 1px solid #e8e4df; overflow: hidden;
    max-height: 0; transition: max-height 0.25s ease;
  }
  .sub.open { max-height: 150px; }
  .sub-i {
    display: block; padding: 0.375rem 0.5rem; border-radius: 0.5rem;
    font-size: 0.8125rem; color: #8c857c;
    transition: all 0.15s;
  }
  .sub-i:hover { color: #2d2a26; background: #f5f3f0; }
  .sub-i.on { color: #9e4f25; background: rgb(253 233 219 / 0.5); font-weight: 500; }
</style>
