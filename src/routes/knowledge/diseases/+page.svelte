<script lang="ts">
  import { onMount } from 'svelte';

  let searchQuery = $state('');
  let species = $state('');
  let urgency = $state('');
  let rows = $state<any[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let page = $state(0);
  const PAGE_SIZE = 30;

  onMount(() => load());
  $effect(() => { page = 0; load(); });

  async function load() {
    loading = true;
    const params = new URLSearchParams({ type:'diseases', limit:String(PAGE_SIZE), offset:String(page*PAGE_SIZE) });
    if (searchQuery) params.set('q', searchQuery);
    if (species) params.set('species', species);
    if (urgency) params.set('urgency', urgency);
    const res = await fetch(`/api/knowledge-base?${params}`);
    if (res.ok) { const d = await res.json(); rows = d.rows; total = d.total; }
    loading = false;
  }

  function urgencyBadge(lvl: number) {
    if (lvl >= 4) return 'bg-red-50 text-red-700';
    if (lvl >= 2) return 'bg-amber-50 text-amber-700';
    return 'bg-emerald-50 text-emerald-700';
  }
</script>

<div class="max-w-4xl mx-auto space-y-6 animate-enter">
  <a href="/knowledge" class="text-sm text-warm-400 hover:text-brand-600 transition-colors">← 知识库首页</a>
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-extrabold text-warm-900">🩺 疾病数据库</h1>
    <span class="text-sm text-warm-400">{total} 条</span>
  </div>

  <div class="card flex gap-3 flex-wrap">
    <div class="relative flex-1 min-w-0">
      <input type="text" class="input-field pl-9" placeholder="搜索疾病名称..." bind:value={searchQuery} onkeydown={(e)=>e.key==='Enter'&&load()}/>
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400">🔍</span>
    </div>
    <select class="input-field w-auto" bind:value={species} onchange={load}>
      <option value="">全部物种</option><option value="cat">🐱 猫</option><option value="dog">🐶 狗</option>
    </select>
    <button class="btn-primary text-sm" onclick={load}>搜索</button>
  </div>

  {#if loading}
    <div class="space-y-3">{#each Array(6) as _}<div class="card"><div class="skeleton h-5 w-2/3 mb-2"></div><div class="skeleton h-3 w-full"></div></div>{/each}</div>
  {:else if rows.length===0}
    <div class="card text-center py-16 text-warm-400">未找到匹配疾病</div>
  {:else}
    <div class="space-y-2">
      {#each rows as d}
        <a href="/knowledge/diseases/{d.slug}" class="card block hover:shadow-raised hover:-translate-y-0.5 transition-all no-underline">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <h3 class="font-semibold text-warm-900">{d.name_zh || d.canonical_name}</h3>
                <span class="text-2xs px-1.5 py-0.5 rounded-full {urgencyBadge(d.urgency)}">{['','低','中','高','紧急','危急'][d.urgency||0]||'未知'}</span>
                {#if d.rarity}<span class="text-2xs text-warm-400">{d.rarity}</span>{/if}
              </div>
              <p class="text-xs text-warm-500 line-clamp-2">{d.description_zh || ''}</p>
            </div>
            <span class="text-warm-300 text-sm">→</span>
          </div>
        </a>
      {/each}
    </div>
    <div class="flex justify-center gap-2">
      <button class="btn-secondary text-sm" onclick={()=>{page=Math.max(0,page-1);load()}} disabled={page===0}>上一页</button>
      <span class="text-sm text-warm-500 py-2">{(page)*PAGE_SIZE+1}-{Math.min((page+1)*PAGE_SIZE,total)} / {total}</span>
      <button class="btn-secondary text-sm" onclick={()=>{page++;load()}} disabled={(page+1)*PAGE_SIZE>=total}>下一页</button>
    </div>
  {/if}
</div>
