<script lang="ts">
  import { page } from '$app/stores';
  import { chatOpen, openChat, closeChat } from '$lib/stores/chat';
  import { MessageCircle, X } from '@lucide/svelte';

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
  <div class="flex items-center gap-3">
    <button
      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors group relative"
      class:bg-brand-50={$chatOpen}
      class:text-brand-600={$chatOpen}
      class:text-warm-500={!$chatOpen}
      class:hover:bg-brand-100={!$chatOpen}
      onclick={() => {
        if ($chatOpen) { closeChat(); }
        else {
          const id = $page.params.id;
          const path = $page.url.pathname;
          if (path.startsWith('/analysis/') && id) {
            openChat({ analysisId: id, recordId: id });
          } else if (path.startsWith('/pets/') && id) {
            openChat({ petId: id });
          } else {
            openChat({});
          }
        }
      }}
    >
      {#if $chatOpen}
        <X size={14} />
        <span>关闭助手</span>
      {:else}
        <MessageCircle size={14} class="group-hover:animate-pulse" />
        <span>有问题？问我</span>
      {/if}
    </button>
  </div>
</header>
