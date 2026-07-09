<script lang="ts">
  import { onMount } from 'svelte';
  let searchQuery=$state(''), rows=$state<any[]>([]), total=$state(0), loading=$state(true), page=$state(0);
  const PS=30;
  onMount(()=>load());
  async function load() {
    loading=true;
    const p=new URLSearchParams({type:'drugs',limit:String(PS),offset:String(page*PS)});
    if(searchQuery)p.set('q',searchQuery);
    const r=await fetch(`/api/knowledge-base?${p}`);
    if(r.ok){const d=await r.json();rows=d.rows;total=d.total;}
    loading=false;
  }
</script>
<div class="max-w-4xl mx-auto space-y-6 animate-enter">
  <a href="/knowledge" class="text-sm text-warm-400 hover:text-brand-600">← 知识库首页</a>
  <div class="flex items-center justify-between"><h1 class="text-2xl font-extrabold text-warm-900">💊 药物数据库</h1><span class="text-sm text-warm-400">{total} 种</span></div>
  <div class="card flex gap-2"><div class="relative flex-1"><input type="text" class="input-field pl-9" placeholder="搜索药物名称、品牌..." bind:value={searchQuery} onkeydown={(e)=>e.key==='Enter'&&load()}/><span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400">🔍</span></div><button class="btn-primary text-sm" onclick={load}>搜索</button></div>
  {#if loading}<div class="space-y-2">{#each Array(6) as _}<div class="card"><div class="skeleton h-5 w-1/2"></div></div>{/each}</div>
  {:else if rows.length===0}<div class="card text-center py-16 text-warm-400">未找到</div>
  {:else}
    <div class="space-y-2">
      {#each rows as d}
        <div class="card hover:shadow-raised transition-all">
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-warm-900 text-sm">{d.name_zh||d.generic_name}</h3>
              <p class="text-xs text-warm-400 font-mono">{d.generic_name}</p>
              {#if d.drug_class}<span class="text-2xs px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700">{d.drug_class}</span>{/if}
              {#if d.brand_names}{@const brands=JSON.parse(d.brand_names||'[]')}<span class="text-xs text-warm-500 ml-2">{brands.slice(0,3).join(' / ')}</span>{/if}
            </div>
            <span class="text-warm-300 text-sm">→</span>
          </div>
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
