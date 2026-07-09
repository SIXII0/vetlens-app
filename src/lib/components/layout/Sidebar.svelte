<script lang="ts">
  import { page } from '$app/stores';

  let expandedGroup = $state<string | null>(null);

  function toggleGroup(key: string) {
    expandedGroup = expandedGroup === key ? null : key;
  }

  function isActive(path: string): boolean {
    if (path === '/') return $page.url.pathname === '/';
    return $page.url.pathname.startsWith(path);
  }
</script>

<aside class="hidden lg:flex lg:flex-col w-64 bg-white border-r border-gray-200">
  <div class="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
    <span class="text-2xl">🐱</span>
    <div>
      <h1 class="text-lg font-bold text-gray-900">VetLens</h1>
      <p class="text-xs text-gray-500">宠医透镜</p>
    </div>
  </div>

  <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
    <a href="/" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors {isActive('/') && $page.url.pathname === '/' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}">
      <span class="text-lg">🏠</span><span>首页</span>
    </a>

    <!-- ── 医疗档案 ── -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer
             {isActive('/upload') || isActive('/records') || isActive('/reports') ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}"
      onclick={() => toggleGroup('medical')}
      role="button" tabindex="0"
      onkeydown={(e) => { if (e.key === 'Enter') toggleGroup('medical'); }}
    >
      <span class="text-lg">📋</span>
      <span class="flex-1">医疗档案</span>
      <span class="text-xs transition-transform {expandedGroup === 'medical' ? 'rotate-90' : ''}">▶</span>
    </div>
    {#if expandedGroup === 'medical'}
      <div class="ml-4 space-y-0.5 border-l-2 border-gray-100 pl-4">
        <a href="/upload" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors {isActive('/upload') ? 'bg-primary-50 text-primary-600 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}">
          <span class="text-sm">📸</span><span>上传账单</span>
        </a>
        <a href="/records" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors {isActive('/records') ? 'bg-primary-50 text-primary-600 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}">
          <span class="text-sm">📋</span><span>就诊记录</span>
        </a>
        <a href="/reports" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors {isActive('/reports') ? 'bg-primary-50 text-primary-600 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}">
          <span class="text-sm">📄</span><span>分析报告</span>
        </a>
      </div>
    {/if}

    <!-- ── 宠物档案 ── -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer
             {isActive('/pets') || isActive('/health') ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}"
      onclick={() => toggleGroup('pets')}
      role="button" tabindex="0"
      onkeydown={(e) => { if (e.key === 'Enter') toggleGroup('pets'); }}
    >
      <span class="text-lg">🐾</span>
      <span class="flex-1">宠物档案</span>
      <span class="text-xs transition-transform {expandedGroup === 'pets' ? 'rotate-90' : ''}">▶</span>
    </div>
    {#if expandedGroup === 'pets'}
      <div class="ml-4 space-y-0.5 border-l-2 border-gray-100 pl-4">
        <a href="/pets" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors {isActive('/pets') ? 'bg-primary-50 text-primary-600 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}">
          <span>🐱</span><span>宠物列表</span>
        </a>
        <a href="/health" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors {isActive('/health') ? 'bg-primary-50 text-primary-600 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}">
          <span>🩺</span><span>健康监测</span>
        </a>
      </div>
    {/if}

    <a href="/hospitals" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors {isActive('/hospitals') ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}">
      <span class="text-lg">🏥</span><span>医院推荐</span>
    </a>
    <a href="/insurance" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors {isActive('/insurance') ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}">
      <span class="text-lg">🛡️</span><span>保单管理</span>
    </a>
    <a href="/knowledge" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors {isActive('/knowledge') ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}">
      <span class="text-lg">📚</span><span>知识库</span>
    </a>
    <a href="/settings" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors {isActive('/settings') ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}">
      <span class="text-lg">⚙️</span><span>设置</span>
    </a>
  </nav>

  <div class="px-6 py-4 border-t border-gray-100">
    <p class="text-xs text-gray-400">VetLens v0.1.0</p>
    <p class="text-xs text-gray-400">站在宠物主这一方 🐾</p>
  </div>
</aside>
