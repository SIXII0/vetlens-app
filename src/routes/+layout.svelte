<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import '../app.css';
  let { children } = $props();
</script>

<AppShell>
  {#if children}
    {@render children()}
  {/if}
</AppShell>
