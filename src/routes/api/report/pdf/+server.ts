import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runPetVaultPipeline, isPipelineAvailable, isLatexAvailable } from '$lib/server/engine/python-bridge';
import { runAgentPipeline, isAgentPipelineAvailable } from '$lib/server/engine/agent-pipeline';
import { getRecordById } from '$lib/server/db/records';
import { getPetById } from '$lib/server/db/pets';
import { readFileSync, existsSync } from 'fs';

/**
 * POST /api/report/pdf
 *
 * 生成 PDF 报告。两条路径：
 *   1. Agent 管线（优先）：调用 Claude API + skill 的 13 个 agent prompts
 *   2. Python 管线（兜底）：调用 skill_bridge.py → skill 的内置函数
 *
 * Body: { recordId?, items?, hospitalName?, petName?, visitDate?, requestText?, reportType? }
 * Response: { success, pdfBase64?, agentUsed?, buildLog? }
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();

    // 检查管线可用性
    if (!isPipelineAvailable()) {
      return json({
        success: false,
        error: 'pet-vault-skill 管线未安装。请将 skill 放入 .claude/skills/pet-vault-skill/',
      }, { status: 500 });
    }

    // 从 recordId 加载数据（如果提供）
    let items: Array<{ name: string; amount: number }> = body.items || [];
    let hospitalName = body.hospitalName;
    let petName = body.petName;
    let visitDate = body.visitDate;

    let petInfo: Record<string, unknown> | undefined;

    if (body.recordId) {
      const recordData = getRecordById(body.recordId);
      if (recordData) {
        hospitalName = hospitalName || recordData.record.hospital_name || undefined;
        visitDate = visitDate || recordData.record.visit_date;
        if (items.length === 0) {
          items = recordData.items.map(it => ({
            name: it.raw_name,
            amount: it.amount,
          }));
        }
        // 从关联宠物获取完整档案
        if (recordData.record.pet_id) {
          const pet = getPetById(recordData.record.pet_id);
          if (pet) {
            if (!petName) petName = pet.name;
            petInfo = {
              name: pet.name,
              species: pet.species,
              breed: pet.breed || undefined,
              gender: pet.gender || undefined,
              birthDate: pet.birth_date || undefined,
              weightKg: pet.weight_kg || undefined,
            };
          }
        }
      }
    }

    if (items.length === 0) {
      return json({ error: '请提供费用项目列表或有效的就诊记录ID' }, { status: 400 });
    }

    // ── Agent 管线：智能分析（补充解释和分类） ──
    let agentResult;
    if (isAgentPipelineAvailable()) {
      console.log('[PDF API] 尝试 Agent 管线...');
      agentResult = await runAgentPipeline({
        petName: petName || '待确认',
        hospitalName,
        visitDate,
        requestText: body.requestText,
        diagnosis: body.diagnosis,
        city: body.city,
        totalAmount: items.reduce((s: number, i: any) => s + i.amount, 0),
        items,
        petInfo: petInfo as any,
      });
    }

    // ── Python 管线：格式统一输出 ──
    // 策略：skill 的 build_report_markdown 负责统一格式，
    // Agent 的智能分析内容作为补充材料注入 materials_index
    const pipelineResult = await runPetVaultPipeline({
      requestText: body.requestText || '账单解释报告',
      petName: petName || '待确认',
      reportType: body.reportType || 'auto',
      pdfPolicy: body.pdfPolicy || 'required',
      billItems: items,
      hospitalName,
      visitDate,
      diagnosis: body.diagnosis || '',
      petInfo,
      analysisText: body.analysisText || (agentResult?.success ? agentResult.reportMarkdown : undefined),
      // 不再跳过 skill 内置生成 — 由 skill build_report_markdown 统一 PDF 格式
      preGeneratedMarkdown: undefined,
    } as any);

    if (!pipelineResult.success) {
      return json({
        success: false,
        error: pipelineResult.error || '报告生成失败',
        buildLog: pipelineResult.buildLog,
        reportId: pipelineResult.reportId,
        agentUsed: agentResult?.agentUsed || false,
      });
    }

    // 读取 PDF 内容
    let pdfBase64: string | undefined;
    if (pipelineResult.pdfPath && existsSync(pipelineResult.pdfPath)) {
      pdfBase64 = readFileSync(pipelineResult.pdfPath).toString('base64');
    }

    // 优先使用 Agent 生成的 Markdown，兜底用 Python 管线生成的
    let markdown: string | undefined;
    if (agentResult?.success && agentResult.reportMarkdown) {
      markdown = agentResult.reportMarkdown;
    } else if (pipelineResult.markdownPath && existsSync(pipelineResult.markdownPath)) {
      markdown = readFileSync(pipelineResult.markdownPath, 'utf-8');
    }

    return json({
      success: true,
      reportId: pipelineResult.reportId,
      pdfBase64,
      markdown,
      buildLog: pipelineResult.buildLog,
      latexAvailable: isLatexAvailable(),
      agentUsed: agentResult?.agentUsed || false,
      agentReportType: agentResult?.reportType || null,
    });
  } catch (err) {
    console.error('[PDF API] 错误:', err);
    return json({
      success: false,
      error: `PDF 生成异常: ${err instanceof Error ? err.message : '未知错误'}`,
    }, { status: 500 });
  }
};

/** GET /api/report/pdf — 检查管线状态 */
export const GET: RequestHandler = async () => {
  return json({
    pipelineAvailable: isPipelineAvailable(),
    latexAvailable: isLatexAvailable(),
  });
};
