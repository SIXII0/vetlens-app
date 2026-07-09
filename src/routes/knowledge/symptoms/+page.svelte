<script lang="ts">
  import { onMount } from 'svelte';
  let searchQuery=$state(''),rows=$state<any[]>([]),total=$state(0),loading=$state(true);
  onMount(()=>load());
  async function load(){
    loading=true;
    const p=new URLSearchParams({type:'symptoms',limit:'100'});
    if(searchQuery)p.set('q',searchQuery);
    const r=await fetch(`/api/knowledge-base?${p}`);
    if(r.ok){const d=await r.json();rows=d.rows;total=d.total;}
    loading=false;
  }
</script>
<div class="max-w-4xl mx-auto space-y-6 animate-enter">
  <a href="/knowledge" class="text-sm text-warm-400 hover:text-brand-600">← 知识库首页</a>
  <h1 class="text-2xl font-extrabold text-warm-900">🔍 症状索引</h1>
  <div class="card flex gap-2"><div class="relative flex-1"><input type="text" class="input-field pl-9" placeholder="搜索症状..." bind:value={searchQuery} onkeydown={(e)=>e.key==='Enter'&&load()}/><span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400">🔍</span></div><button class="btn-primary text-sm" onclick={load}>搜索</button></div>
  {#if loading}<div class="flex flex-wrap gap-2">{#each Array(12) as _}<div class="skeleton h-8 w-24 rounded-full"></div>{/each}</div>
  {:else}
    <div class="flex flex-wrap gap-2">
      {#each rows as s}
        <a href="/knowledge/diseases?q={s.slug}" class="px-3 py-2 rounded-full text-sm bg-white border border-warm-200 text-warm-700 hover:border-brand-300 hover:text-brand-700 transition-colors no-underline">
          {s.name_zh||s.canonical_name}
          {#if s.disease_count>0}<span class="text-2xs text-warm-400 ml-1">{s.disease_count}</span>{/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
