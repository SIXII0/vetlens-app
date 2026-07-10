import { getRecordById } from '$lib/server/db/records';
import { getPetById } from '$lib/server/db/pets';
import { getAllPolicies } from '$lib/server/db/insurance';
import { getRecentMessages } from '$lib/server/db/chat';
import { retrieveKnowledgeForChat, type KnowledgeHit } from './chat-retrieval';

export interface ChatContext {
  analysisSummary?: string;
  petSummary?: string;
  recordSummary?: string;
  insuranceSummary?: string;
  knowledgeHits: KnowledgeHit[];
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export function buildChatContext(input: {
  analysisId?: string;
  petId?: string;
  recordId?: string;
  sessionId?: string;
  userMessage: string;
}): ChatContext {
  const ctx: ChatContext = {
    knowledgeHits: [],
    recentMessages: [],
  };

  const recordId = input.recordId || input.analysisId;
  if (recordId) {
    const recordData = getRecordById(recordId);
    if (recordData) {
      const r = recordData.record;
      const items = recordData.items.slice(0, 30);
      const itemSummary = items.map((it, i) =>
        `${i + 1}. ${it.raw_name} - ¥${it.amount.toFixed(2)}` +
        (it.category ? ` (${it.category})` : '') +
        (it.explanation ? ` — ${it.explanation.slice(0, 100)}` : '')
      ).join('\n');

      ctx.analysisSummary = [
        `医院: ${r.hospital_name || '未知'}`,
        `城市: ${r.hospital_city || '未知'}`,
        `日期: ${r.visit_date}`,
        `就诊原因: ${r.visit_reason || '未知'}`,
        `诊断: ${r.diagnosis || '未知'}`,
        `总费用: ¥${r.total_amount.toFixed(2)}`,
        `项目数: ${items.length}`,
        '',
        '费用明细:',
        itemSummary,
      ].join('\n');

      if (r.pet_id && !input.petId) {
        input.petId = r.pet_id;
      }
    }
  }

  if (input.petId) {
    const pet = getPetById(input.petId);
    if (pet) {
      ctx.petSummary = [
        `宠物: ${pet.name}`,
        `物种: ${pet.species}`,
        `品种: ${pet.breed || '未知'}`,
        `性别: ${pet.gender || '未知'}`,
        `出生日期: ${pet.birth_date || '未知'}`,
        `体重: ${pet.weight_kg ? pet.weight_kg + 'kg' : '未知'}`,
      ].join('\n');
    }
  }

  if (input.petId) {
    const policies = getAllPolicies(input.petId);
    if (policies.length > 0) {
      const active = policies.filter(p => p.status === 'active');
      if (active.length > 0) {
        const p = active[0];
        ctx.insuranceSummary = [
          `保险公司: ${p.company}`,
          `产品: ${p.product_name}`,
          `等待期: ${p.waiting_period ?? 30} 天`,
          `免赔额: ¥${p.deductible ?? 200}`,
          `报销比例: ${((p.reimbursement_rate ?? 0.6) * 100).toFixed(0)}%`,
          `年度限额: ¥${p.annual_limit ?? 15000}`,
        ].join('\n');
      }
    }
  }

  ctx.knowledgeHits = retrieveKnowledgeForChat(input.userMessage);

  if (input.sessionId) {
    const recent = getRecentMessages(input.sessionId, 10);
    ctx.recentMessages = recent
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content.slice(0, 500),
      }))
      .reverse();
  }

  return ctx;
}
