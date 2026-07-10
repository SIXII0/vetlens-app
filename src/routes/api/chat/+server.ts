import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { v4 as uuid } from 'uuid';
import { getLlmAdapter } from '$lib/server/llm/index';
import { checkSafety } from '$lib/server/engine/chat-safety';
import { buildChatContext } from '$lib/server/engine/chat-context';
import { routeIntent } from '$lib/server/engine/chat-router';
import { buildSystemPrompt, buildUserPrompt } from '$lib/server/engine/chat-prompt';
import { getRecordById } from '$lib/server/db/records';
import { getPetById } from '$lib/server/db/pets';
import {
  createChatSession, getChatSession, getSessionByAnalysis,
  saveChatMessage, listChatMessages, updateChatSession,
} from '$lib/server/db/chat';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { message, sessionId, petId, analysisId, recordId } = body as {
      message: string; sessionId?: string; petId?: string; analysisId?: string; recordId?: string;
    };

    if (!message || typeof message !== 'string' || !message.trim()) {
      return json({ error: '请输入问题' }, { status: 400 });
    }

    const userMessage = message.trim();
    const contextIds = normalizeContextIds({ analysisId, recordId, petId });

    // 1. 安全检查
    const safetyResult = checkSafety(userMessage);
    if (safetyResult.triggered) {
      const session = await resolveSession(sessionId, contextIds.petId, contextIds.analysisId, contextIds.recordId);
      const msgId = uuid();
      saveChatMessage({ id: msgId, sessionId: session.id, role: 'user', content: userMessage });
      const replyId = uuid();
      saveChatMessage({ id: replyId, sessionId: session.id, role: 'assistant', content: safetyResult.message!, intent: 'emergency_boundary', safetyJson: JSON.stringify(safetyResult) });
      return json({ sessionId: session.id, messageId: replyId, reply: safetyResult.message!, intent: 'emergency_boundary', safety: safetyResult, sources: [], actions: [] });
    }

    // 2. 获取或创建会话
    const session = await resolveSession(sessionId, contextIds.petId, contextIds.analysisId, contextIds.recordId);

    // 3. 构建上下文
    const context = buildChatContext({
      analysisId: contextIds.analysisId || session.analysis_id || undefined,
      petId: contextIds.petId || session.pet_id || undefined,
      recordId: contextIds.recordId || session.record_id || undefined,
      sessionId: session.id,
      userMessage,
    });

    // 4. 意图路由
    const intent = routeIntent(userMessage);

    // 5. 调用 LLM
    const llm = getLlmAdapter();
    let reply: string;
    let llmUsed = false;

    if (!llm) {
      reply = generateFallbackReply(context, intent, userMessage);
    } else {
      try {
        const available = await llm.isAvailable().catch(() => false);
        if (!available) {
          reply = generateFallbackReply(context, intent, userMessage);
        } else {
          const systemPrompt = buildSystemPrompt();
          const userPrompt = buildUserPrompt(context, userMessage);
          reply = await llm.chat(userPrompt, systemPrompt);
          reply = reply.replace(/```(?:markdown|md)?\s*\n?/g, '').replace(/```\s*$/g, '').trim();
          llmUsed = true;
        }
      } catch (err) {
        console.error('[chat] LLM call failed:', err);
        reply = generateFallbackReply(context, intent, userMessage);
      }
    }

    // 6. sources + actions
    const sources = context.knowledgeHits.map(h => ({ title: h.title, type: 'knowledge' as const, source: h.source, snippet: h.snippet.slice(0, 150) }));
    const actions = buildActions(intent, contextIds.analysisId, contextIds.recordId);

    // 7. 保存消息
    const msgId = uuid();
    saveChatMessage({ id: msgId, sessionId: session.id, role: 'user', content: userMessage });
    const replyId = uuid();
    saveChatMessage({ id: replyId, sessionId: session.id, role: 'assistant', content: reply, intent, sourcesJson: JSON.stringify(sources), actionsJson: JSON.stringify(actions), safetyJson: JSON.stringify({ triggered: false }) });

    if (!session.title || session.title === '新的对话') {
      const title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
      updateChatSession(session.id, { title });
    }

    return json({ sessionId: session.id, messageId: replyId, reply, intent, llmUsed, safety: { triggered: false }, sources, actions });
  } catch (err) {
    console.error('[chat] API error:', err);
    return json({ error: '处理失败，请稍后重试', detail: err instanceof Error ? err.message : '未知错误' }, { status: 500 });
  }
};

function normalizeContextIds(input: {
  analysisId?: string; recordId?: string; petId?: string;
}): { analysisId?: string; recordId?: string; petId?: string } {
  const validAnalysisId = input.analysisId && getRecordById(input.analysisId) ? input.analysisId : undefined;
  const validRecordId = input.recordId && getRecordById(input.recordId) ? input.recordId : undefined;
  const validPetId = input.petId && getPetById(input.petId) ? input.petId : undefined;

  if ((input.analysisId && !validAnalysisId) || (input.recordId && !validRecordId) || (input.petId && !validPetId)) {
    console.warn('[chat] ignoring invalid optional context id; using the remaining valid context');
  }

  return {
    analysisId: validAnalysisId,
    recordId: validRecordId || validAnalysisId,
    petId: validPetId,
  };
}

async function resolveSession(
  sessionId: string | undefined, petId: string | undefined,
  analysisId: string | undefined, recordId: string | undefined,
): Promise<{ id: string; pet_id: string | null; analysis_id: string | null; record_id: string | null; title: string | null; created_at: string; updated_at: string; metadata: string | null }> {
  if (sessionId) { const existing = getChatSession(sessionId); if (existing) return existing; }
  if (analysisId) { const existing = getSessionByAnalysis(analysisId); if (existing) return existing; }
  return createChatSession({ petId, analysisId, recordId: recordId || analysisId });
}

function generateFallbackReply(
  context: { analysisSummary?: string; petSummary?: string; knowledgeHits: Array<{ title: string; snippet: string }> },
  intent: string, userMessage: string,
): string {
  if (/头孢|阿莫西林|抗生素|吃多少|剂量|喂药/.test(userMessage)) {
    return '我不能根据聊天内容给宠物开药或提供具体剂量。不同药物、体重、年龄、肝肾功能和病因都会影响安全性，建议先联系兽医确认药名、剂型和用法；如果已经误服或出现呕吐、精神沉郁等情况，请尽快联系急诊。';
  }
  if (/拉尿|尿液|尿很臭|尿好臭|猫砂盆|频繁尿|尿频|尿血|排尿/.test(userMessage)) {
    return `不能仅凭气味远程确定原因，但我可以帮你做初步分辨。常见可能因素包括：

- 尿液浓缩、饮水减少，气味因此更明显；
- 猫砂、猫砂盆清洁或环境残留造成的气味；
- 尿路炎症、结晶或其他排尿问题，需要兽医检查才能判断；

先观察 24 小时内的饮水量、排尿次数和尿量、尿液颜色、是否频繁进出猫砂盆，以及是否出现舔尿道口、叫痛或乱尿。

**危险信号：**反复蹲猫砂盆但尿不出来、只有几滴尿、明显疼痛、呕吐、精神沉郁或腹部紧张时，尤其是公猫，应立即联系急诊宠物医院，不要在家等待。

为了进一步判断：是公猫还是母猫？尿量有没有减少或带血？最近饮水、食欲和精神状态是否改变？

这些信息不能替代兽医面诊。`;
  }
  if (intent === 'bill_explain' && context.analysisSummary) {
    return `根据当前账单分析结果，我可以帮你梳理一下：\n\n你可以查看页面中的"逐项解读"标签页，每一项费用都有名称、类别、价格评估和必要性说明。如果有标记为"未知项目"或"价格偏高"的项目，建议向医院核实具体服务内容。\n\n💡 下一步：\n- 向医院确认标注"未知"或"待确认"的项目\n- 确认是否有夜诊/急诊附加费\n- 对比附近医院的同类项目价格`;
  }
  if (intent === 'insurance_precheck') {
    return `关于保险理赔，需要确认以下几个关键材料：\n\n1. 就诊记录和诊断证明（需医院盖章）\n2. 费用发票和明细清单\n3. 保单条款确认（等待期是否已过、是否在保障范围内）\n4. 宠物身份证明\n\n⚠️ 请注意：具体是否能理赔，以保险公司的最终审核为准。你可以先在"保险"页面添加保单信息，系统会帮你做预检。`;
  }
  if (intent === 'report_generate') {
    return `你可以生成一份综合报告，包含：\n\n- 本次就诊费用摘要\n- 逐项解读\n- 价格合理性分析\n- 后续建议\n\n在"综合报告"标签页点击"生成报告"按钮即可创建，支持下载 Markdown 和 PDF 格式。`;
  }
  if (intent === 'knowledge_search' && context.knowledgeHits.length > 0) {
    const hit = context.knowledgeHits[0];
    return `${hit.title}：${hit.snippet}\n\n💡 建议结合兽医的检查结果和诊断来综合判断，知识库内容仅供参考。`;
  }
  if (context.analysisSummary) {
    return `我可以帮你分析当前账单的内容。你可以尝试问我：\n\n- 哪些项目费用较高？\n- 哪些项目需要进一步确认？\n- 这次就诊能否准备保险材料？\n- 帮我生成一份家人能看的总结。\n\n请告诉我你想了解的具体内容。`;
  }
  return '我可以帮你理解宠物医院账单、解释检查项目、检查保险理赔准备情况。请告诉我你遇到了什么疑问。';
}

function buildActions(intent: string, analysisId?: string, recordId?: string) {
  const actions: Array<{ type: string; label: string; href?: string }> = [];
  if (intent === 'report_generate') actions.push({ type: 'generate_report', label: '生成家人可读总结', href: recordId ? `/analysis/${recordId}` : undefined });
  if (recordId || analysisId) actions.push({ type: 'open_record', label: '查看本次就诊记录', href: `/analysis/${recordId || analysisId}` });
  actions.push({ type: 'open_insurance', label: '查看保险材料清单', href: '/insurance' });
  return actions;
}

export const GET: RequestHandler = async ({ url }) => {
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) return json({ error: '缺少 sessionId' }, { status: 400 });
  const messages = listChatMessages(sessionId);
  return json({ sessionId, messages: messages.map(m => ({ id: m.id, role: m.role, content: m.content, intent: m.intent, safety: m.safety_json ? JSON.parse(m.safety_json) : undefined, sources: m.sources_json ? JSON.parse(m.sources_json) : undefined, actions: m.actions_json ? JSON.parse(m.actions_json) : undefined, createdAt: m.created_at })) });
};
