<script lang="ts">
  import { page } from '$app/stores';

  const pageTitles: Record<string, string> = {
    '/': '首页', '/upload': '上传账单', '/records': '就诊记录',
    '/reports': '分析报告', '/health': '健康监测', '/pets': '宠物档案',
    '/hospitals': '医院推荐', '/insurance': '保单管理', '/knowledge': '知识库', '/settings': '设置'
  };

  function getPageTitle(): string {
    const path = $page.url.pathname;
    if (pageTitles[path]) return pageTitles[path];
    for (const [prefix, title] of Object.entries(pageTitles)) {
      if (prefix !== '/' && path.startsWith(prefix)) return title;
    }
    return 'VetLens';
  }

  $effect(() => { document.title = `${getPageTitle()} — VetLens`; });
</script>

<header class="flex items-center justify-between h-14 px-6 bg-white/70 backdrop-blur-xl border-b border-warm-100/60 sticky top-0 z-20">
  <h2 class="text-base font-bold text-warm-900 tracking-tight">{getPageTitle()}</h2>
  <span class="inline-flex items-center gap-1.5 text-2xs text-warm-400">
    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>就绪
  </span>
</header>
