<script lang="ts">
  import { onMount } from 'svelte';
  import { settings } from '$lib/stores/settings';
  import {
    Settings, MapPin, Brain, Save, Plug, CheckCircle2, XCircle, Info, AlertTriangle, Upload
  } from '@lucide/svelte';

  let llmConfig = $state({
    provider: 'none' as string,
    openaiBaseUrl: '',
    openaiModel: '',
    openaiKeySet: false,
    anthropicBaseUrl: '',
    claudeModel: '',
    anthropicKeySet: false,
    ollamaBaseUrl: '',
    ollamaModel: '',
  });

  let saved = $state(false);
  let saving = $state(false);
  let testing = $state(false);
  let testResult = $state<{ ok: boolean; error?: string } | null>(null);

  let formProvider = $state('none');
  let formBaseUrl = $state('');
  let formApiKey = $state('');
  let formModel = $state('');

  onMount(() => loadConfig());

  async function loadConfig() {
    try {
      const res = await fetch('/api/settings/llm');
      if (res.ok) {
        llmConfig = await res.json();
        formProvider = llmConfig.provider || 'none';
        syncFormFromProvider();
      }
    } catch { /* ignore */ }
  }

  function syncFormFromProvider() {
    if (formProvider === 'openai') {
      formBaseUrl = llmConfig.openaiBaseUrl || 'https://api.deepseek.com';
      formModel = llmConfig.openaiModel || 'deepseek-chat';
    } else if (formProvider === 'claude') {
      formBaseUrl = llmConfig.anthropicBaseUrl || 'https://api.anthropic.com';
      formModel = llmConfig.claudeModel || 'claude-sonnet-4-20250514';
    } else if (formProvider === 'ollama') {
      formBaseUrl = llmConfig.ollamaBaseUrl || 'http://localhost:11434';
      formModel = llmConfig.ollamaModel || 'llama3';
    }
    formApiKey = '';
    testResult = null;
  }

  function updateSetting<K extends keyof typeof $settings>(key: K, value: (typeof $settings)[K]) {
    settings.update(s => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    saving = true; saved = false;
    try {
      const body: Record<string, string> = { provider: formProvider };
      if (formProvider === 'openai') { body.openaiBaseUrl = formBaseUrl; body.openaiModel = formModel; if (formApiKey) body.openaiApiKey = formApiKey; }
      else if (formProvider === 'claude') { body.anthropicBaseUrl = formBaseUrl; body.claudeModel = formModel; if (formApiKey) body.anthropicApiKey = formApiKey; }
      else if (formProvider === 'ollama') { body.ollamaBaseUrl = formBaseUrl; body.ollamaModel = formModel; }

      const res = await fetch('/api/settings/llm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { saved = true; await loadConfig(); }
    } catch { /* ignore */ }
    saving = false;
  }

  async function handleTest() {
    testing = true; testResult = null;
    try {
      const res = await fetch('/api/settings/llm/test', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: formBaseUrl.replace(/\/+$/, ''), apiKey: formApiKey || '', model: formModel, provider: formProvider }) });
      testResult = await res.json();
    } catch (e) { testResult = { ok: false, error: e instanceof Error ? e.message : '连接失败' }; }
    testing = false;
  }

  function hasKeyForProvider(): boolean {
    if (formProvider === 'openai') return llmConfig.openaiKeySet;
    if (formProvider === 'claude') return llmConfig.anthropicKeySet;
    return false;
  }
</script>

<div class="max-w-3xl mx-auto space-y-6">
  <h1 class="text-xl font-bold text-warm-900 flex items-center gap-2">
    <Settings size={20} class="text-brand-500" />设置
  </h1>

  <!-- 基本设置 -->
  <div class="card">
    <h3 class="font-semibold text-warm-900 mb-4 flex items-center gap-2">
      <MapPin size={16} class="text-warm-500" />基本设置
    </h3>
    <div>
      <label for="settings-default-city" class="block text-sm font-medium text-warm-700 mb-1">默认城市</label>
      <select id="settings-default-city" class="input-field w-48" value={$settings.defaultCity}
        onchange={(e) => updateSetting('defaultCity', (e.target as HTMLSelectElement).value)}>
        <option value="北京">北京</option><option value="上海">上海</option><option value="广州">广州</option>
        <option value="深圳">深圳</option><option value="杭州">杭州</option><option value="成都">成都</option>
        <option value="重庆">重庆</option><option value="武汉">武汉</option><option value="">其他</option>
      </select>
      <p class="text-xs text-warm-500 mt-1">用于价格评估时的城市基准</p>
    </div>
  </div>

  <!-- LLM 配置 -->
  <div class="card">
    <h3 class="font-semibold text-warm-900 mb-4 flex items-center gap-2">
      <Brain size={16} class="text-warm-500" />AI 模型配置
    </h3>
    <p class="text-xs text-warm-500 mb-4">配置后，账单分析和聊天助手将使用 AI 模型回答。API Key 仅保存在服务端 .env 文件。</p>

    <div class="space-y-4">
      <div>
        <label for="settings-provider" class="block text-sm font-medium text-warm-700 mb-1">提供商</label>
        <select id="settings-provider" class="input-field w-56" bind:value={formProvider} onchange={() => syncFormFromProvider()}>
          <option value="none">不使用（关闭 AI）</option>
          <option value="openai">OpenAI 兼容（DeepSeek / 豆包 / 本地 LLM）</option>
          <option value="claude">Claude API（Anthropic）</option>
          <option value="ollama">Ollama（本地模型）</option>
        </select>
      </div>

      {#if formProvider !== 'none'}
        <div>
          <label for="settings-base-url" class="block text-sm font-medium text-warm-700 mb-1">
            {formProvider === 'ollama' ? 'Ollama 地址' : 'API Base URL'}
          </label>
          <input id="settings-base-url" type="text" class="input-field" bind:value={formBaseUrl}
            placeholder={formProvider === 'openai' ? 'https://api.deepseek.com' : formProvider === 'claude' ? 'https://api.anthropic.com' : 'http://localhost:11434'} />
        </div>

        <div>
          <label for="settings-model" class="block text-sm font-medium text-warm-700 mb-1">模型名称</label>
          <input id="settings-model" type="text" class="input-field" bind:value={formModel}
            placeholder={formProvider === 'openai' ? 'deepseek-chat' : formProvider === 'claude' ? 'claude-sonnet-4-20250514' : 'llama3'} />
        </div>

        <div>
          <label for="settings-api-key" class="block text-sm font-medium text-warm-700 mb-1">
            API Key {#if hasKeyForProvider()}<span class="text-emerald-600 text-xs ml-1">（已保存）</span>{/if}
          </label>
          <input id="settings-api-key" type="password" class="input-field" bind:value={formApiKey}
            placeholder={hasKeyForProvider() ? '已保存，留空不修改' : '输入 API Key'} />
        </div>

        <div class="flex gap-3 pt-2">
          <button class="btn-primary inline-flex items-center gap-2" onclick={handleSave} disabled={saving}>
            <Save size={16} />{saving ? '保存中...' : '保存配置'}
          </button>
          <button class="btn-secondary inline-flex items-center gap-2" onclick={handleTest} disabled={testing}>
            <Plug size={16} />{testing ? '测试中...' : '测试连接'}
          </button>
        </div>

        {#if saved}
          <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 size={16} />配置已保存。需要重启服务才能生效。
          </div>
        {/if}
        {#if testResult}
          <div class="p-3 rounded-lg text-sm {testResult.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-600'} flex items-center gap-2">
            {#if testResult.ok}
              <CheckCircle2 size={16} />连接成功！模型响应正常。
            {:else}
              <XCircle size={16} />连接失败: {testResult.error}
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  </div>

  <!-- 数据贡献 -->
  <div class="card">
    <h3 class="font-semibold text-warm-900 mb-4 flex items-center gap-2">
      <Upload size={16} class="text-warm-500" />数据贡献
    </h3>
    <div class="flex items-center justify-between">
      <div>
        <div class="text-sm font-medium text-warm-700">自动上传未知项目</div>
        <div class="text-xs text-warm-500">
          遇到知识库未收录的收费项目时，静默上传项目名称和金额（不上传任何个人信息、宠物信息、账单照片）
        </div>
      </div>
      <button
        class="relative w-11 h-6 rounded-full transition-colors { $settings.autoUploadUnknown ? 'bg-brand-600' : 'bg-warm-300' }"
        onclick={() => updateSetting('autoUploadUnknown', !$settings.autoUploadUnknown)}
        role="switch"
        aria-checked={$settings.autoUploadUnknown}
      >
        <span class="block w-5 h-5 bg-white rounded-full shadow transition-transform { $settings.autoUploadUnknown ? 'translate-x-5' : 'translate-x-0.5' }"></span>
      </button>
    </div>
    <div class="mt-4 p-3 bg-warm-50 rounded-lg text-xs text-warm-500">
      <p class="font-medium mb-1">✅ 上传内容：项目名称、收费金额、所在城市（可选）</p>
      <p>❌ 不上传：个人信息、宠物品种/年龄、医院名称/地址、账单照片原文</p>
    </div>
  </div>

  <!-- 关于 -->
  <div class="card">
    <h3 class="font-semibold text-warm-900 mb-4 flex items-center gap-2">
      <Info size={16} class="text-warm-500" />关于 VetLens
    </h3>
    <div class="text-sm text-warm-600 space-y-2">
      <p><strong>版本</strong>: v0.1.0</p>
      <p><strong>定位</strong>: 站在宠物主这一方的医疗账单解读工具</p>
      <p><strong>原则</strong>:</p>
      <ul class="list-disc list-inside text-xs text-warm-500 space-y-1 ml-2">
        <li>不隐藏信息——价格偏高或理赔风险永远标注</li>
        <li>不限定推荐——排序基于算法，不由商业合作决定</li>
        <li>不混淆身份——永远标注"站在宠物主这一方"</li>
        <li>核心逻辑不依赖 LLM——离线可用</li>
      </ul>
      <p class="text-xs text-warm-500 mt-3 flex items-start gap-1.5">
        <AlertTriangle size={14} class="text-amber-500 flex-shrink-0 mt-0.5" />
        <span>以上解读基于 VetLens 知识库和 AI 推理，仅供参考，不构成医疗或消费建议。</span>
      </p>
    </div>
  </div>
</div>
