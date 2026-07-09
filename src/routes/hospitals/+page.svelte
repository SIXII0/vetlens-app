<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { settings } from '$lib/stores/settings';

  let hospitals = $state<any[]>([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let amapKey = $state('');
  let amapReady = $state(false);
  let locating = $state(false);
  let amapError = $state('');
  let highlightId = $state<string | null>(null);
  let searchRadius = $state(3000);
  let currentCenter = $state('116.397,39.908');
  let currentCity = $state('');

  let mapContainer: HTMLDivElement;
  let mapInstance: any = null;
  let markers: any[] = [];

  onMount(async () => {
    try {
      const res = await fetch('/api/env-check');
      if (res.ok) amapKey = (await res.json()).AMAP_WEB_KEY || '';
    } catch {}
  });

  // ── 服务端代理搜索附近医院 ──
  async function fetchNearbyHospitals(lng: number, lat: number, radius?: number) {
    loading = true;
    const r = radius || searchRadius;
    currentCenter = `${lng.toFixed(4)},${lat.toFixed(4)}`;
    try {
      const res = await fetch(`/api/hospitals/amap?lng=${lng}&lat=${lat}&radius=${r}`);
      if (res.ok) {
        const data = await res.json();
        if (data.pois) {
          hospitals = data.pois;
          addMarkers();
        } else if (data.error) {
          console.warn('[Amap API]', data.error);
          hospitals = [];
          clearMarkers();
        }
      }
    } catch { hospitals = []; }
    loading = false;
  }

  // ── 地图标记 ──
  function addMarkers() {
    if (!mapInstance) return;
    clearMarkers();
    markers = hospitals.filter((h: any) => h.lng && h.lat).map((h: any, i: number) => {
      const m = new (window as any).AMap.Marker({
        position: [h.lng, h.lat],
        label: { content: `<div style="background:#3b82f6;color:#fff;padding:2px 6px;border-radius:10px;font-size:11px">${i+1}</div>`, offset: [0, -30] },
      });
      m.on('click', () => {
        highlightId = null;
        requestAnimationFrame(() => {
          highlightId = h.id;
          document.getElementById(`hosp-${h.id}`)?.scrollIntoView({ behavior:'smooth', block:'center' });
          setTimeout(() => highlightId = null, 2000);
        });
      });
      return m;
    });
    mapInstance.add(markers);
  }
  function clearMarkers() {
    if (mapInstance && markers.length) { mapInstance.remove(markers); markers = []; }
  }

  // ── 初始化地图 ──
  async function initAmap(center?: [number, number]) {
    if (!amapKey || amapReady) return;
    await new Promise<void>((resolve) => {
      const script = document.createElement('script');
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${amapKey}`;
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
    await tick();
    amapError = '';
    try {
      const AM = (window as any).AMap;
      if (!AM) { amapError = 'AMap SDK not loaded'; return; }
      const [lng, lat] = center || [116.397, 39.908];
      mapInstance = new AM.Map(mapContainer, { zoom: 14, center: [lng, lat] });
      amapReady = true;
      setTimeout(() => mapInstance?.resize(), 200);
      fetchNearbyHospitals(lng, lat);
    } catch (e) {
      amapError = 'Map init error: ' + (e as Error).message;
    }
  }

  // ── 定位 ──
  async function locateMe() {
    locating = true;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('not supported'));
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, enableHighAccuracy: true });
      });
      const [lng, lat] = [pos.coords.longitude, pos.coords.latitude];
      if (!amapReady) await initAmap([lng, lat]);
      else { mapInstance.setCenter([lng, lat]); setTimeout(() => mapInstance?.resize(), 100); }
      fetchNearbyHospitals(lng, lat);
    } catch {
      if (!amapReady) await initAmap();
      // Fallback: use Amap IP geolocation
      await new Promise<void>((resolve) => {
        (window as any).AMap.plugin('AMap.Geolocation', () => {
          const geo = new (window as any).AMap.Geolocation({ timeout: 8000 });
          geo.getCurrentPosition((s: string, r: any) => {
            if (s === 'complete' && r.position) {
              const [lng, lat] = [r.position.lng, r.position.lat];
              currentCity = r.addressComponent?.city || '';
              mapInstance.setCenter([lng, lat]);
              fetchNearbyHospitals(lng, lat);
            }
            resolve();
          });
        });
      });
    }
    locating = false;
  }

  // ── 地址搜索 ──
  async function searchLocation() {
    if (!searchQuery.trim()) return;
    await new Promise<void>((resolve) => {
      (window as any).AMap.plugin('AMap.AutoComplete', () => {
        const ac = new (window as any).AMap.AutoComplete({ city: currentCity || '全国' });
        ac.search(searchQuery, (status: string, result: any) => {
          if (status === 'complete' && result.tips?.[0]?.location) {
            const loc = result.tips[0].location;
            mapInstance.setCenter([loc.lng, loc.lat]);
            fetchNearbyHospitals(loc.lng, loc.lat);
          }
          resolve();
        });
      });
    });
  }

  function formatDist(m: number): string {
    return m < 1000 ? `${m}m` : `${(m/1000).toFixed(1)}km`;
  }
</script>

<div class="max-w-5xl mx-auto space-y-6">
  <h1 class="text-xl font-bold text-gray-900">🏥 医院推荐</h1>

  {#if amapKey}
    <!-- 位置选择 -->
    <div class="card">
      <div class="text-xs text-gray-500 mb-2">📍 第一步：选择你想查看的位置</div>
      <div class="flex gap-2 flex-wrap mb-3">
        <button class="btn-primary text-sm {locating?'opacity-50':''}" onclick={locateMe} disabled={locating}>
          {locating ? '⏳ 定位中...' : '📍 自动定位'}
        </button>
        {#each [
          {name:'北京',lng:116.397,lat:39.908},
          {name:'上海',lng:121.473,lat:31.230},
          {name:'广州',lng:113.264,lat:23.129},
          {name:'深圳',lng:114.057,lat:22.543},
          {name:'成都',lng:104.066,lat:30.572},
          {name:'杭州',lng:120.155,lat:30.274},
          {name:'武汉',lng:114.298,lat:30.584}
        ] as city}
          <button
            class="px-2.5 py-1 rounded-full text-xs border transition-colors {currentCity === city.name ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}"
            onclick={async () => {
              currentCity = city.name;
              if (!amapReady) await initAmap([city.lng, city.lat]);
              else { mapInstance.setCenter([city.lng, city.lat]); mapInstance.setZoom(14); }
              fetchNearbyHospitals(city.lng, city.lat);
            }}
          >{city.name}</button>
        {/each}
      </div>
      <div class="flex gap-2 flex-wrap">
        <input type="text" class="input-field flex-1 min-w-0" placeholder="或输入详细地址（小区/商圈/路名）..." bind:value={searchQuery}
          onkeydown={(e) => e.key === 'Enter' && searchLocation()} />
        <button class="btn-secondary text-sm" onclick={searchLocation} disabled={!amapReady}>🔍 搜这里</button>
        <select class="input-field w-28" bind:value={searchRadius} onchange={() => {
          const [lng, lat] = currentCenter.split(',').map(Number);
          fetchNearbyHospitals(lng, lat);
        }}>
          <option value={1000}>1km</option>
          <option value={3000}>3km</option>
          <option value={5000}>5km</option>
          <option value={10000}>10km</option>
        </select>
      </div>
    </div>

    <div class="card p-0 overflow-hidden">
      <div bind:this={mapContainer} id="amap-container" style="height:400px;width:100%">
        {#if amapError}
          <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fef2f2;gap:8px">
            <span class="text-red-500 text-sm">❌ {amapError}</span>
            <button class="btn-primary text-sm" onclick={() => initAmap()}>🔄 重试</button>
          </div>
        {:else if !amapReady}
          <div style="height:100%;display:flex;align-items:center;justify-content:center;background:#f3f4f6">
            <button class="btn-primary" onclick={() => initAmap()}>🗺️ 加载地图</button>
          </div>
        {/if}
      </div>
    </div>

    {#if loading}
      <div class="text-center py-8 text-gray-400">搜索中...</div>
    {:else if hospitals.length > 0}
      <div class="text-sm text-gray-500">找到 {hospitals.length} 家医院 · 中心: {currentCenter}</div>
      <div class="space-y-3">
        {#each hospitals as h, i}
          <div id="hosp-{h.id}" class="card transition-all duration-500 {highlightId === h.id ? 'scale-[1.02] ring-2 ring-primary-400 shadow-lg bg-primary-50/30' : ''}">
            <div class="flex items-start gap-3">
              <span class="text-lg font-bold text-primary-500 w-7">{i+1}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-semibold text-gray-900">{h.name}</h3>
                  {#if h.distance}<span class="text-xs text-primary-500">{formatDist(h.distance)}</span>{/if}
                </div>
                <div class="text-xs text-gray-500">{h.address}{#if h.phone} · 📞 {h.phone}{/if}</div>
                {#if h.rating}
                  <div class="text-xs text-amber-500 mt-0.5">⭐ {h.rating}</div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="card text-center py-12 text-gray-400">
        {amapReady ? '该范围内未找到宠物医院，试试扩大搜索范围或点击定位' : '点击"加载地图"开始'}
      </div>
    {/if}
  {:else}
    <!-- 无高德 key: 使用知识库数据库 -->
    <div class="text-xs text-gray-400">💡 在 .env 配置 AMAP_WEB_KEY 开启地图模式</div>
    <div class="card text-center py-12 text-gray-400">需要高德地图 API Key</div>
  {/if}
</div>
