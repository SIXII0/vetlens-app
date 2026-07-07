<script lang="ts">
  import { page } from '$app/stores';

  const pageTitles: Record<string, string> = {
    '/': '首页',
    '/upload': '上传账单',
    '/records': '就诊记录',
    '/pets': '宠物档案',
    '/hospitals': '医院推荐',
    '/insurance': '保单管理',
    '/knowledge': '知识库',
    '/settings': '设置'
  };

  function getPageTitle(): string {
    const path = $page.url.pathname;
    // 精确匹配
    if (pageTitles[path]) return pageTitles[path];
    // 前缀匹配
    for (const [prefix, title] of Object.entries(pageTitles)) {
      if (prefix !== '/' && path.startsWith(prefix)) return title;
    }
    return 'VetLens';
  }

  $effect(() => {
    // 更新 document title
    document.title = `${getPageTitle()} — VetLens 宠医透镜`;
  });
</script>

<header class="flex items-center justify-between h-16 px-6 bg-white border-b border-gray-200">
  <div class="flex items-center gap-4">
    <!-- 移动端菜单按钮 -->
    <button class="lg:hidden btn-ghost text-xl" aria-label="菜单">
      ☰
    </button>
    <h2 class="text-lg font-semibold text-gray-900">{getPageTitle()}</h2>
  </div>

  <div class="flex items-center gap-3">
    <!-- 知识库状态指示 -->
    <span class="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
      知识库就绪
    </span>
  </div>
</header>
