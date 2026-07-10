<script lang="ts">
  import { page } from '$app/stores';
  import { Home, Upload, FileText, PawPrint, Settings } from '@lucide/svelte';

  const navItems = [
    { href: '/', icon: Home, label: '首页' },
    { href: '/upload', icon: Upload, label: '上传' },
    { href: '/records', icon: FileText, label: '记录' },
    { href: '/pets', icon: PawPrint, label: '宠物' },
    { href: '/settings', icon: Settings, label: '设置' },
  ];

  function isActive(href: string, currentPath: string): boolean {
    if (href === '/') return currentPath === '/';
    return currentPath.startsWith(href);
  }
</script>

<nav class="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-lg border-t border-warm-100" aria-label="移动端导航">
  <div class="flex items-center justify-around h-16 safe-bottom">
    {#each navItems as item}
      {@const active = isActive(item.href, $page.url.pathname)}
      <a
        href={item.href}
        class="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors {active ? 'text-brand-600' : 'text-warm-400 hover:text-warm-600'}"
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
      >
        <svelte:component this={item.icon} size={20} strokeWidth={active ? 2.5 : 2} />
        <span class="text-2xs font-medium {active ? 'text-brand-600' : 'text-warm-400'}">{item.label}</span>
      </a>
    {/each}
  </div>
</nav>

<style>
  .safe-bottom {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
</style>
