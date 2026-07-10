<script lang="ts">
  import { goto } from '$app/navigation';
  import { analysisState } from '$lib/stores/analysis';
  import { selectedPetId, pets, loadPets } from '$lib/stores/pets';
  import { settings } from '$lib/stores/settings';
  import { onMount } from 'svelte';
  import { formatCurrency } from '$lib/utils/format';
  import { recognizeWithTesseract, isTesseractAvailable } from '$lib/utils/ocr-client';

  onMount(() => {
    loadPets();
  });

  // ---- 状态 ----
  let step = $state<'upload' | 'ocr' | 'review' | 'analyzing' | 'result'>('upload');
  let previewUrl = $state<string | null>(null);
  let ocrLoading = $state(false);
  let ocrError = $state<string | null>(null);
  let ocrResult: any = $state(null);
  let editedItems = $state<Array<{ name: string; amount: number }>>([]);
  let hospitalName = $state('');
  let visitDate = $state(new Date().toISOString().split('T')[0]);
  let city = $state('');
  let analyzing = $state(false);
  let dragOver = $state(false);
  let useLlm = $state(false);

  // 筛选和排序
  let filterMode = $state<'all' | 'items_only'>('items_only');
  let sortBy = $state<'original' | 'name' | 'amount'>('original');
  let llmExtracting = $state(false);
  let llmExtractError = $state<string | null>(null);

  // 初始化默认城市
  $effect(() => {
    city = $settings.defaultCity || '北京';
  });

  // ---- 文件上传 ----
  function handleFileSelect(file: File) {
    if (!file.type.startsWith('image/')) {
      ocrError = '请上传图片文件（JPG、PNG 等）';
      return;
    }

    previewUrl = URL.createObjectURL(file);
    ocrError = null;
    processOcr(file);
  }

  function handleDrop(e: DragEvent) {
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) handleFileSelect(file);
  }

  function handleInputChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) handleFileSelect(file);
  }

  // ---- OCR 处理 ----
  let ocrEngine = $state<string>('');

  /** 快速检测服务端 OCR 是否可用 */
  async function checkOcrAvailable(): Promise<boolean> {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const info = await res.json();
        return info.available === true;
      }
    } catch { /* ignore */ }
    return false;
  }

  function fillFormFromStructured(structured: any) {
    if (!structured) return;

    hospitalName = structured.hospitalName || '';
    visitDate = structured.date || new Date().toISOString().split('T')[0];
    city = $settings.defaultCity || '北京';

    const structuredItems = (structured.items || [])
      .filter((it: any) => it.name && it.name.trim())
      .map((it: any) => ({ name: it.name.trim(), amount: it.amount || 0 }));

    if (structuredItems.length > 0) {
      editedItems = structuredItems;
    } else {
      editedItems = [{ name: '', amount: 0 }];
    }
  }

  async function processOcr(file: File) {
    step = 'ocr';
    ocrLoading = true;
    ocrError = null;

    let ocrSucceeded = false;

    // 策略一：尝试服务端 OCR（Python Tesseract 服务）
    const ocrAvailable = await checkOcrAvailable();
    if (ocrAvailable) {
      ocrEngine = '服务端 Tesseract OCR';
      try {
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch('/api/ocr', { method: 'POST', body: formData });
        const result = await res.json();

        if (result.success) {
          ocrResult = result;
          fillFormFromStructured(result.structured);
          ocrSucceeded = true;
        } else {
          console.warn('[Upload] 服务端 OCR 返回失败:', result.error);
        }
      } catch (err) {
        console.warn('[Upload] 服务端 OCR 请求异常:', err);
      }
    } else {
      console.log('[Upload] 服务端 OCR 未启动，直接尝试浏览器端 Tesseract.js');
    }

    // 策略二：浏览器端 Tesseract.js 降级
    if (!ocrSucceeded && isTesseractAvailable()) {
      ocrEngine = '浏览器端 Tesseract.js';
      ocrError = ocrAvailable
        ? '服务端 OCR 识别失败，正在使用浏览器端引擎...'
        : '正在使用浏览器端 OCR 引擎识别中...';

      try {
        const tesseractResult = await recognizeWithTesseract(file);

        if (tesseractResult.success) {
          ocrResult = tesseractResult;
          fillFormFromStructured(tesseractResult.structured);
          ocrError = `✅ 已通过浏览器端 OCR 识别完成（置信度: ${(tesseractResult.confidence * 100).toFixed(0)}%）`;
          ocrSucceeded = true;
        } else {
          const detail = tesseractResult.errorDetail ? ` (${tesseractResult.errorDetail})` : '';
          ocrError = `浏览器端 OCR 未识别到内容。原因: ${tesseractResult.error || '未知'}${detail}`;
          console.error('[Upload] Tesseract 错误详情:', tesseractResult);
        }
      } catch (tessErr) {
        console.error('[Upload] Tesseract.js 异常:', tessErr);
        ocrError = `浏览器端 OCR 失败: ${String(tessErr)}。请手动输入账单信息`;
      }
    } else if (!ocrSucceeded && !isTesseractAvailable()) {
      ocrError = '没有可用的 OCR 引擎（服务端和浏览器端均不可用），请手动输入账单信息';
    }

    // 策略三：手动输入（最终降级）
    if (!ocrSucceeded) {
      ocrError = ocrError || 'OCR 识别失败，请手动输入账单信息';
    }

    editedItems = ocrSucceeded
      ? editedItems  // 已由 fillFormFromStructured 填充
      : [
          { name: '', amount: 0 },
          { name: '', amount: 0 }
        ];
    step = 'review';
    ocrLoading = false;
  }

  // ---- 手动编辑 ----
  function addItem() {
    editedItems = [...editedItems, { name: '', amount: 0 }];
  }

  function removeItem(index: number) {
    if (editedItems.length > 1) {
      editedItems = editedItems.filter((_, i) => i !== index);
    }
  }

  function updateItemName(index: number, value: string) {
    editedItems = editedItems.map((item, i) =>
      i === index ? { ...item, name: value } : item
    );
  }

  function updateItemAmount(index: number, value: string) {
    const amount = parseFloat(value) || 0;
    editedItems = editedItems.map((item, i) =>
      i === index ? { ...item, amount } : item
    );
  }

  // ---- 分析 ----
  async function startAnalysis() {
    const validItems = editedItems.filter(it => it.name.trim() && it.amount > 0);
    if (validItems.length === 0) {
      ocrError = '请至少添加一个费用项目';
      return;
    }

    step = 'analyzing';
    analyzing = true;
    ocrError = null;

    const totalAmount = validItems.reduce((sum, it) => sum + it.amount, 0);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: validItems,
          city,
          hospitalName: hospitalName || undefined,
          petId: $selectedPetId || undefined,
          petName: $selectedPetId ? ($pets.find(p => p.id === $selectedPetId)?.name || undefined) : undefined,
          visitDate,
          totalAmount,
          rawOcrText: ocrResult?.rawText || ocrResult?.text || null,
          useLlm
        })
      });

      const result = await res.json();

      if (result.error) {
        ocrError = result.error;
        step = 'review';
      } else {
        // 跳转到分析结果页
        goto(`/analysis/${result.recordId || result.id}`);
      }
    } catch (err) {
      ocrError = '分析请求失败，请重试';
      step = 'review';
    } finally {
      analyzing = false;
    }
  }

  // ---- 返回 ----
  function goBack() {
    step = 'upload';
    ocrResult = null;
    previewUrl = null;
    ocrError = null;
  }

  // ---- LLM 智能提取 ----
  async function runLlmExtract() {
    // 浏览器端 OCR 用 `text`，服务端 OCR 用 `rawText`
    const rawText = ocrResult?.rawText || ocrResult?.text;
    if (!rawText) {
      llmExtractError = '没有可用的 OCR 原始文本。请先进行 OCR 识别。';
      return;
    }

    llmExtracting = true;
    llmExtractError = null;

    try {
      const res = await fetch('/api/ocr/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      });

      const data = await res.json();

      if (data.success && data.items.length > 0) {
        editedItems = data.items.map((it: { name: string; amount: number }) => ({
          name: it.name,
          amount: it.amount,
        }));
        console.log(`[Upload] LLM 提取了 ${data.items.length} 个项目`);
      } else {
        llmExtractError = data.error || 'LLM 未提取到项目';
      }
    } catch (err) {
      llmExtractError = `LLM 提取请求失败: ${String(err)}`;
    } finally {
      llmExtracting = false;
    }
  }

  // ---- 筛选和排序 ----
  /** 带原始索引的显示项 */
  interface DisplayItem {
    name: string;
    amount: number;
    _origIdx: number;
  }

  const filteredItems = $derived.by((): DisplayItem[] => {
    // 为每项保留原始索引
    let items: DisplayItem[] = editedItems.map((it, idx) => ({
      name: it.name,
      amount: it.amount,
      _origIdx: idx,
    }));

    // 过滤：仅显示有名称的费用项
    if (filterMode === 'items_only') {
      items = items.filter(it => it.name.trim().length >= 2);
    }

    // 排序
    if (sortBy === 'name') {
      items.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    } else if (sortBy === 'amount') {
      items.sort((a, b) => (b.amount || 0) - (a.amount || 0));
    }
    // original: 保持原序 (按 _origIdx)

    return items;
  });

  const filteredCount = $derived(editedItems.length - filteredItems.length);

  // ---- 计算 ----
  const totalAmount = $derived(editedItems.reduce((sum, it) => sum + (it.amount || 0), 0));
</script>

<div class="max-w-3xl mx-auto space-y-6">
  <div class="flex items-center gap-3">
    {#if step !== 'upload'}
      <button onclick={goBack} class="btn-ghost text-sm">← 返回</button>
    {/if}
    <h1 class="text-xl font-bold text-warm-900">上传账单</h1>
  </div>
  <div class="card bg-gradient-to-r from-brand-50 to-white border-brand-100 mb-4 px-4 py-3"><div><h3 class="font-semibold text-sm text-brand-800">OCR 智能解读</h3><p class="text-xs text-warm-500 mt-0.5 leading-relaxed">拍照或上传宠物医疗账单，AI 自动识别收费项目并逐项匹配知识库解读，支持保险理赔预检。</p></div></div>

  <!-- 步骤指示器 -->
  <div class="flex items-center gap-2 text-sm">
    <span class="inline-flex items-center gap-1 {step === 'upload' ? 'text-brand-600 font-semibold' : 'text-warm-400'}">
      <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs {step === 'upload' ? 'bg-brand-600 text-white' : step !== 'upload' && step !== 'ocr' ? 'bg-emerald-500 text-white' : 'bg-warm-200 text-warm-500'}">
        {step === 'upload' ? '1' : '✓'}
      </span>
      上传
    </span>
    <span class="text-warm-300">——</span>
    <span class="inline-flex items-center gap-1 {step === 'ocr' ? 'text-brand-600 font-semibold' : step === 'review' || step === 'analyzing' || step === 'result' ? 'text-warm-500' : 'text-warm-300'}">
      <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs {step === 'ocr' ? 'bg-brand-600 text-white' : step === 'review' || step === 'analyzing' || step === 'result' ? 'bg-emerald-500 text-white' : 'bg-warm-200 text-warm-500'}">
        {step === 'ocr' ? '2' : (step === 'review' || step === 'analyzing' || step === 'result') ? '✓' : '2'}
      </span>
      OCR/编辑
    </span>
    <span class="text-warm-300">——</span>
    <span class="inline-flex items-center gap-1 {step === 'analyzing' ? 'text-brand-600 font-semibold' : step === 'result' ? 'text-warm-500' : 'text-warm-300'}">
      <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs {step === 'analyzing' ? 'bg-brand-600 text-white' : step === 'result' ? 'bg-emerald-500 text-white' : 'bg-warm-200 text-warm-500'}">
        3
      </span>
      分析
    </span>
  </div>

  <!-- 错误提示 -->
  {#if ocrError}
    <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
      ⚠️ {ocrError}
    </div>
  {/if}

  <!-- Step 1: 上传 -->
  {#if step === 'upload'}
    <div
      class="card border-2 border-dashed border-warm-300 hover:border-brand-400 transition-colors cursor-pointer"
      class:border-brand-400={dragOver}
      class:bg-brand-50={dragOver}
      ondragover={(e) => { e.preventDefault(); dragOver = true; }}
      ondragleave={() => dragOver = false}
      ondrop={(e) => { e.preventDefault(); handleDrop(e); }}
      onclick={() => document.getElementById('file-input')?.click()}
      onkeydown={() => {}}
      role="button"
      tabindex="0"
    >
      <input
        id="file-input"
        type="file"
        accept="image/*"
        class="hidden"
        onchange={handleInputChange}
      />
      <div class="text-center py-12">
        <div class="text-5xl mb-4">📸</div>
        <h3 class="text-lg font-semibold text-warm-700 mb-2">点击或拖拽上传账单照片</h3>
        <p class="text-sm text-warm-500">支持 JPG、PNG 格式 · 无需注册 · 数据存储在你的设备上</p>
      </div>
    </div>

    <!-- 直接手动输入入口 -->
    <div class="text-center">
      <button
        class="btn-ghost text-sm"
        onclick={() => {
          editedItems = [{ name: '', amount: 0 }, { name: '', amount: 0 }];
          step = 'review';
        }}
      >
        💬 或者直接手动输入账单信息
      </button>
    </div>
  {/if}

  <!-- Step 2: OCR 处理中 -->
  {#if step === 'ocr' && ocrLoading}
    <div class="card text-center py-12">
      <div class="relative w-32 h-48 mx-auto mb-6 bg-warm-100 rounded-lg overflow-hidden">
        {#if previewUrl}
          <img src={previewUrl} alt="预览" class="w-full h-full object-cover opacity-40" />
        {/if}
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="w-20 h-0.5 bg-brand-500 scan-line"></div>
        </div>
      </div>
      <h3 class="font-semibold text-warm-700 mb-1">正在识别账单...</h3>
      <p class="text-sm text-warm-500">使用 {ocrEngine} 提取费用项目</p>
      {#if ocrError}
        <p class="text-xs text-amber-600 mt-2">{ocrError}</p>
      {/if}
    </div>
  {/if}

  <!-- Step 3: 审核/编辑 -->
  {#if step === 'review' || step === 'analyzing'}
    <div class="space-y-6">
      <!-- 图片预览（如果有） -->
      {#if previewUrl}
        <div class="card">
          <img src={previewUrl} alt="账单预览" class="w-full max-h-48 object-contain rounded-lg" />
        </div>
      {/if}

      <!-- 基本信息 -->
      <div class="card grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-xs font-medium text-warm-500 mb-1">医院名称</label>
          <input type="text" class="input-field" bind:value={hospitalName} placeholder="如：XX宠物医院" />
        </div>
        <div>
          <label class="block text-xs font-medium text-warm-500 mb-1">就诊日期</label>
          <input type="date" class="input-field" bind:value={visitDate} />
        </div>
        <div>
          <label class="block text-xs font-medium text-warm-500 mb-1">所在城市</label>
          <select class="input-field" bind:value={city}>
            <option value="北京">北京</option>
            <option value="上海">上海</option>
            <option value="广州">广州</option>
            <option value="深圳">深圳</option>
            <option value="杭州">杭州</option>
            <option value="成都">成都</option>
            <option value="重庆">重庆</option>
            <option value="武汉">武汉</option>
            <option value="南京">南京</option>
            <option value="">其他城市</option>
          </select>
        </div>
      </div>

      <!-- 宠物选择（可选） -->
      <div class="card">
        <label class="block text-xs font-medium text-warm-500 mb-2">关联宠物（可选）</label>
        <div class="flex gap-2 flex-wrap">
          <button
            class="px-3 py-1.5 rounded-lg text-sm border transition-colors
                   {!$selectedPetId ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-warm-200 text-warm-600 hover:border-warm-300'}"
            onclick={() => selectedPetId.set(null)}
          >
            未指定
          </button>
          {#each $pets as pet}
            <button
              class="px-3 py-1.5 rounded-lg text-sm border transition-colors
                     {$selectedPetId === pet.id ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-warm-200 text-warm-600 hover:border-warm-300'}"
              onclick={() => selectedPetId.set(pet.id)}
            >
              {pet.name} ({pet.species})
            </button>
          {/each}
        </div>
      </div>

      <!-- 费用项目编辑表 -->
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-warm-900">
            费用项目
            <span class="text-xs text-warm-400 font-normal ml-2">
              {filteredItems.filter(it => it.name.trim() && it.amount > 0).length} 个有效项目
            </span>
          </h3>
          <button class="btn-ghost text-sm" onclick={addItem}>+ 添加项目</button>
        </div>

        <!-- 筛选工具栏 -->
        <div class="flex items-center gap-3 mb-4 p-3 bg-warm-50 rounded-lg border border-warm-100 flex-wrap">
          <!-- 筛选模式 -->
          <div class="flex items-center gap-1 bg-white rounded-md border border-warm-200 p-0.5">
            <button
              class="px-3 py-1.5 text-xs rounded font-medium transition-colors"
              class:bg-brand-500={filterMode === 'items_only'}
              class:text-white={filterMode === 'items_only'}
              class:text-warm-500={filterMode !== 'items_only'}
              class:hover:text-warm-700={filterMode !== 'items_only'}
              onclick={() => filterMode = 'items_only'}
            >
              ✅ 仅费用项
            </button>
            <button
              class="px-3 py-1.5 text-xs rounded font-medium transition-colors"
              class:bg-brand-500={filterMode === 'all'}
              class:text-white={filterMode === 'all'}
              class:text-warm-500={filterMode !== 'all'}
              class:hover:text-warm-700={filterMode !== 'all'}
              onclick={() => filterMode = 'all'}
            >
              📋 全部行
            </button>
          </div>

          <!-- 排序 -->
          <select
            class="text-xs border border-warm-200 rounded-md px-2 py-1.5 bg-white text-warm-600"
            bind:value={sortBy}
          >
            <option value="original">按原始顺序</option>
            <option value="name">按名称排序</option>
            <option value="amount">按金额排序</option>
          </select>

          <!-- 隐藏项计数 -->
          {#if filteredCount > 0}
            <span class="text-xs text-amber-600">
              ⚠️ 已过滤 {filteredCount} 个噪声行
            </span>
          {/if}

          <!-- LLM 智能提取 -->
          <div class="flex-1"></div>
          {#if ocrResult?.rawText || ocrResult?.text}
            <button
              class="px-3 py-1.5 text-xs rounded-md font-medium transition-colors border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50"
              onclick={runLlmExtract}
              disabled={llmExtracting}
            >
              {llmExtracting ? '🤖 提取中...' : '🤖 AI 智能提取'}
            </button>
          {/if}
        </div>

        <!-- LLM 错误提示 -->
        {#if llmExtractError}
          <div class="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
            {llmExtractError}
          </div>
        {/if}

        <div class="space-y-3">
          {#each filteredItems as item, i}
            <div class="flex items-center gap-3">
              <span class="text-xs text-warm-400 w-6 text-right">{i + 1}</span>
              <input
                type="text"
                class="input-field flex-1"
                placeholder="项目名称，如：血常规"
                value={item.name}
                oninput={(e) => updateItemName(item._origIdx, (e.target as HTMLInputElement).value)}
              />
              <div class="relative w-32">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">¥</span>
                <input
                  type="number"
                  step="0.01"
                  class="input-field pl-7 text-right"
                  placeholder="0.00"
                  value={item.amount || ''}
                  oninput={(e) => updateItemAmount(item._origIdx, (e.target as HTMLInputElement).value)}
                />
              </div>
              <button
                class="btn-ghost text-red-400 hover:text-red-600 text-sm px-2"
                onclick={() => removeItem(item._origIdx)}
                disabled={editedItems.length <= 1}
              >
                ✕
              </button>
            </div>
          {/each}

          <!-- 显示被过滤的行数 -->
          {#if filteredCount > 0}
            <div class="text-center pt-2">
              <button
                class="text-xs text-warm-400 hover:text-warm-600"
                onclick={() => filterMode = 'all'}
              >
                📋 显示全部 {editedItems.length} 行（含 {filteredCount} 个噪声行）
              </button>
            </div>
          {/if}

          {#if filteredItems.length === 0}
            <div class="text-center py-4 text-sm text-warm-400">
              未识别到费用项目。请切换为"全部行"模式查看 OCR 原始结果，或手动添加项目。
            </div>
          {/if}
        </div>

        <!-- 合计 -->
        <div class="flex justify-end items-center gap-4 mt-4 pt-4 border-t border-warm-100">
          <span class="text-sm text-warm-500">合计</span>
          <span class="text-xl font-bold text-warm-900">{formatCurrency(totalAmount)}</span>
        </div>
      </div>

      <!-- 分析按钮 -->
      <div class="flex items-center justify-end gap-3">
        <label class="flex items-center gap-2 text-sm text-warm-600 cursor-pointer">
          <input type="checkbox" bind:checked={useLlm} class="rounded" />
          <span>🤖 AI 增强</span>
          <span class="text-xs text-warm-400">（未知项目用 LLM 推断）</span>
        </label>
        <button class="btn-secondary" onclick={goBack}>取消</button>
        <button
          class="btn-primary text-base px-8"
          onclick={startAnalysis}
          disabled={analyzing || editedItems.filter(it => it.name.trim() && it.amount > 0).length === 0}
        >
          {#if analyzing}
            🔄 分析中...
          {:else}
            🧠 开始解读
          {/if}
        </button>
      </div>
    </div>
  {/if}
</div>
