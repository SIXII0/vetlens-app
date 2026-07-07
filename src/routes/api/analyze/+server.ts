import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { analyzeBill } from '$lib/server/engine/explainer';
import { getLlmAdapter } from '$lib/server/llm/index';
import { createRecord, insertLineItems } from '$lib/server/db/records';
import { v4 as uuid } from 'uuid';

export const POST: RequestHandler = async ({ request }) => {
  const startTime = Date.now();

  try {
    const body = await request.json();

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

    return json({
      ...result,
      recordId: record?.id || null,
      llmUsed: llmAvailable
    });
  } catch (err) {
    console.error('[VetLens] 分析失败:', err);
    return json({
      error: `分析失败: ${err instanceof Error ? err.message : '未知错误'}`
    }, { status: 500 });
  }
};
