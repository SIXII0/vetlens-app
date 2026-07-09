<script lang="ts">
  import { onMount } from 'svelte';
  let searchQuery=$state(''),species=$state(''),rows=$state<any[]>([]),total=$state(0),loading=$state(true),page=$state(0);
  const PS=40;
  onMount(()=>load());
  async function load(){
    loading=true;
    const p=new URLSearchParams({type:'breeds',limit:String(PS),offset:String(page*PS)});
    if(searchQuery)p.set('q',searchQuery);if(species)p.set('species',species);
    const r=await fetch(`/api/knowledge-base?${p}`);
    if(r.ok){const d=await r.json();rows=d.rows;total=d.total;}
    loading=false;
  }
</script>
<div class="max-w-4xl mx-auto space-y-6 animate-enter">
  <a href="/knowledge" class="text-sm text-warm-400 hover:text-brand-600">← 知识库首页</a>
  <div class="flex items-center justify-between"><h1 class="text-2xl font-extrabold text-warm-900">🧬 品种数据库</h1><span class="text-sm text-warm-400">{total} 种</span></div>
  <div class="card flex gap-2 flex-wrap">
    <div class="relative flex-1 min-w-0"><input type="text" class="input-field pl-9" placeholder="搜索品种名称..." bind:value={searchQuery} onkeydown={(e)=>e.key==='Enter'&&load()}/><span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400">🔍</span></div>
    <select class="input-field w-auto" bind:value={species} onchange={load}><option value="">全部物种</option><option value="cat">🐱</option><option value="dog">🐶</option></select>
    <button class="btn-primary text-sm" onclick={load}>搜索</button>
  </div>
  {#if loading}<div class="grid grid-cols-2 md:grid-cols-3 gap-3">{#each Array(6) as _}<div class="card"><div class="skeleton h-4 w-3/4 mb-2"></div><div class="skeleton h-3 w-1/2"></div></div>{/each}</div>
  {:else if rows.length===0}<div class="card text-center py-16 text-warm-400">未找到</div>
  {:else}
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {#each rows as b}
        <div class="card hover:shadow-raised transition-all cursor-pointer">
          <span class="text-lg">{b.species==='cat'?'🐱':b.species==='dog'?'🐶':'🐾'}</span>
          <h3 class="font-semibold text-sm text-warm-900 mt-1">{b.name_zh||b.canonical_name}</h3>
          <div class="flex gap-2 text-2xs text-warm-400 mt-1">
            {#if b.size_class}<span>{b.size_class}</span>{/if}
            {#if b.weight_max}<span>{b.weight_min}-{b.weight_max}kg</span>{/if}
          </div>
          {#if b.disease_count>0}<div class="text-2xs text-warm-400 mt-0.5">关联{b.disease_count}种疾病</div>{/if}
        </div>
      {/each}
    </div>
    <div class="flex justify-center gap-2">
      <button class="btn-secondary text-sm" onclick={()=>{page--;load()}} disabled={page===0}>上一页</button>
      <span class="text-sm text-warm-500 py-2">{page*PS+1}-{Math.min((page+1)*PS,total)} / {total}</span>
      <button class="btn-secondary text-sm" onclick={()=>{page++;load()}} disabled={(page+1)*PS>=total}>下一页</button>
    </div>
  {/if}
</div>
