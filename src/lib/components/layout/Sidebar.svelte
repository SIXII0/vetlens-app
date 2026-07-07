<script lang="ts">
  import { page } from '$app/stores';

  const navItems = [
    { href: '/', label: '首页', icon: '🏠' },
    { href: '/upload', label: '上传账单', icon: '📸' },
    { href: '/records', label: '就诊记录', icon: '📋' },
    { href: '/reports', label: '分析报告', icon: '📄' },
    { href: '/pets', label: '宠物档案', icon: '🐾' },
    { href: '/hospitals', label: '医院推荐', icon: '🏥' },
    { href: '/insurance', label: '保单管理', icon: '🛡️' },
    { href: '/knowledge', label: '知识库', icon: '📚' },
    { href: '/settings', label: '设置', icon: '⚙️' }
  ];

  function isActive(path: string): boolean {
    if (path === '/') return $page.url.pathname === '/';
    return $page.url.pathname.startsWith(path);
  }
</script>

<aside class="hidden lg:flex lg:flex-col w-64 bg-white border-r border-gray-200">
  <!-- Logo -->
  <div class="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
    <span class="text-2xl">🐱</span>
    <div>
      <h1 class="text-lg font-bold text-gray-900">VetLens</h1>
      <p class="text-xs text-gray-500">宠医透镜</p>
    </div>
  </div>

  <!-- 导航 -->
  <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
    {#each navItems as item}
      <a
        href={item.href}
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
               {isActive(item.href)
                 ? 'bg-primary-50 text-primary-700'
                 : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}"
      >
        <span class="text-lg">{item.icon}</span>
        <span>{item.label}</span>
      </a>
    {/each}
  </nav>

  <!-- 底部信息 -->
  <div class="px-6 py-4 border-t border-gray-100">
    <p class="text-xs text-gray-400">VetLens v0.1.0</p>
    <p class="text-xs text-gray-400">站在宠物主这一方 🐾</p>
  </div>
</aside>
