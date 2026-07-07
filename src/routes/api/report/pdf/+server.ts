import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runPetVaultPipeline, isPipelineAvailable, isLatexAvailable } from '$lib/server/engine/python-bridge';
import { getRecordById } from '$lib/server/db/records';
import { getPetById } from '$lib/server/db/pets';
import { readFileSync, existsSync } from 'fs';

/**
 * POST /api/report/pdf
 *
 * 调用 pet-vault-skill Python 管线生成 PDF 报告。
 *
 * Body: { recordId?, items?, hospitalName?, petName?, visitDate?, requestText?, reportType? }
 * Response: { success, pdfUrl?, reportId?, buildLog? }
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

    // 执行管线
    const result = await runPetVaultPipeline({
      requestText: body.requestText || '账单解释报告',
      petName: petName || '待确认',
      reportType: body.reportType || 'auto',
      pdfPolicy: body.pdfPolicy || 'required',
      billItems: items,
      hospitalName,
      visitDate,
      diagnosis: body.diagnosis || '',
      petInfo,
      analysisText: body.analysisText,
    } as any);

    if (!result.success) {
      return json({
        success: false,
        error: result.error || '报告生成失败',
        buildLog: result.buildLog,
        reportId: result.reportId,
      });
    }

    // 读取 PDF 内容（转为 base64 或直接提供路径）
    let pdfBase64: string | undefined;
    if (result.pdfPath && existsSync(result.pdfPath)) {
      pdfBase64 = readFileSync(result.pdfPath).toString('base64');
    }

    // 读取 Markdown
    let markdown: string | undefined;
    if (result.markdownPath && existsSync(result.markdownPath)) {
      markdown = readFileSync(result.markdownPath, 'utf-8');
    }

    return json({
      success: true,
      reportId: result.reportId,
      pdfBase64,
      markdown,
      buildLog: result.buildLog,
      latexAvailable: isLatexAvailable(),
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
