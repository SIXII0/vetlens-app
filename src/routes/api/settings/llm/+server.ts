import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

const ENV_PATH = path.join(process.cwd(), '.env');

function readEnvVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  if (fs.existsSync(ENV_PATH)) {
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        vars[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
      }
    }
  }
  return vars;
}

function writeEnvVars(vars: Record<string, string>): void {
  const lines: string[] = [];
  if (fs.existsSync(ENV_PATH)) {
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) { lines.push(line); continue; }
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        if (key in vars) { lines.push(`${key}=${vars[key]}`); delete vars[key]; }
        else { lines.push(line); }
      } else { lines.push(line); }
    }
  }
  for (const [key, val] of Object.entries(vars)) {
    lines.push(`${key}=${val}`);
  }
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8');
}

export const GET: RequestHandler = async () => {
  const envVars = readEnvVars();
  return json({
    provider: envVars['LLM_PROVIDER'] || 'none',
    openaiBaseUrl: envVars['OPENAI_BASE_URL'] || '',
    openaiModel: envVars['OPENAI_MODEL'] || '',
    openaiKeySet: !!envVars['OPENAI_API_KEY'],
    anthropicBaseUrl: envVars['ANTHROPIC_BASE_URL'] || '',
    claudeModel: envVars['CLAUDE_MODEL'] || '',
    anthropicKeySet: !!envVars['ANTHROPIC_API_KEY'],
    ollamaBaseUrl: envVars['OLLAMA_BASE_URL'] || '',
    ollamaModel: envVars['OLLAMA_MODEL'] || '',
  });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const vars = readEnvVars();

    if (body.provider !== undefined) vars['LLM_PROVIDER'] = String(body.provider);
    if (body.openaiBaseUrl !== undefined) vars['OPENAI_BASE_URL'] = String(body.openaiBaseUrl);
    if (body.openaiModel !== undefined) vars['OPENAI_MODEL'] = String(body.openaiModel);
    if (body.openaiApiKey !== undefined) vars['OPENAI_API_KEY'] = String(body.openaiApiKey);
    if (body.anthropicBaseUrl !== undefined) vars['ANTHROPIC_BASE_URL'] = String(body.anthropicBaseUrl);
    if (body.claudeModel !== undefined) vars['CLAUDE_MODEL'] = String(body.claudeModel);
    if (body.anthropicApiKey !== undefined) vars['ANTHROPIC_API_KEY'] = String(body.anthropicApiKey);
    if (body.ollamaBaseUrl !== undefined) vars['OLLAMA_BASE_URL'] = String(body.ollamaBaseUrl);
    if (body.ollamaModel !== undefined) vars['OLLAMA_MODEL'] = String(body.ollamaModel);

    writeEnvVars(vars);
    return json({ success: true, message: '设置已保存。请重启服务使配置生效。' });
  } catch (e) {
    return json({ error: '保存失败: ' + (e instanceof Error ? e.message : '') }, { status: 500 });
  }
};
