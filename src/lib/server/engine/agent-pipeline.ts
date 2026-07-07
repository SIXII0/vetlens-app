/**
 * Agent 管线 — 将 pet-vault-skill v0.2.0 全部 13 个 agent 知识打包进 DeepSeek system prompt
 *
 * 架构:
 *   前端 "下载 PDF" → runAgentPipeline() → DeepSeek 学完全部 skill → 生成报告 Markdown
 *   → skill_bridge.py (--markdown) → LaTeX 模板 → XeLaTeX → PDF
 */
import { getLlmAdapter } from '../llm/index';
import fs from 'fs';
import path from 'path';

const SKILL = path.join(process.cwd(), '.claude', 'skills', 'pet-vault-skill');
const read = (f: string) => { const p = path.join(SKILL, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''; };

function buildSystemPrompt(): string {
  return `# PetVault Skill — 完整 Agent 知识体系

## 编排规则 (Orchestrator)
${read('prompts/orchestrator_agent.md')}

## 材料整理 (Material Organizer)
${read('prompts/material_organizer_agent.md')}

## 账单分析 (Bill Analysis)
${read('prompts/bill_analysis_agent.md')}

## 时间线 (Appointment Timeline)
${read('prompts/appointment_timeline_agent.md')}

## 保险检查 (Insurance Check)
${read('prompts/insurance_check_agent.md')}

## 慢病复查 (Chronic Care Review)
${read('prompts/chronic_care_review_agent.md')}

## 报告组合 (Report Composer)
${read('prompts/report_composer_agent.md')}

## 质量检查 (Quality Inspector)
${read('prompts/quality_inspector_agent.md')}

## LaTeX 渲染 (LaTeX Renderer)
${read('prompts/latex_renderer_agent.md')}

## 安全边界 (CRITICAL — 必须严格遵守)
- 不替代兽医诊断: 报告整理和解释医疗资料，不给出治疗决策
- 不判断医院是否乱收费: 解释费用类别和参考价格，不评价定价公平性
- 不承诺保险理赔: 检查材料完整性和风险点，不保证赔付结果
- 不凭空补写信息: 诊断/治疗方案仅在材料明确出现时才引用
- 不确定信息标注"待确认"

## 报告格式标准 (Report Composer 输出规范)

### 必须包含的 5 个核心章节:
1. ## 使用材料 — 来源文件列表（文件名、类型、日期、置信度）
2. ## 事实 — 只陈述可直接提取的信息，不加解读
3. ## 整理结果 — 先给结论摘要，再给分类详情和逐项解释
4. ## 待确认 — 列出所有不确定项和缺失信息
5. ## 后续建议 — 3-5 条具体可操作的下一步

### 禁止术语:
PRD, Harness, HMW, POV, 产品需求文档, 设计提案约束, 开发者校验, agent, pipeline, API, JSON, stage

### 免责声明 (每个报告末尾必须包含):
> ⚠️ 医疗免责声明：本报告旨在整理和解释医疗资料，不替代兽医诊断。如有健康疑虑，请咨询执业兽医。`;
}

export interface AgentInput {
  petName: string; hospitalName?: string; visitDate?: string;
  visitReason?: string; diagnosis?: string; city?: string;
  totalAmount: number; requestText?: string;
  items: Array<{ name: string; amount: number; category?: string; explanation?: string; necessity?: string; priceLevel?: string }>;
  petInfo?: { species?: string; breed?: string; gender?: string; birthDate?: string; weightKg?: number };
}

export interface AgentResult { success: boolean; reportMarkdown: string; reportType: string; agentUsed: boolean; error?: string; }

export async function runAgentPipeline(input: AgentInput): Promise<AgentResult> {
  const llm = getLlmAdapter();
  if (!llm) return { success: false, reportMarkdown: '', reportType: 'bill_explain', agentUsed: false, error: 'LLM 未配置' };
  if (!await llm.isAvailable().catch(() => false)) return { success: false, reportMarkdown: '', reportType: 'bill_explain', agentUsed: false, error: 'LLM 不可用' };

  try {
    const items = input.items.map((it, i) =>
      `${i + 1}. ${it.name} — ¥${it.amount.toFixed(2)}` +
      `${it.category ? ` [${it.category}]` : ''}${it.priceLevel ? ` 价格:${it.priceLevel}` : ''}`
    ).join('\n');

    const pi = input.petInfo;
    const pl: string[] = [];
    if (pi?.species) pl.push(`种类: ${pi.species}`);
    if (pi?.breed) pl.push(`品种: ${pi.breed}`);
    if (pi?.gender) pl.push(`性别: ${pi.gender}`);
    if (pi?.birthDate) pl.push(`出生: ${pi.birthDate}`);
    if (pi?.weightKg) pl.push(`体重: ${pi.weightKg}kg`);

    const userPrompt = `为以下宠物就诊记录生成一份 **bill_explain** 类型的完整 Markdown 报告。

## 基本信息
- 宠物: ${input.petName}${pl.length ? '（' + pl.join(' / ') + '）' : ''}
- 医院: ${input.hospitalName || '未提供'}
- 日期: ${input.visitDate || '未提供'}
- 城市: ${input.city || '未提供'}
${input.visitReason ? `- 就诊原因: ${input.visitReason}` : ''}
${input.diagnosis ? `- 诊断: ${input.diagnosis}` : ''}
- 总费用: ¥${input.totalAmount.toFixed(2)}（${input.items.length} 项）

## 费用项目
${items}

## 要求
严格按照"报告格式标准"输出:
- 以 "# 宠物医疗账单解释报告" 开头
- 包含全部 5 个核心章节 + 医疗免责声明
- 逐项解释时标注: 类别、通俗解释、价格参考区间
- 用中文撰写，专业但通俗易懂
- 直接输出 Markdown，不用代码块

## LaTeX 兼容格式要求 (CRITICAL)
因为报告会经过 LaTeX 编译为 PDF，Markdown 必须遵循以下规则:
- **禁止使用 Markdown 表格** (|...| 格式在 LaTeX 中会被压缩变形)，用缩进列表代替
- **编号列表用纯数字**，不要在数字外加 ** 粗体标记。示例: "1. 核实..." 而非 "1. **核实...**"
- **段落间留空行**，确保 LaTeX 正确分段
- **不要使用 > 引用块嵌套多行内容**，用普通段落 + 缩进代替
- 禁止术语同样适用于 LaTeX 特殊字符: 不要使用 & _ $ % # { } ~ ^ \\`;

    console.log(`[Agent] System: ${buildSystemPrompt().length} 字符 → ${llm.name}`);
    const response = await llm.chat(userPrompt, buildSystemPrompt());
    let md = response.replace(/^```(?:markdown|md)?\s*\n?/gm, '').replace(/^```\s*$/gm, '').trim();
    if (!md.startsWith('#')) md = '# 宠物医疗账单解释报告\n\n' + md;

    if (md.length < 50) return { success: false, reportMarkdown: '', reportType: 'bill_explain', agentUsed: true, error: '内容过短' };

    console.log(`[Agent] 生成 ${md.length} 字符`);
    return { success: true, reportMarkdown: md, reportType: 'bill_explain', agentUsed: true };
  } catch (e) {
    return { success: false, reportMarkdown: '', reportType: 'bill_explain', agentUsed: true, error: `${e}` };
  }
}

export function isAgentPipelineAvailable(): boolean { return !!getLlmAdapter(); }
