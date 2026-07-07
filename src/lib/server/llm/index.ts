/**
 * LLM 适配器抽象层
 *
 * 支持多种 LLM 后端：
 * - DeepSeek (OpenAI 兼容) — 当前启用
 * - Claude API（需 API Key）
 * - Ollama 本地部署（无需网络）
 * - OpenAI 兼容接口
 *
 * 环境变量（在 .env 中配置）：
 *   LLM_PROVIDER=openai|claude|ollama|none
 *   OPENAI_API_KEY=sk-xxx
 *   OPENAI_BASE_URL=https://api.deepseek.com
 *   OPENAI_MODEL=deepseek-chat
 */
import { env } from '$env/dynamic/private';

export interface LlmAdapter {
  name: string;
  chat(prompt: string, systemPrompt?: string): Promise<string>;
  isAvailable(): Promise<boolean>;
}

export type LlmProvider = 'claude' | 'ollama' | 'openai' | 'none';

let _adapter: LlmAdapter | null = null;

/** 获取当前 LLM 适配器 */
export function getLlmAdapter(provider?: LlmProvider): LlmAdapter | null {
  if (provider === 'none') return null;

  if (!_adapter) {
    const prov = provider || (env.LLM_PROVIDER as LlmProvider) || 'none';
    console.log(`[LLM] Provider: ${prov}`);

    switch (prov) {
      case 'claude':
        _adapter = createClaudeAdapter();
        break;
      case 'ollama':
        _adapter = createOllamaAdapter();
        break;
      case 'openai':
        _adapter = createOpenAiAdapter();
        break;
      default:
        console.log('[LLM] No provider configured, LLM disabled');
        return null;
    }
  }

  return _adapter;
}

export function setLlmAdapter(adapter: LlmAdapter | null): void {
  _adapter = adapter;
}

/** OpenAI 兼容适配器 (DeepSeek / OpenAI / 其他) */
function createOpenAiAdapter(): LlmAdapter {
  const apiKey = env.OPENAI_API_KEY || '';
  const baseUrl = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = env.OPENAI_MODEL || 'deepseek-chat';

  console.log(`[LLM] OpenAI adapter: ${baseUrl} (model: ${model})`);

  return {
    name: 'openai',
    async chat(prompt: string, systemPrompt?: string): Promise<string> {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt || '你是 VetLens 的宠物医疗知识助手。用简洁的中文回答。' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 1024,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`API error ${response.status}: ${errText}`);
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content || '';
    },
    async isAvailable(): Promise<boolean> {
      return !!apiKey;
    }
  };
}

/** Claude API 适配器 */
function createClaudeAdapter(): LlmAdapter {
  const apiKey = env.ANTHROPIC_API_KEY || '';
  const baseUrl = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

  return {
    name: 'claude',
    async chat(prompt: string, systemPrompt?: string): Promise<string> {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: systemPrompt || '你是 VetLens 的宠物医疗知识助手。用简洁的中文回答。',
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
      const data = await response.json() as { content: Array<{ text: string }> };
      return data.content[0]?.text || '';
    },
    async isAvailable(): Promise<boolean> {
      return !!apiKey;
    }
  };
}

/** Ollama 本地适配器 */
function createOllamaAdapter(): LlmAdapter {
  const baseUrl = env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = env.OLLAMA_MODEL || 'llama3';

  return {
    name: 'ollama',
    async chat(prompt: string, systemPrompt?: string): Promise<string> {
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: fullPrompt, stream: false, options: { num_predict: 1024 } })
      });

      if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);
      const data = await response.json() as { response: string };
      return data.response || '';
    },
    async isAvailable(): Promise<boolean> {
      try {
        const res = await fetch(`${baseUrl}/api/tags`);
        return res.ok;
      } catch { return false; }
    }
  };
}
