/**
 * Agent 管线 —— 调用 Claude API 执行 pet-vault-skill 的 13 个 Agent 编排
 *
 * 使用 skill 内置的 agent prompts 进行多阶段报告生成：
 *   1. Orchestrator → 规划报告类型
 *   2. Bill Analysis + Material Organizer → 结构化分析
 *   3. Report Composer → 生成 Markdown 报告
 *   4. LaTeX Renderer (Python bridge) → PDF
 *
 * 触发方式：
 *   - 前端点击 "📄 下载 PDF" → POST /api/report/pdf
 *   - API 检测到 LLM 可用时，优先走 Agent 管线
 */
import { getLlmAdapter } from '../llm/index';
import fs from 'fs';
import path from 'path';

const SKILL_DIR = path.join(process.cwd(), '.claude', 'skills', 'pet-vault-skill');
const PROMPTS_DIR = path.join(SKILL_DIR, 'prompts');

/** 读取 agent prompt */
function loadPrompt(name: string): string {
  const p = path.join(PROMPTS_DIR, name);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
  return '';
}

export interface AgentInput {
  petName: string;
  hospitalName?: string;
  visitDate?: string;
  visitReason?: string;
  diagnosis?: string;
  city?: string;
  totalAmount: number;
  items: Array<{
    name: string;
    amount: number;
    category?: string;
    explanation?: string;
    necessity?: string;
    priceLevel?: string;
  }>;
  petInfo?: {
    species?: string;
    breed?: string;
    gender?: string;
    birthDate?: string;
    weightKg?: number;
  };
  requestText?: string;
}

export interface AgentResult {
  success: boolean;
  reportMarkdown: string;
  reportType: string;
  agentUsed: boolean;
  tokensUsed?: number;
  error?: string;
}

/**
 * 执行 Agent 管线生成报告
 *
 * 流程：
 *   1. Orchestrator agent 选择合适的报告类型
 *   2. Bill Analysis agent 对账单项目进行分类和解释
 *   3. Report Composer agent 生成结构化 Markdown
 */
export async function runAgentPipeline(input: AgentInput): Promise<AgentResult> {
  const llm = getLlmAdapter();
  if (!llm) {
    return { success: false, reportMarkdown: '', reportType: 'bill_explain', agentUsed: false,
      error: 'LLM 适配器未配置。请在 .env 中设置 LLM_PROVIDER=claude 和 ANTHROPIC_API_KEY。' };
  }

  const available = await llm.isAvailable().catch(() => false);
  if (!available) {
    return { success: false, reportMarkdown: '', reportType: 'bill_explain', agentUsed: false,
      error: 'Claude API 不可用。请检查 ANTHROPIC_API_KEY 和网络连接。' };
  }

  try {
    const isClaude = llm.name === 'claude';

    if (isClaude) {
      // ── Claude: 两阶段 Agent 编排 ──
      const stage1Prompt = buildStage1Prompt(input);
      const stage1System = [
        loadPrompt('orchestrator_agent.md'),
        loadPrompt('bill_analysis_agent.md'),
        loadPrompt('material_organizer_agent.md'),
      ].filter(Boolean).join('\n\n---\n\n');

      console.log('[AgentPipeline] Stage 1: Orchestrator + Bill Analysis (Claude)...');
      const stage1Response = await llm.chat(stage1Prompt, stage1System);

      const stage2Prompt = buildStage2Prompt(input, stage1Response);
      const stage2System = [
        loadPrompt('report_composer_agent.md'),
        loadPrompt('quality_inspector_agent.md'),
      ].filter(Boolean).join('\n\n---\n\n');

      console.log('[AgentPipeline] Stage 2: Report Composer (Claude)...');
      var reportMarkdown = await llm.chat(stage2Prompt, stage2System);
    } else {
      // ── DeepSeek / OpenAI: 单阶段直接生成 ──
      const prompt = buildSingleStagePrompt(input);
      const system = [
        loadPrompt('report_composer_agent.md'),
        loadPrompt('bill_analysis_agent.md'),
      ].filter(Boolean).join('\n\n---\n\n');

      console.log(`[AgentPipeline] 单阶段生成 (${llm.name})...`);
      var reportMarkdown = await llm.chat(prompt, system);
    }

    if (!reportMarkdown || reportMarkdown.trim().length < 50) {
      return { success: false, reportMarkdown: '', reportType: 'bill_explain', agentUsed: true,
        error: 'Agent 生成的报告内容过短，可能 API 返回异常。' };
    }

    console.log(`[AgentPipeline] 报告生成完成 (${reportMarkdown.length} 字符)`);
    return {
      success: true,
      reportMarkdown: reportMarkdown.replace(/^```(?:markdown)?\s*|```$/g, '').trim(),
      reportType: input.requestText?.includes('保险') ? 'claim_check' : 'bill_explain',
      agentUsed: true,
    };
  } catch (err) {
    console.error('[AgentPipeline] 执行失败:', err);
    return {
      success: false, reportMarkdown: '', reportType: 'bill_explain', agentUsed: true,
      error: `Agent 管线异常: ${err instanceof Error ? err.message : '未知错误'}`,
    };
  }
}

/** 检查 Agent 管线是否可用（任何 LLM 均可） */
export function isAgentPipelineAvailable(): boolean {
  const llm = getLlmAdapter();
  return !!llm;
}

// ── Prompt builders ──

function buildStage1Prompt(input: AgentInput): string {
  const items = input.items.map((it, i) =>
    `${i + 1}. ${it.name} — ¥${it.amount.toFixed(2)}` +
    `${it.category ? ` [${it.category}]` : ''}` +
    `${it.priceLevel ? ` 价格${it.priceLevel}` : ''}`
  ).join('\n');

  const petInfo = input.petInfo;
  const petProfile = petInfo
    ? `种类: ${petInfo.species || '未知'} / 品种: ${petInfo.breed || '未知'} / 性别: ${petInfo.gender || '未知'} / 出生: ${petInfo.birthDate || '未知'} / 体重: ${petInfo.weightKg ? petInfo.weightKg + 'kg' : '未知'}`
    : '宠物档案未提供';

  return `请对以下宠物医疗账单进行分析：

## 基本信息
- 宠物: ${input.petName}
- ${petProfile}
- 医院: ${input.hospitalName || '未提供'}
- 日期: ${input.visitDate || '未提供'}
- 城市: ${input.city || '未提供'}
${input.visitReason ? `- 就诊原因: ${input.visitReason}` : ''}
${input.diagnosis ? `- 诊断: ${input.diagnosis}` : ''}
- 总费用: ¥${input.totalAmount.toFixed(2)}（${input.items.length} 项）

## 费用项目
${items}

## 任务
1. 将每个项目归类到: 检查 / 药品 / 治疗 / 耗材 / 服务 / 其他
2. 标记高值项目（超过 ¥200 或超过平均值的 2 倍）
3. 对每个项目提供通俗解释（1-2 句话）
4. 评估每个项目的必要性倾向: 必做 / 建议做 / 可选 / 待确认
5. 识别可能新增或非标准的收费项目

请以结构化 JSON 格式回复（不要 markdown 代码块），包含:
{
  "categories": { "检查": [...], "药品": [...], ... },
  "highValueItems": [...],
  "itemDetails": [{"name": "...", "category": "...", "explanation": "...", "necessity": "...", "isStandard": true/false}],
  "summary": "整体评估（2-3 句话，中文）"
}`;
}

function buildStage2Prompt(input: AgentInput, stage1Result: string): string {
  const petInfo = input.petInfo;
  const petProfile = petInfo
    ? `${petInfo.species || '未知'} / ${petInfo.breed || '未知'} / ${petInfo.gender || '未知'} / 出生: ${petInfo.birthDate || '未知'} / ${petInfo.weightKg ? petInfo.weightKg + 'kg' : '未知'}`
    : '';

  return `请根据以下分析结果，撰写一份宠物医疗账单解释报告（Markdown 格式）。

## 报告基本信息
- 宠物名称: ${input.petName}
${petProfile ? `- 宠物档案: ${petProfile}` : ''}
- 就诊医院: ${input.hospitalName || '未提供'}
- 就诊日期: ${input.visitDate || '未提供'}
${input.visitReason ? `- 就诊原因: ${input.visitReason}` : ''}
${input.diagnosis ? `- 诊断: ${input.diagnosis}` : ''}
- 总费用: ¥${input.totalAmount.toFixed(2)}

## Stage 1 分析结果
${stage1Result}

## 报告要求
1. 必须以 "# 宠物医疗账单解释报告" 开头
2. 必须包含以下章节（使用 ## 标题）：
   - ## 使用材料（列出分析所依据的数据来源）
   - ## 事实（只陈述从材料中直接提取的信息，不加解读）
   - ## 整理结果（先给概要结论，再给分类详情和逐项解释）
   - ## 待确认（列出所有不确定项）
   - ## 后续建议（3-5 条具体行动建议）
3. 结尾添加 > ⚠️ 医疗免责声明（不替代兽医诊断）
4. 用中文撰写
5. 报告正文中不要出现 JSON、agent、pipeline 等技术术语
6. 直接输出报告 Markdown，不要用代码块包裹`;
}

/** DeepSeek / OpenAI 兼容：单阶段直接生成报告 */
function buildSingleStagePrompt(input: AgentInput): string {
  const items = input.items.map((it, i) =>
    `${i + 1}. ${it.name} — ¥${it.amount.toFixed(2)}` +
    `${it.category ? ` [类别: ${it.category}]` : ''}` +
    `${it.explanation ? ` (${it.explanation})` : ''}`
  ).join('\n');

  const petInfo = input.petInfo;
  const petLines: string[] = [];
  if (petInfo?.species) petLines.push(`- 种类: ${petInfo.species}`);
  if (petInfo?.breed) petLines.push(`- 品种: ${petInfo.breed}`);
  if (petInfo?.gender) petLines.push(`- 性别: ${petInfo.gender}`);
  if (petInfo?.birthDate) petLines.push(`- 出生日期: ${petInfo.birthDate}`);
  if (petInfo?.weightKg) petLines.push(`- 体重: ${petInfo.weightKg} kg`);

  return `你是一位宠物医疗账单解读专家。请根据以下信息，撰写一份宠物医疗账单解释报告。

## 基本信息
- 宠物名称: ${input.petName}
${petLines.join('\n') || '(宠物档案未提供)'}
- 就诊医院: ${input.hospitalName || '未提供'}
- 就诊日期: ${input.visitDate || '未提供'}
- 所在城市: ${input.city || '未提供'}
${input.visitReason ? `- 就诊原因: ${input.visitReason}` : ''}
${input.diagnosis ? `- 诊断结果: ${input.diagnosis}` : ''}
- 总费用: ¥${input.totalAmount.toFixed(2)}（${input.items.length} 项）

## 费用项目明细
${items}

## 报告写作要求

### 必须以 "# 宠物医疗账单解释报告" 开头

### 必须包含以下章节（## 标题）:

## 使用材料
列出分析依据: 就诊记录数据、知识库匹配结果

## 事实
逐项列出可直接提取的信息: 日期、医院、宠物信息、每个项目名称和金额（不加工不解读）

## 整理结果
包含三个子章节(###):
### 概要 — 2-3句话总结整体情况
### 费用分类 — 按 检查/药品/治疗/耗材/服务/其他 分组，每组列项目和金额小计
### 逐项解释 — 每个项目1-2句通俗解释，说明是什么、为什么可能要做

## 待确认
列出不确定项: 未识别项目、缺失的诊断结果、价格异常项等

## 后续建议
3-5条具体行动建议

### 格式要求:
- 用中文撰写，客观专业但通俗易懂
- 报告末尾: > ⚠️ 医疗免责声明：本报告旨在整理和解释医疗资料，不替代兽医诊断。如有健康疑虑，请咨询执业兽医。
- 不要出现 JSON、API、agent 等术语
- 不要用代码块包裹`;
}
