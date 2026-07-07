<script lang="ts">
  import Sidebar from './Sidebar.svelte';
  import Header from './Header.svelte';

  let { children }: { children?: import('svelte').Snippet } = $props();
</script>

<div class="flex h-screen overflow-hidden bg-gray-50">
  <!-- 侧边导航 -->
  <Sidebar />

  <!-- 主内容区 -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <Header />

    <main class="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
      {#if children}
        {@render children()}
      {/if}
    </main>
  </div>
</div>
