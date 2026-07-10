<script lang="ts">
  import Sidebar from './Sidebar.svelte';
  import Header from './Header.svelte';
  import MobileNav from './MobileNav.svelte';
  import ChatPanel from '../ChatPanel.svelte';
  let { children }: { children?: import('svelte').Snippet } = $props();
</script>

<div class="flex h-screen overflow-hidden bg-warm-50">
  <Sidebar />
  <div class="flex-1 flex flex-col overflow-hidden">
    <Header />
    <div class="flex flex-1 overflow-hidden">
      <main class="min-w-0 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-20 lg:pb-8">
        {#if children}{@render children()}{/if}
      </main>
      <ChatPanel />
    </div>
  </div>
</div>
<MobileNav />
