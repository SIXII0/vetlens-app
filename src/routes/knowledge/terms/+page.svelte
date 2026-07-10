<script lang="ts">
  import { onMount } from 'svelte';
  let searchQuery=$state(''),category=$state(''),rows=$state<any[]>([]),total=$state(0),loading=$state(true),page=$state(0);
  const PS=40;
  onMount(()=>load());
  async function load(){
    loading=true;
    const p=new URLSearchParams({type:'terms',limit:String(PS),offset:String(page*PS)});
    if(searchQuery)p.set('q',searchQuery);
    const r=await fetch(`/api/knowledge-base?${p}`);
    if(r.ok){const d=await r.json();rows=d.rows;total=d.total;}
    loading=false;
  }
  let cats=$derived(['全部',...new Set(rows.map((r:any)=>r.category||'其他')).values()].sort());
  let filtered=$derived(category==='全部'||!category?rows:rows.filter((r:any)=>(r.category||'其他')===category));
  function catColor(c:string){const m:Record<string,string>={检查:'bg-sky-50 text-sky-700',药品:'bg-rose-50 text-rose-700',治疗:'bg-amber-50 text-amber-700',手术:'bg-purple-50 text-purple-700',耗材:'bg-gray-100 text-gray-600',服务:'bg-teal-50 text-teal-700',预防:'bg-emerald-50 text-emerald-700'};return m[c]||'bg-gray-50 text-gray-500';}
</script>
<div class="max-w-4xl mx-auto space-y-6 animate-enter">
  <a href="/knowledge" class="text-sm text-warm-400 hover:text-brand-600">← 知识库首页</a>
  <h1 class="text-2xl font-extrabold text-warm-900">📋 诊疗项目</h1>
  <div class="card flex gap-2"><div class="relative flex-1"><input type="text" class="input-field pl-9" placeholder="搜索检查、药品、治疗项目..." bind:value={searchQuery} onkeydown={(e)=>e.key==='Enter'&&load()}/><span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400">🔍</span></div><button class="btn-primary text-sm" onclick={load}>搜索</button></div>

  <!-- 分类筛选 -->
  <div class="flex flex-wrap gap-1.5">
    {#each cats as c}
      <button class="px-2.5 py-1 rounded-full text-xs font-medium transition-colors {category===c||(c==='全部'&&!category)?'bg-brand-500 text-white':'bg-white border border-warm-200 text-warm-600 hover:border-warm-300'}" onclick={()=>category=c==='全部'?'':c}>
        {c}
      </button>
    {/each}
  </div>

  {#if loading}<div class="space-y-2">{#each Array(6) as _}<div class="card"><div class="skeleton h-5 w-1/2 mb-2"></div><div class="skeleton h-3 w-full"></div></div>{/each}</div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      {#each filtered as t}
        <div class="card hover:shadow-raised transition-all cursor-pointer">
          <div class="flex items-center gap-2 mb-1">
            <h3 class="font-semibold text-sm text-warm-900">{t.name}</h3>
            <span class="text-2xs px-1.5 py-0.5 rounded-full {catColor(t.category)}">{t.category}</span>
            {#if t.necessity_hint}<span class="text-2xs text-warm-400">{t.necessity_hint}</span>{/if}
          </div>
          <p class="text-xs text-warm-500 leading-relaxed">{t.plain_explain || t.medical_explain || ''}</p>
          {#if t.aliases}
            <div class="text-2xs text-warm-400 mt-1">别名: {t.aliases}</div>
          {/if}
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
