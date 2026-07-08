/**
 * LLM 适配器抽象层
 *
 * 支持多种 LLM 后端：
 * - Claude Code CLI (本地 Claude) — 当前默认
 * - Claude API（Anthropic 兼容，支持本地端点）
 * - DeepSeek (OpenAI 兼容)
 * - Ollama 本地部署
 *
 * 环境变量（在 .env 中配置）：
 *   LLM_PROVIDER=claude-code|claude|openai|ollama|none
 *
 *   # Claude Code CLI（本地 claude 命令）
 *   CLAUDE_CLI_PATH=/path/to/claude    # 可选，自动搜索 PATH
 *
 *   # Claude HTTP API
 *   ANTHROPIC_API_KEY=sk-ant-xxx       # 本地端点可留空
 *   ANTHROPIC_BASE_URL=https://api.anthropic.com  # 或 http://localhost:8080
 *   CLAUDE_MODEL=claude-sonnet-4-20250514
 *
 *   # OpenAI 兼容
 *   OPENAI_API_KEY=sk-xxx
 *   OPENAI_BASE_URL=https://api.deepseek.com
 *   OPENAI_MODEL=deepseek-chat
 *
 *   # Ollama
 *   OLLAMA_BASE_URL=http://localhost:11434
 *   OLLAMA_MODEL=llama3
 */
import { env } from '$env/dynamic/private';
import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuid } from 'uuid';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export interface LlmAdapter {
  name: string;
  chat(prompt: string, systemPrompt?: string): Promise<string>;
  isAvailable(): Promise<boolean>;
}

export type LlmProvider = 'claude' | 'claude-code' | 'ollama' | 'openai' | 'none';

let _adapter: LlmAdapter | null = null;

/** 获取当前 LLM 适配器 */
export function getLlmAdapter(provider?: LlmProvider): LlmAdapter | null {
  if (provider === 'none') return null;

  if (!_adapter) {
    const prov = provider || (env.LLM_PROVIDER as LlmProvider) || 'none';
    console.log(`[LLM] Provider: ${prov}`);

    switch (prov) {
      case 'claude-code':
        _adapter = createClaudeCodeAdapter();
        break;
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

// ─── 工具函数 ────────────────────────────────────────────

/** 判断 URL 是否指向本地主机 */
function isLocalhost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  } catch {
    return false;
  }
}

/** 在 PATH 中搜索可执行文件 */
function findOnPath(name: string): string | null {
  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
    : [''];
  for (const dir of pathDirs) {
    for (const ext of exts) {
      const p = path.join(dir, name + ext.toLowerCase());
      try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
      // Windows 上 ext 可能已包含大小写
      const p2 = path.join(dir, name + ext);
      try { if (p2 !== p && fs.existsSync(p2)) return p2; } catch { /* skip */ }
    }
  }
  return null;
}

// ─── Claude Code CLI 适配器 ──────────────────────────────

function createClaudeCodeAdapter(): LlmAdapter {
  // 优先使用环境变量指定的路径，否则搜索 PATH
  const cliPath = env.CLAUDE_CLI_PATH
    ? (fs.existsSync(env.CLAUDE_CLI_PATH) ? env.CLAUDE_CLI_PATH : null)
    : (findOnPath('claude') || findOnPath('claude.exe'));

  if (cliPath) {
    console.log(`[LLM] Claude CLI found: ${cliPath}`);
  } else {
    console.log('[LLM] Claude CLI not found on PATH');
  }

  return {
    name: 'claude-code',

    async chat(prompt: string, systemPrompt?: string): Promise<string> {
      if (!cliPath) throw new Error('Claude CLI not available');

      // 构建完整 prompt（system prompt 前置）
      const fullPrompt = systemPrompt
        ? `${systemPrompt}\n\n---\n\n## 用户请求\n\n${prompt}`
        : prompt;

      // 将 prompt 写入临时文件（绕过 Windows 命令行长度限制）
      const tmpFile = path.join(os.tmpdir(), `vetlens-claude-${uuid()}.md`);
      fs.writeFileSync(tmpFile, fullPrompt, 'utf-8');

      try {
        // 使用 shell 重定向 stdin，避免命令行参数长度限制
        const cmd = process.platform === 'win32'
          ? `type "${tmpFile}" | "${cliPath}" --print --max-turns 1`
          : `"${cliPath}" --print --max-turns 1 < "${tmpFile}"`;

        console.log(`[LLM] Claude CLI executing (prompt: ${fullPrompt.length} chars)...`);
        const { stdout, stderr } = await execAsync(cmd, {
          timeout: 180_000,          // 3 分钟超时
          maxBuffer: 4 * 1024 * 1024, // 4MB 输出缓冲
          encoding: 'utf-8',
        });

        if (stderr) console.log(`[LLM] Claude CLI stderr: ${stderr.slice(0, 200)}`);

        // 清理：移除可能的 markdown 代码块包裹和空行
        let result = stdout
          .replace(/```(?:markdown|md)?\s*\n?/g, '')
          .replace(/```\s*$/g, '')
          .trim();

        console.log(`[LLM] Claude CLI response: ${result.length} chars`);
        return result;
      } finally {
        // 清理临时文件
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
      }
    },

    async isAvailable(): Promise<boolean> {
      if (!cliPath) return false;
      try {
        await execFileAsync(cliPath, ['--version'], { timeout: 10_000 });
        return true;
      } catch {
        return false;
      }
    }
  };
}

// ─── Claude HTTP API 适配器 ──────────────────────────────

function createClaudeAdapter(): LlmAdapter {
  const apiKey = env.ANTHROPIC_API_KEY || '';
  const baseUrl = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const model = env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  const local = isLocalhost(baseUrl);

  console.log(`[LLM] Claude adapter: ${baseUrl} (model: ${model}, local: ${local})`);

  return {
    name: 'claude',

    async chat(prompt: string, systemPrompt?: string): Promise<string> {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      };
      // 本地端点不发送 API key（如果为空）
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }

      const body: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      };
      if (systemPrompt) {
        body.system = systemPrompt;
      }

      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Claude API error ${response.status}: ${errText.slice(0, 500)}`);
      }

      const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
      };

      // Claude API 返回 content 数组（可能有多个 text block）
      return data.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
    },

    async isAvailable(): Promise<boolean> {
      // 本地端点允许无 API key
      if (apiKey) return true;
      if (local) return true;
      return false;
    }
  };
}

// ─── OpenAI 兼容适配器 ───────────────────────────────────

function createOpenAiAdapter(): LlmAdapter {
  const apiKey = env.OPENAI_API_KEY || '';
  const baseUrl = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = env.OPENAI_MODEL || 'deepseek-chat';
  const local = isLocalhost(baseUrl);

  console.log(`[LLM] OpenAI adapter: ${baseUrl} (model: ${model}, local: ${local})`);

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
          max_tokens: 4096,
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
      if (apiKey) return true;
      if (local) return true;
      return false;
    }
  };
}

// ─── Ollama 本地适配器 ───────────────────────────────────

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
        body: JSON.stringify({ model, prompt: fullPrompt, stream: false, options: { num_predict: 4096 } })
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
