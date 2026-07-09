<script lang="ts">
  import { settings } from '$lib/stores/settings';

  function updateSetting<K extends keyof typeof $settings>(key: K, value: (typeof $settings)[K]) {
    settings.update(s => ({ ...s, [key]: value }));
  }
</script>

<div class="max-w-3xl mx-auto space-y-6">
  <h1 class="text-xl font-bold text-warm-900">⚙️ 设置</h1>

  <!-- 基本设置 -->
  <div class="card">
    <h3 class="font-semibold text-warm-900 mb-4">📍 基本设置</h3>
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-warm-700 mb-1">默认城市</label>
        <select
          class="input-field w-48"
          value={$settings.defaultCity}
          onchange={(e) => updateSetting('defaultCity', (e.target as HTMLSelectElement).value)}
        >
          <option value="北京">北京</option>
          <option value="上海">上海</option>
          <option value="广州">广州</option>
          <option value="深圳">深圳</option>
          <option value="杭州">杭州</option>
          <option value="成都">成都</option>
          <option value="重庆">重庆</option>
          <option value="武汉">武汉</option>
          <option value="">其他</option>
        </select>
        <p class="text-xs text-warm-400 mt-1">用于价格评估时的城市基准</p>
      </div>
    </div>
  </div>

  <!-- LLM 设置 -->
  <div class="card">
    <h3 class="font-semibold text-warm-900 mb-4">🧠 AI 增强（可选）</h3>
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-warm-700">AI 增强解释</div>
          <div class="text-xs text-warm-400">使用 LLM 对未知项目进行推断解释（需要网络或本地部署）</div>
        </div>
        <button
          class="relative w-11 h-6 rounded-full transition-colors { $settings.llmEnhanceEnabled ? 'bg-brand-600' : 'bg-warm-300' }"
          onclick={() => updateSetting('llmEnhanceEnabled', !$settings.llmEnhanceEnabled)}
          role="switch"
          aria-checked={$settings.llmEnhanceEnabled}
        >
          <span class="block w-5 h-5 bg-white rounded-full shadow transition-transform { $settings.llmEnhanceEnabled ? 'translate-x-5' : 'translate-x-0.5' }"></span>
        </button>
      </div>

      {#if $settings.llmEnhanceEnabled}
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1">LLM 提供商</label>
          <select
            class="input-field w-48"
            value={$settings.llmProvider}
            onchange={(e) => updateSetting('llmProvider', (e.target as HTMLSelectElement).value as any)}
          >
            <option value="none">不使用</option>
            <option value="ollama">Ollama（本地）</option>
            <option value="claude">Claude API</option>
            <option value="openai">OpenAI 兼容</option>
          </select>
        </div>
      {/if}
    </div>
  </div>

  <!-- 数据共享 -->
  <div class="card">
    <h3 class="font-semibold text-warm-900 mb-4">📤 数据贡献</h3>
    <div class="flex items-center justify-between">
      <div>
        <div class="text-sm font-medium text-warm-700">自动上传未知项目</div>
        <div class="text-xs text-warm-400">
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
    <h3 class="font-semibold text-warm-900 mb-4">ℹ️ 关于 VetLens</h3>
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
      <p class="text-xs text-warm-400 mt-3">
        ⚠️ 以上解读基于 VetLens 知识库和 AI 推理，仅供参考，不构成医疗或消费建议。
      </p>
    </div>
  </div>
</div>
