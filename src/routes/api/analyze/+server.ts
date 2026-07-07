import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { analyzeBill } from '$lib/server/engine/explainer';
import { composeReport, selectReportType } from '$lib/server/engine/reporter';
import { getLlmAdapter } from '$lib/server/llm/index';
import { createRecord, insertLineItems } from '$lib/server/db/records';
import { saveReport } from '$lib/server/db/reports';
import type { AnalyzedItem } from '$lib/server/engine/types';
import { v4 as uuid } from 'uuid';

export const POST: RequestHandler = async ({ request, url }) => {
  const startTime = Date.now();

  try {
    const body = await request.json();

    // 报告格式：json | report（默认 json）
    const outputFormat = url.searchParams.get('format') || body.format || 'json';
    const reportTypeParam = url.searchParams.get('type') || body.reportType || 'auto';

    // 检查是否启用 LLM
    const useLlm = body.useLlm === true;
    let llm = null;
    let llmAvailable = false;
    if (useLlm) {
      llm = getLlmAdapter();
      if (llm) {
        llmAvailable = await llm.isAvailable().catch(() => false);
      }
    }

    const input = {
      items: (body.items || []).map((it: Record<string, unknown>) => ({
        rawName: (it.rawName || it.name || it.raw_name || '') as string,
        amount: (it.amount || 0) as number,
        category: (it.category || undefined) as string | undefined
      })),
      city: body.city || '北京',
      hospitalName: body.hospitalName,
      hospitalType: body.hospitalType,
      petId: body.petId,
      visitDate: body.visitDate || new Date().toISOString().split('T')[0],
      totalAmount: body.totalAmount
    };

    if (!input.items || input.items.length === 0) {
      return json({ error: '请提供账单项目列表' }, { status: 400 });
    }

    // 过滤空项目
    input.items = input.items.filter((it) =>
      it.rawName && it.rawName.trim() && it.amount && it.amount > 0
    );

    if (input.items.length === 0) {
      return json({ error: '没有有效的费用项目（需要项目名称和金额）' }, { status: 400 });
    }

    console.log(`[VetLens] 开始分析账单: ${input.items.length} 个项目, 城市=${input.city}`);

    // 执行分析（传入 LLM 适配器）
    const result = await analyzeBill(input, llmAvailable ? llm : null);

    console.log(`[VetLens] 分析完成: ${result.summary.matchedItems}/${result.items.length} 匹配` +
      `, LLM: ${llmAvailable ? '✅' : '❌'}, 耗时 ${Date.now() - startTime}ms`);

    // 自动归档就诊记录
    let record;
    try {
      record = createRecord({
        petId: input.petId,
        hospitalName: input.hospitalName,
        hospitalCity: input.city,
        visitDate: input.visitDate,
        visitReason: body.visitReason,
        diagnosis: body.diagnosis,
        totalAmount: result.totalAmount,
        rawOcrText: body.rawOcrText
      });

      // 保存逐项明细
      const lineItems = result.items.map((item, idx) => ({
        id: uuid(),
        record_id: record.id,
        item_order: idx + 1,
        raw_name: item.rawName,
        category: item.category,
        amount: item.amount,
        matched_term: item.termMatch?.termId || null,
        confidence: item.termMatch?.confidence || null,
        explanation: item.explanation,
        necessity: item.necessity,
        price_level: item.priceAssessment?.level || null,
        is_unknown: item.isUnknown ? 1 : 0
      }));
      insertLineItems(lineItems);

      console.log(`[VetLens] 就诊记录已归档: ${record.id}`);
    } catch (dbErr) {
      console.error('[VetLens] 数据库写入失败，但分析结果仍然返回:', dbErr);
      record = null;
    }

    // ---- 报告生成（pet-vault-skill 模式） ----
    let reportResult = null;
    if (outputFormat === 'report' || outputFormat === 'full') {
      try {
        reportResult = composeReport({
          petName: body.petName,
          visitDate: input.visitDate,
          hospitalName: input.hospitalName,
          visitReason: body.visitReason,
          diagnosis: body.diagnosis,
          city: input.city,
          items: result.items as AnalyzedItem[],
          summary: result.summary,
          totalAmount: result.totalAmount,
          reportType: reportTypeParam !== 'auto' ? reportTypeParam : 'auto',
          requestText: body.requestText || body.visitReason,
          rawOcrText: body.rawOcrText,
          recordId: record?.id,
        });

        // 持久化报告
        saveReport({
          ...reportResult,
          recordId: record?.id,
          petId: input.petId,
        });

        console.log(`[VetLens] 报告已生成: ${reportResult.reportId}` +
          `, 类型=${reportResult.reportType}, QA=${reportResult.qaResult.passed ? '✅' : '⚠️'}`);
      } catch (reportErr) {
        console.error('[VetLens] 报告生成失败:', reportErr);
      }
    }

    // 构建响应
    const responseData: Record<string, unknown> = {
      ...result,
      recordId: record?.id || null,
      llmUsed: llmAvailable,
    };

    if (reportResult) {
      responseData.report = {
        id: reportResult.reportId,
        type: reportResult.reportType,
        title: reportResult.title,
        markdown: outputFormat === 'report' ? reportResult.markdown : undefined,
        qaPassed: reportResult.qaResult.passed,
        qaWarnings: reportResult.qaResult.warnings,
      };
    }

    return json(responseData);
  } catch (err) {
    console.error('[VetLens] 分析失败:', err);
    return json({
      error: `分析失败: ${err instanceof Error ? err.message : '未知错误'}`
    }, { status: 500 });
  }
};
