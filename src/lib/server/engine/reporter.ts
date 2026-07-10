/**
 * 报告生成引擎 —— 严格对齐 pet-vault-skill 报告编排规范
 *
 * 核心原则（来自 SKILL.md）：
 * - source list first, user-readable conclusions before details
 * - missing/uncertain data called out explicitly
 * - facts / organized findings / suggestions / missing data / uncertain fields 分离
 * - medical content does not replace veterinary judgment
 * - claim content does not promise reimbursement
 *
 * 7 种报告类型各有 required sections（来自 config/pet_care_report_harness.yaml）
 */

import type { AnalyzedItem, AnalysisSummary } from './types';
import { v4 as uuid } from 'uuid';

// ---- 报告类型 ----

export type ReportType =
  | 'general' | 'medical_summary' | 'bill_explain' | 'claim_check'
  | 'timeline' | 'chronic_review' | 'clinic_client_summary';

export interface ReportManifest {
  reportId: string; reportType: ReportType;
  petName: string; title: string; generatedAt: string;
  sourceRecordId?: string; materialCount: number; routingReason: string;
}

export interface QaResult { passed: boolean; checks: QaCheck[]; warnings: string[]; }
export interface QaCheck { rule: string; passed: boolean; detail: string; }

export interface ReportResult {
  reportId: string; reportType: ReportType;
  markdown: string; manifest: ReportManifest; qaResult: QaResult; title: string;
}

export interface ReportInput {
  petName?: string; visitDate?: string; hospitalName?: string;
  visitReason?: string; diagnosis?: string; city?: string;
  items?: AnalyzedItem[]; summary?: AnalysisSummary; totalAmount?: number;
  reportType?: ReportType | 'auto'; requestText?: string;
  insuranceResult?: Record<string, unknown>; rawOcrText?: string; recordId?: string;
  // 宠物档案信息（用于 pet profile 章节）
  petInfo?: { species?: string; breed?: string; gender?: string; birthDate?: string; weightKg?: number };
}

// ---- 标题 + 免责 ----

const REPORT_TITLES: Record<ReportType, string> = {
  general: '宠物资料综合整理报告',
  medical_summary: '兽医报告简明解读',
  bill_explain: '宠物医疗账单解释报告',
  claim_check: '宠物保险理赔材料检查报告',
  timeline: '跨院就诊资料包',
  chronic_review: '慢病月度复盘报告',
  clinic_client_summary: '医院端客户解释材料草稿',
};

const FORBIDDEN_TERMS = ['PRD','Harness','HMW','POV','产品需求文档','设计提案约束','开发者校验'];

const MEDICAL_DISCLAIMER =
  '> ⚠️ **医疗免责声明**：本报告旨在整理和解释医疗资料，不替代兽医诊断。如有健康疑虑，请咨询执业兽医。';

const INSURANCE_DISCLAIMER =
  '> ⚠️ **理赔说明**：本报告检查理赔材料完整性并提示风险点，不承诺理赔结果。实际赔付以保险公司审核为准。';

const CLINIC_DRAFT_DISCLAIMER =
  '> ⚠️ **草稿声明**：本文为 AI 生成的客户解释材料草稿，须经执业兽医审核确认后方可作为正式沟通材料使用。';

const BILLING_BOUNDARY =
  '> 💡 **说明**：费用分类和价格参考基于公开数据整理，不构成对医院收费合理性的判断。不同医院的设备、医生资历和药品品牌存在合理差异。';

const UNKNOWN_LABEL = '待确认';

// ---- 路由 ----

function selectReportType(text?: string): { reportType: ReportType; reason: string } {
  const t = (text || '').toLowerCase();
  if (/账单|费用|发票|收据|收费|bill|invoice/i.test(t)) return { reportType:'bill_explain', reason:'关键词匹配-账单' };
  if (/理赔|报销|保险|保单|claim|insurance/i.test(t)) return { reportType:'claim_check', reason:'关键词匹配-理赔' };
  if (/转院|转诊|病历汇总|资料包|timeline|referral/i.test(t)) return { reportType:'timeline', reason:'关键词匹配-时间线' };
  if (/慢病|慢性|月度|复查|长期|chronic/i.test(t)) return { reportType:'chronic_review', reason:'关键词匹配-慢病' };
  if (/检查报告|化验|血常规|生化|超声|lab report/i.test(t)) return { reportType:'medical_summary', reason:'关键词匹配-医疗报告' };
  return { reportType:'general', reason:'默认综合报告' };
}

// ---- Manifest ----

function createManifest(
  reportId: string, reportType: ReportType, petName: string,
  reason: string, materialCount: number, recordId?: string
): ReportManifest {
  return { reportId, reportType, petName: petName || UNKNOWN_LABEL,
    title: REPORT_TITLES[reportType], generatedAt: new Date().toISOString(),
    sourceRecordId: recordId, materialCount, routingReason: reason };
}

// ---- QA ----

function runQa(md: string, type: ReportType, items?: AnalyzedItem[]): QaResult {
  const checks: QaCheck[] = []; const warnings: string[] = [];
  const found = FORBIDDEN_TERMS.filter(t => md.includes(t));
  checks.push({ rule:'禁止术语', passed:found.length===0,
    detail:found.length===0?'通过':`发现: ${found.join(',')}` });

  // 根据报告类型检查不同的章节要求
  if (type === 'bill_explain') {
    for (const s of ['费用分类总览','已识别项目解释','本次就诊档案卡','后续建议']) {
      const ok = md.includes(`## ${s}`);
      checks.push({ rule:`章节:${s}`, passed:ok, detail:ok?'已包含':'缺失' });
      if (!ok) warnings.push(`缺少必要章节: ${s}`);
    }
  } else {
    for (const s of ['使用材料','事实','整理结果','待确认','后续建议']) {
      const ok = md.includes(`## ${s}`);
      checks.push({ rule:`章节:${s}`, passed:ok, detail:ok?'已包含':'缺失' });
      if (!ok) warnings.push(`缺少必要章节: ${s}`);
    }
  }
  if (type!=='clinic_client_summary') {
    const ok = md.includes('医疗免责声明');
    checks.push({ rule:'医疗免责声明', passed:ok, detail:ok?'已包含':'缺失' });
    if (!ok) warnings.push('缺少医疗免责声明');
  }
  if (type==='claim_check') {
    const ok = md.includes('理赔说明');
    checks.push({ rule:'理赔免责声明', passed:ok, detail:ok?'已包含':'缺失' });
    if (!ok) warnings.push('缺少理赔免责声明');
  }
  if (type==='clinic_client_summary') {
    const ok = md.includes('草稿声明');
    checks.push({ rule:'B端草稿声明', passed:ok, detail:ok?'已包含':'缺失' });
    if (!ok) warnings.push('缺少B端草稿声明');
  }
  const uncertain = (md.match(new RegExp(UNKNOWN_LABEL,'g'))||[]).length;
  checks.push({ rule:'不确定项标注', passed:true,
    detail:uncertain>0?`${uncertain}处待确认`:'无待确认项' });
  if (items?.length) {
    const n = items.filter(i=>!i.isUnknown).length;
    checks.push({ rule:'来源可追溯', passed:n>0, detail:`${n}/${items.length}项可追溯` });
  }
  return { passed: checks.filter(c=>!c.passed).length===0, checks, warnings };
}

// ---- 工具 ----

function fmt(n: number): string { return `¥${n.toFixed(2)}`; }
function pct(part: number, total: number): string { return total > 0 ? `${(part/total*100).toFixed(1)}%` : '—'; }
function catGroup(items: AnalyzedItem[]): Record<string, AnalyzedItem[]> {
  const g: Record<string, AnalyzedItem[]> = {};
  for (const i of items) { const c = i.category||'其他'; (g[c]??=[]).push(i); }
  return g;
}
function isHighPrice(i: AnalyzedItem) { return i.priceAssessment?.level==='偏高'||i.priceAssessment?.level==='略高'; }
function calcAge(birthDate?: string): string {
  if (!birthDate) return '';
  try {
    const b = new Date(birthDate);
    const now = new Date();
    const years = now.getFullYear() - b.getFullYear();
    const months = now.getMonth() - b.getMonth();
    const totalMonths = years * 12 + months + (now.getDate() < b.getDate() ? -1 : 0);
    if (totalMonths < 12) return `${Math.max(1, totalMonths)}个月`;
    if (totalMonths < 24) return `1岁${totalMonths-12}个月`;
    return `${years}岁`;
  } catch { return ''; }
}

// 费用分类显示名映射
const CAT_DISPLAY: Record<string, string> = {
  '检查': '检查类', '药品': '口服药品类', '治疗': '输液/注射药品类',
  '手术': '手术类', '耗材': '耗材类', '处置': '处置类',
  '服务': '服务类', '预防': '预防保健类', '其他': '其他',
};

function catDisplayName(cat: string): string {
  return CAT_DISPLAY[cat] || cat;
}

function catDescription(cat: string): string {
  const m: Record<string, string> = {
    '检查': '已识别：检查、化验、影像相关费用',
    '药品': '已识别：口服药品相关费用',
    '治疗': '已识别：注射类药品相关费用',
    '手术': '已识别：手术相关费用',
    '耗材': '已识别：耗材相关费用',
    '处置': '已识别：处置相关费用',
    '服务': '已识别：服务相关费用',
    '预防': '已识别：预防保健相关费用',
    '其他': '已识别：其他费用',
  };
  return m[cat] || '已识别';
}

// ================================================================
//  核心：composeReport
// ================================================================

export function composeReport(input: ReportInput): ReportResult {
  const id = uuid(), pet = input.petName||UNKNOWN_LABEL;
  const { reportType, reason } = input.reportType&&input.reportType!=='auto'
    ? { reportType: input.reportType, reason:'用户指定' }
    : selectReportType(input.requestText);
  const items = input.items||[], date = input.visitDate||new Date().toISOString().split('T')[0];
  const total = input.totalAmount ?? items.reduce((s,i)=>s+i.amount,0);

  const S: string[] = [];
  const isBillExplain = reportType === 'bill_explain';

  if (isBillExplain) {
    // ═══════════════════════════════════════════
    // 账单解释报告：严格对齐参考 PDF 格式
    // ═══════════════════════════════════════════

    const identified = items.filter(i => !i.isUnknown);
    const unidentified = items.filter(i => i.isUnknown);
    const identifiedSum = identified.reduce((s, i) => s + i.amount, 0);
    const unidentifiedSum = unidentified.reduce((s, i) => s + i.amount, 0);
    // 疑似误识别：金额极小（≤¥10）且名称含数字/时间的
    const suspicious = items.filter(i => i.amount <= 10 && /\d{1,2}[:：]\d{2}|^\d+$/.test(i.rawName));
    const suspiciousSum = suspicious.reduce((s, i) => s + i.amount, 0);

    // ── 标题区 ──
    S.push(`# ${REPORT_TITLES[reportType]}`);
    S.push('*PetVault Care Archive*');
    S.push('');

    // ── 宠物信息条 ──
    const infoParts: string[] = [];
    infoParts.push(`**${pet}**`);
    if (input.petInfo) {
      const pi = input.petInfo;
      const speciesLabel = (pi.species || '') + (pi.breed ? ` / ${pi.breed}` : '');
      if (speciesLabel) infoParts.push(speciesLabel);
      const age = calcAge(pi.birthDate);
      const ageLabel = age + (pi.weightKg ? ` / ${pi.weightKg}kg` : '');
      if (ageLabel) infoParts.push(ageLabel);
    }
    infoParts.push(date);
    if (input.hospitalName) infoParts.push(`**${input.hospitalName}**`);
    if (input.city) infoParts.push(input.city);
    S.push(infoParts.join(' | '));
    S.push('');

    // ── 总费用 ──
    S.push(`**总费用 ${fmt(total)}**`);
    S.push('');

    // ── 报告状态 ──
    const reportStatus = unidentified.length > 0
      ? '**报告状态** 不建议作为最终解释'
      : '**报告状态** 可归档为就诊档案';
    S.push(reportStatus);
    S.push('');

    // ── 概要统计条 ──
    const statParts: string[] = [];
    if (identified.length) statParts.push(`已识别 ${fmt(identifiedSum)}`);
    if (unidentified.length) statParts.push(`待核实 ${fmt(unidentifiedSum)}`);
    if (suspicious.length && suspiciousSum > 0) statParts.push(`疑似误识别 ${fmt(suspiciousSum)}`);
    if (statParts.length) S.push(statParts.join(' | '));
    S.push('');

    // ── 概览段落 ──
    const summaryLines: string[] = [];
    summaryLines.push(`本次账单总额为 ${fmt(total)}。`);
    if (identified.length && unidentified.length) {
      summaryLines.push(`当前可明确解释的项目为 ${fmt(identifiedSum)}，占 ${pct(identifiedSum, total)}；待核实项目为 ${fmt(unidentifiedSum)}，占 ${pct(unidentifiedSum, total)}。`);
    }
    if (suspicious.length && suspiciousSum > 0) {
      summaryLines.push(`另有 ${fmt(suspiciousSum)} 疑似为打印时间或系统信息。`);
    }
    if (unidentified.length) {
      summaryLines.push('建议先向医院核实重点项目后，再将本报告作为最终档案或理赔材料使用。');
    }
    S.push(summaryLines.join(''));
    S.push('');

    // ── 重点提醒 ──
    if (unidentified.length >= 2 || unidentifiedSum > total * 0.3) {
      S.push('**重点提醒**：本次账单的主要疑点不是常规检查或药品项目，而是若干金额较高或名称无法可靠识别的项目。');
      S.push('');
    }

    // ── 费用分类总览 ──
    S.push('## 费用分类总览');
    S.push('');
    if (unidentified.length) {
      S.push(`本次费用主要集中在待核实项目，当前无法判断这些费用具体对应什么服务。`);
      S.push('');
    }
    S.push('| 类别 | 金额 | 占比 | 说明 |');
    S.push('|------|------|------|------|');
    const cats = catGroup(items);
    for (const [c, ci] of Object.entries(cats)) {
      const ct = ci.reduce((s, i) => s + i.amount, 0);
      S.push(`| ${catDisplayName(c)} | ${fmt(ct)} | ${pct(ct, total)} | ${catDescription(c)} |`);
    }
    // 待核实项目作为单独行
    if (unidentified.length) {
      S.push(`| 待核实项目 | ${fmt(unidentifiedSum)} | ${pct(unidentifiedSum, total)} | 待核实：OCR不清或项目含义不明 |`);
    }
    if (suspicious.length && suspiciousSum > 0) {
      S.push(`| 疑似误识别项目 | ${fmt(suspiciousSum)} | ${pct(suspiciousSum, total)} | 疑似误识别：可能不是实际收费项目 |`);
    }
    S.push('');
    S.push('上表金额仅反映本次账单，实际价格会受城市、医院、动物体型、急诊/夜诊和耗材规格等因素影响。');
    S.push('');

    // ── 重点核实项目 ──
    if (unidentified.length) {
      S.push('## 重点核实项目');
      S.push('');
      S.push('以下项目名称不清晰，建议向医院核实：');
      S.push('');
      for (const it of unidentified) {
        const idx = items.indexOf(it) + 1;
        const reason = it.unknownReason || '原始文字识别不清';
        S.push(`- **编号 ${idx}** ${fmt(it.amount)}：${reason}。请向医院确认项目名称和对应服务内容。`);
      }
      // 检查是否有同金额项目
      const amountCounts: Record<number, number> = {};
      for (const it of unidentified) {
        amountCounts[it.amount] = (amountCounts[it.amount] || 0) + 1;
      }
      for (const [amt, cnt] of Object.entries(amountCounts)) {
        if (cnt > 1) {
          S.push('');
          S.push(`注意：金额为 ${fmt(Number(amt))} 的项目各有多个，它们是账单中的不同条目，请一并核实是否对应不同服务。`);
        }
      }
      S.push('');
      S.push('账单中另有若干非收费条目（如打印时间戳），已排除在金额统计之外。');
      S.push('');
    }

    // ── 已识别项目解释（按类别分组） ──
    if (identified.length) {
      S.push('## 已识别项目解释');
      S.push('');
      const grouped = catGroup(identified);
      for (const [cat, catItems] of Object.entries(grouped)) {
        S.push(`### ${catDisplayName(cat)}`);
        S.push('');
        for (const it of catItems) {
          const expl = it.explanation || '属于常规收费项目';
          S.push(`- **${it.rawName}** ${fmt(it.amount)}：${expl}`);
        }
        S.push('');
      }
    }

    // ── 向医院确认的问题（编号） ──
    if (unidentified.length) {
      S.push('## 向医院确认的问题');
      S.push('');
      let qIdx = 1;
      for (const it of unidentified) {
        const idx = items.indexOf(it) + 1;
        S.push(`${qIdx}. 编号 ${idx}（${fmt(it.amount)}）的项目名称是什么？对应的服务内容是什么？`);
        qIdx++;
      }
      // Check for duplicate amounts
      const amountCounts: Record<number, number> = {};
      for (const it of unidentified) { amountCounts[it.amount] = (amountCounts[it.amount] || 0) + 1; }
      for (const [amt, cnt] of Object.entries(amountCounts)) {
        if (cnt > 1) {
          S.push(`${qIdx}. 金额为 ${fmt(Number(amt))} 的项目是否为不同项目？是否存在重复计费？`);
          qIdx++;
        }
      }
      if (suspicious.length) {
        S.push(`${qIdx}. ${suspicious.map(s => `编号 ${items.indexOf(s)+1}`).join('、')} 可能是打印时间或系统信息，是否为实际收费？`);
        qIdx++;
      }
      S.push('');
    }

    // ── 可直接发送给医院 ──
    if (unidentified.length) {
      S.push('## 可直接发送给医院');
      S.push('');
      S.push('> 您好，我想核对一下 ${date} 这张费用清单中的几个项目。');
      S.push('> ');
      const qItems = unidentified.map(it => `编号 ${items.indexOf(it)+1}（${it.rawName}，${fmt(it.amount)}）`).join('、');
      S.push(`> ${qItems}，这些项目的名称在清单上不清晰，请问分别对应什么检查、治疗或服务？`);
      S.push('> ');
      // Check for duplicate amounts
      const amtDups = Object.entries(
        unidentified.reduce((acc, it) => { acc[it.amount] = (acc[it.amount] || 0) + 1; return acc; }, {} as Record<number, number>)
      ).filter(([_, c]) => c > 1);
      if (amtDups.length) {
        S.push(`> 其中金额为 ${amtDups.map(([a]) => fmt(Number(a))).join('、')} 的项目是否有重复计费？`);
        S.push('> ');
      }
      if (suspicious.length) {
        S.push(`> ${suspicious.map(s => `编号 ${items.indexOf(s)+1}（${fmt(s.amount)}）`).join('、')} 是否为实际收费，还是打印时间或系统信息？`);
        S.push('> ');
      }
      S.push('> 如果方便，也请提供一份清晰版费用明细、检查报告、诊断证明和病历记录。谢谢。');
      S.push('');
    }

    // ── 本次就诊档案卡 ──
    S.push('## 本次就诊档案卡');
    S.push('');
    if (input.visitReason) S.push(`- **主诉**：${input.visitReason}`);
    if (input.diagnosis) S.push(`- **初步判断**：材料记录：${input.diagnosis}`);
    const testItems = identified.filter(i => i.category === '检查' || /检|测|超|X|C[TR]/i.test(i.rawName));
    if (testItems.length) S.push(`- **检查**：${testItems.map(i => i.rawName).join('、')}`);
    const treatItems = identified.filter(i => i.category === '治疗' || /注射|输液|针/i.test(i.rawName));
    if (treatItems.length) S.push(`- **治疗**：${treatItems.map(i => i.rawName).join('、')}`);
    const medItems = identified.filter(i => i.category === '药品' || /药|片|丸|胶囊|口服/i.test(i.rawName));
    if (medItems.length) S.push(`- **用药**：${medItems.map(i => i.rawName).join('、')}`);
    if (unidentified.length) {
      const unkSummary = unidentified.map(it => `编号 ${items.indexOf(it)+1} ${fmt(it.amount)}`).join('、');
      S.push(`- **待核实**：${unkSummary} 合计 ${fmt(unidentifiedSum)}`);
    }
    if (suspicious.length && suspiciousSum > 0) {
      S.push(`- **疑似误识别**：${suspicious.map(s => `编号 ${items.indexOf(s)+1} ${fmt(s.amount)}`).join('、')}`);
    }
    S.push(`- **待补充材料**：病历、化验报告、影像报告、诊断证明`);
    S.push('');

    // ── 后续建议 ──
    S.push('## 后续建议');
    S.push('');
    if (unidentified.length) {
      const unkRefs = unidentified.map(it => `编号 ${items.indexOf(it)+1}`).join('、');
      S.push(`- 向医院确认 ${unkRefs} 的项目名称和服务内容。`);
    }
    S.push('- 保存原始发票、费用明细、处方、检查报告和沟通记录。');
    S.push('- 如需理赔，请向保险公司确认材料清单、等待期和既往症规则。');
    S.push('');

    // ── 免责声明 ──
    S.push('---');
    S.push('');
    S.push(MEDICAL_DISCLAIMER);
    S.push('');
    S.push('> —');
    S.push('> 本报告基于用户上传的账单/费用明细生成。');
    S.push('');

  } else {
    // ═══════════════════════════════════════════
    // 其他报告类型：保持原有通用格式
    // ═══════════════════════════════════════════

    // ── 标题 + 基本信息 ──
    S.push(`# ${REPORT_TITLES[reportType]}`);
    S.push('');
    const metaParts: string[] = [];
    if (input.hospitalName) metaParts.push(`**${input.hospitalName}**`);
    metaParts.push(date);
    if (input.city) metaParts.push(input.city);
    S.push(metaParts.join('  |  '));
    S.push('');

    // 宠物档案
    if (input.petInfo) {
      const pi = input.petInfo;
      const piParts: string[] = [];
      piParts.push(`🐾 ${pet}`);
      if (pi.species) piParts.push(pi.species);
      if (pi.breed) piParts.push(pi.breed);
      if (pi.gender) piParts.push(pi.gender);
      if (pi.birthDate) piParts.push(`🎂 ${pi.birthDate}`);
      if (pi.weightKg) piParts.push(`⚖️ ${pi.weightKg}kg`);
      S.push(`${piParts.join(' · ')}`);
    } else {
      S.push(`🐾 ${pet}`);
    }
    S.push('');

    // ── 使用材料 ──
    S.push('## 使用材料');
    S.push('');
    if (items.length) {
      S.push('- 本次上传的宠物医疗账单');
      if (input.petInfo) S.push('- 当前宠物基础档案');
      S.push('- 本次账单项目识别与解释结果');
    } else {
      S.push('- 本报告基于本次提交的账单项目与用户确认信息生成');
    }
    S.push('');

    // ── 事实 ──
    S.push('## 事实');
    S.push('');
    if (items.length) {
      S.push(`本次就诊共 **${items.length}** 项收费，合计 **${fmt(total)}**。`);
      if (input.visitReason) S.push(`就诊原因：${input.visitReason}`);
      if (input.diagnosis) S.push(`诊断结果：${input.diagnosis}`);
      S.push('');
      S.push('| 项目 | 金额 | 类别 | 匹配 |');
      S.push('|------|------|------|------|');
      for (const it of items) {
        S.push(`| ${it.rawName} | ${fmt(it.amount)} | ${it.category||'其他'} | ${it.isUnknown?'⚠️':'✅'} |`);
      }
    } else {
      S.push('本次分析未包含具体的费用项目记录。');
    }
    S.push('');

    // ── 整理结果 ──
    S.push('## 整理结果');
    S.push('');
    if (input.summary) {
      const matched = input.summary.matchedItems, unknown = input.summary.unknownItems;
      const high = input.summary.priceHighItems, warn = input.summary.priceWarningItems;
      S.push(`${input.summary.overallAssessment}`);
      S.push('');
      const stats: string[] = [];
      stats.push(`知识库匹配 ${matched}/${items.length} 项`);
      if (unknown>0) stats.push(`${unknown} 项待确认`);
      if (high>0) stats.push(`${high} 项价格偏高`);
      if (warn>0) stats.push(`${warn} 项价格略高`);
      S.push(stats.join(' · '));
    } else {
      S.push(`本次就诊共 ${items.length} 个项目，总费用 ${fmt(total)}。`);
      const m = items.filter(i=>!i.isUnknown).length;
      if (m < items.length) S.push(`${m} 项已匹配知识库，${items.length-m} 项待确认。`);
    }
    S.push('');
    S.push(...buildTypeSection(reportType, input, items, total, date));
    S.push('');

    // 逐项详情
    if (items.length) {
      S.push('### 逐项详情');
      S.push('');
      for (let i=0;i<items.length;i++) {
        const it = items[i];
        S.push(`**${i+1}. ${it.rawName}** — ${fmt(it.amount)}`);
        S.push('');
        const detail: string[] = [];
        if (it.category) detail.push(`类别：${it.category}`);
        if (it.necessity) detail.push(`必要性：${it.necessity}`);
        if (it.priceAssessment) {
          detail.push(`价格：${it.priceAssessment.level}（参考 ${fmt(it.priceAssessment.p10)}~${fmt(it.priceAssessment.p90)}）`);
        }
        if (detail.length) S.push(`${detail.join(' · ')}`);
        if (it.explanation) S.push(`${it.explanation}`);
        if (it.isUnknown) S.push(`⚠️ 该项目在知识库中未收录，解释为推断。建议向兽医确认。`);
        S.push('');
      }
    }

    // ── 待确认 ──
    S.push('## 待确认');
    S.push('');
    const uncertain2 = items.filter(i=>i.isUnknown);
    if (uncertain2.length) {
      S.push(`以下 ${uncertain2.length} 个项目暂未在知识库中匹配，建议向兽医核实：`);
      S.push('');
      for (const it of uncertain2) {
        S.push(`**${it.rawName}** (${fmt(it.amount)})`);
        S.push(`${it.unknownReason||'知识库中未收录'}`);
        S.push('');
      }
    }
    if (!input.hospitalName) S.push('> 就诊医院名称未提供');
    if (!input.diagnosis) S.push('> 诊断结果未提供（如有诊断书或病历，建议补充以获取更完整分析）');
    if (!input.petName) S.push('> 宠物名称未提供');
    if (!uncertain2.length && input.hospitalName && input.petName) {
      S.push('本次分析所有已识别项目均在知识库中找到匹配，基本信息完整。');
    }
    S.push('');

    // ── 后续建议 ──
    S.push('## 后续建议');
    S.push('');
    const actions = buildNextActions(reportType, items, input);
    for (const a of actions) {
      const cleaned = a.replace(/^\d+\.\s*\*\*/, '').replace(/\*\*$/, '').replace(/^(\d+\.\s*)/, '');
      S.push(`${cleaned}`);
      S.push('');
    }

    // ── 免责声明 ──
    S.push('---');
    S.push('');
    if (reportType==='clinic_client_summary') {
      S.push(CLINIC_DRAFT_DISCLAIMER);
    } else {
      S.push(MEDICAL_DISCLAIMER);
    }
    if (reportType==='claim_check') { S.push(''); S.push(''); S.push(INSURANCE_DISCLAIMER); }
    if (reportType==='bill_explain') { S.push(''); S.push(''); S.push(BILLING_BOUNDARY); }
    S.push('');
  }

  const md = S.join('\n');
  return {
    reportId: id, reportType, markdown: md,
    manifest: createManifest(id, reportType, pet, reason, items.length, input.recordId),
    qaResult: runQa(md, reportType, items),
    title: REPORT_TITLES[reportType],
  };
}

// ================================================================
//  类型特定章节（按 skill SKILL.md 的 required sections 对齐）
// ================================================================

function buildTypeSection(
  type: ReportType, input: ReportInput,
  items: AnalyzedItem[], total: number, date: string
): string[] {
  const L: string[] = [];

  switch (type) {

    // ── bill_explain: bill overview, cost categories, high-value items, added items, questions for the clinic ──
    case 'bill_explain': {
      const cats = catGroup(items);
      L.push('### 费用概览');
      L.push('');
      L.push(`本次就诊共 **${items.length}** 项收费，总金额 **${fmt(total)}**。`);
      L.push('');

      // 费用类别分布
      L.push('### 费用类别');
      L.push('');
      L.push('| 类别 | 项目数 | 合计 | 占比 |');
      L.push('|------|--------|------|------|');
      for (const [c, ci] of Object.entries(cats)) {
        const ct = ci.reduce((s,i)=>s+i.amount,0);
        L.push(`| ${c} | ${ci.length} | ${fmt(ct)} | ${total>0?(ct/total*100).toFixed(0)+'%':'—'} |`);
      }
      L.push('');

      // 高值项目（金额超过平均值 2 倍或 >¥200）
      const highValue = items.filter(i => i.amount >= Math.max(total/items.length*2, 200));
      if (highValue.length) {
        L.push('### 高值项目');
        L.push('');
        for (const it of highValue) {
          L.push(`- **${it.rawName}** — ${fmt(it.amount)}`);
          if (it.explanation) L.push(`  ${it.explanation}`);
        }
        L.push('');
      }

      // 价格参考
      if (input.summary) {
        L.push('### 价格参考');
        L.push('');
        L.push(input.summary.overallAssessment);
        L.push('');
      }

      // 建议向诊所确认的问题
      L.push('### 建议向诊所确认');
      L.push('');
      if (items.some(i=>i.isUnknown)) {
        L.push('以下项目建议向诊所前台或兽医确认：');
        L.push('');
        for (const it of items.filter(i=>i.isUnknown)) {
          L.push(`- "${it.rawName}" 的临床必要性和替代方案`);
        }
      }
      if (items.some(i=>i.priceAssessment?.level==='偏高')) {
        L.push('- 价格偏高项目的定价依据（是否含急诊/夜间/节假日附加费）');
      }
      L.push('- 是否有套餐或会员折扣可申请');
      break;
    }

    // ── claim_check: expense summary, existing materials, missing materials, risk reminders, no outcome promise ──
    case 'claim_check': {
      L.push('### 费用摘要');
      L.push('');
      L.push(`就诊日期: ${date}  |  总费用: ${fmt(total)}  |  项目数: ${items.length}`);
      L.push('');

      if (input.insuranceResult) {
        const ir = input.insuranceResult as Record<string,unknown>;
        const coverable = Number(ir.totalCoverable||0);
        const payout = Number(ir.totalEstimatedPayout||0);
        L.push('### 已具备的材料');
        L.push('');
        L.push('- 费用清单（逐项明细）');
        L.push('- 就诊记录（本次分析已归档）');
        if (input.diagnosis) L.push(`- 诊断证明: ${input.diagnosis}`);
        L.push('');

        L.push('### 缺少的材料');
        L.push('');
        if (Array.isArray(ir.missingDocuments) && ir.missingDocuments.length) {
          for (const d of ir.missingDocuments) L.push(`- ❌ ${d}`);
        }
        L.push('');

        L.push('### 赔付预估');
        L.push('');
        L.push(`- **可赔付项目合计**: ${fmt(coverable)}`);
        L.push(`- **预计赔付金额**: ${fmt(payout)}（扣除免赔额后按比例计算）`);
        L.push('');

        if (Array.isArray(ir.warnings) && ir.warnings.length) {
          L.push('### 风险提醒');
          L.push('');
          for (const w of ir.warnings) L.push(`- ⚠️ ${w}`);
          L.push('');
        }
      } else {
        L.push('### 材料清单');
        L.push('');
        L.push('请准备以下材料提交理赔：');
        L.push('');
        for (const d of ['诊断证明（需医院盖章）','费用清单（逐项明细）','检查报告原件','处方笺','病历记录','保单凭证']) {
          L.push(`- 📋 ${d}`);
        }
        L.push('');
      }

      L.push('> 💡 **提示**：以上为通用理赔材料清单，具体以保险公司最新条款为准。');
      break;
    }

    // ── timeline: pet profile, medical history, recent timeline, key tests, current medication, clinic-facing summary ──
    case 'timeline': {
      // 宠物档案
      if (input.petInfo) {
        const pi = input.petInfo;
        L.push('### 宠物档案');
        L.push('');
        L.push(`- 种类: ${pi.species||UNKNOWN_LABEL}${pi.breed?` / ${pi.breed}`:''}`);
        if (pi.gender) L.push(`- 性别: ${pi.gender}`);
        if (pi.birthDate) L.push(`- 出生日期: ${pi.birthDate}`);
        if (pi.weightKg) L.push(`- 体重: ${pi.weightKg} kg`);
        L.push('');
      }

      // 就诊时间线
      L.push('### 就诊时间线');
      L.push('');
      L.push('| 日期 | 医院 | 原因 | 诊断 | 费用 |');
      L.push('|------|------|------|------|------|');
      L.push(`| ${date} | ${input.hospitalName||UNKNOWN_LABEL} | ${input.visitReason||'就诊'} | ${input.diagnosis||UNKNOWN_LABEL} | ${fmt(total)} |`);
      L.push('');

      // 本次关键检查
      const testItems = items.filter(i => i.category==='检查'||/检|测|超|X|C[TR]/i.test(i.rawName));
      if (testItems.length) {
        L.push('### 本次关键检查');
        L.push('');
        for (const it of testItems) {
          L.push(`- **${it.rawName}** (${fmt(it.amount)})${it.explanation?`: ${it.explanation}`:''}`);
        }
        L.push('');
      }

      // 当前用药
      const meds = items.filter(i => i.category==='药品'||/药|针|剂|片|丸|胶囊/i.test(i.rawName));
      L.push('### 当前用药');
      L.push('');
      if (meds.length) {
        for (const it of meds) L.push(`- ${it.rawName} (${fmt(it.amount)})`);
      } else {
        L.push('本次就诊未识别到明确的药品处方。');
      }
      L.push('');

      L.push('### 转诊摘要（供接收医院参考）');
      L.push('');
      L.push(`- 就诊日期: ${date}`);
      if (input.diagnosis) L.push(`- 诊断: ${input.diagnosis}`);
      L.push(`- 已做检查: ${testItems.map(i=>i.rawName).join('、')||'无记录'}`);
      L.push(`- 用药情况: ${meds.map(i=>i.rawName).join('、')||'无记录'}`);
      L.push(`- 本次费用: ${fmt(total)}`);
      break;
    }

    // ── medical_summary: one-line summary, key findings, plain-language explanation, questions for vet, uncertainty notes ──
    case 'medical_summary': {
      // 一句话总结
      L.push('### 一句话总结');
      L.push('');
      if (input.diagnosis) {
        L.push(`本次就诊诊断为 **${input.diagnosis}**，共产生 ${items.length} 项费用，总计 ${fmt(total)}。`);
      } else {
        L.push(`本次就诊共产生 ${items.length} 项费用，总计 ${fmt(total)}。诊断结果尚未提供。`);
      }
      L.push('');

      // 关键发现
      L.push('### 关键发现');
      L.push('');
      const known = items.filter(i=>!i.isUnknown);
      if (known.length) {
        for (const it of known) {
          L.push(`- **${it.rawName}** (${fmt(it.amount)})`);
          if (it.explanation) L.push(`  ${it.explanation}`);
        }
      }
      L.push('');

      // 通俗解释
      L.push('### 通俗解释');
      L.push('');
      if (known.length) {
        const explains = known.filter(i=>i.explanation).slice(0,5);
        for (const it of explains) {
          L.push(`- **${it.rawName}**: ${it.explanation}`);
        }
      }
      const unknown = items.filter(i=>i.isUnknown);
      if (unknown.length) {
        L.push(`- 还有 ${unknown.length} 个项目（${unknown.map(i=>i.rawName).join('、')}）在知识库中未收录，建议向兽医咨询。`);
      }
      L.push('');

      // 建议向兽医提问
      L.push('### 建议向兽医确认的问题');
      L.push('');
      if (!input.diagnosis) L.push('- 本次就诊的明确诊断是什么？');
      for (const it of unknown) L.push(`- "${it.rawName}" 的临床必要性是什么？`);
      L.push('- 后续是否需要复查？复查时间建议？');
      L.push('- 是否有需要注意的居家护理事项？');
      break;
    }

    // ── chronic_review: monthly overview, visits, labs, medication changes, expense categories, next month actions ──
    case 'chronic_review': {
      L.push('### 本月概况');
      L.push('');
      L.push(`- 就诊次数: 1 次`);
      L.push(`- 本月总费用: ${fmt(total)}`);
      if (input.diagnosis) L.push(`- 主要诊断: ${input.diagnosis}`);
      L.push('');

      L.push('### 就诊记录');
      L.push('');
      L.push(`| 日期 | 医院 | 主要检查 | 费用 |`);
      L.push('|------|------|---------|------|');
      const labs = items.filter(i => i.category==='检查'||/检|测|超|X|C[TR]/i.test(i.rawName));
      L.push(`| ${date} | ${input.hospitalName||UNKNOWN_LABEL} | ${labs.map(i=>i.rawName).join('、')||'无'} | ${fmt(total)} |`);
      L.push('');

      if (labs.length) {
        L.push('### 化验/检查项目');
        L.push('');
        for (const it of labs) L.push(`- ${it.rawName} (${fmt(it.amount)})`);
        L.push('');
      }

      L.push('### 用药变化');
      L.push('');
      const meds = items.filter(i => i.category==='药品'||/药|针|剂|片|丸|胶囊/i.test(i.rawName));
      if (meds.length) {
        for (const it of meds) L.push(`- ${it.rawName} (${fmt(it.amount)})`);
      } else {
        L.push('本次未识别到明确的药品变化。');
      }
      L.push('');

      L.push('### 费用构成');
      L.push('');
      for (const [c,ci] of Object.entries(catGroup(items))) {
        L.push(`- ${c}: ${fmt(ci.reduce((s,i)=>s+i.amount,0))}（${ci.length}项）`);
      }
      L.push('');

      L.push('### 下月行动计划');
      L.push('');
      L.push('- 记录每日用药和状态变化');
      L.push('- 按医嘱预约复查');
      L.push('- 整理本月票据，更新费用记录');
      L.push('- 关注异常症状，必要时提前就诊');
      break;
    }

    // ── clinic_client_summary: report summary, key findings, fee notes, follow-up reminders, requires clinician review ──
    case 'clinic_client_summary': {
      L.push('### 报告摘要');
      L.push('');
      L.push(`宠物 ${pet(input)} 于 ${date} 在本院就诊。`);
      if (input.diagnosis) L.push(`诊断结果: **${input.diagnosis}**。`);
      L.push(`本次共产生 ${items.length} 项费用，合计 ${fmt(total)}。`);
      L.push('');

      L.push('### 关键发现');
      L.push('');
      L.push('（以下内容需由执业兽医填写确认）');
      L.push('');

      L.push('### 费用说明');
      L.push('');
      for (const [c,ci] of Object.entries(catGroup(items))) {
        L.push(`- ${c}: ${ci.length}项，${fmt(ci.reduce((s,i)=>s+i.amount,0))}`);
      }
      L.push('');

      L.push('### 复查与随访');
      L.push('');
      L.push('（需由兽医填写具体复查建议）');
      break;
    }

    // ── general: pet profile, source list, visit summary, bill explanation, claim check, next actions ──
    case 'general':
    default: {
      // 综合报告：已有概要 + 逐项详情，补充保险提示
      const unk = items.filter(i=>i.isUnknown);
      if (unk.length) {
        L.push('### 未识别项目');
        L.push('');
        for (const it of unk) L.push(`- ${it.rawName} (${fmt(it.amount)})`);
        L.push('');
      }
      L.push('### 综合提示');
      L.push('');
      L.push('- 如有宠物保险，可上传保单进行理赔预检');
      L.push('- 建议定期归档就诊记录，建立完整的宠物医疗档案');
      if (input.hospitalName) L.push(`- 本次就诊医院: ${input.hospitalName}`);
      break;
    }
  }

  return L;
}

function pet(input: ReportInput): string {
  return input.petName||UNKNOWN_LABEL;
}

// ================================================================
//  后续建议（按类型）
// ================================================================

function buildNextActions(type: ReportType, _items: AnalyzedItem[], _input: ReportInput): string[] {
  switch (type) {
    case 'bill_explain': return [
      '核实未识别项目的临床必要性，向兽医确认',
      '保留发票和费用清单原件，以备保险理赔',
      '可对比同城同级别医院公开价格了解收费水平',
    ];
    case 'claim_check': return [
      '根据"缺少的材料"清单逐项准备理赔材料',
      '确认在保单有效期内提交理赔申请',
      '所有材料提供原件或加盖医院公章的复印件',
      '提交前先咨询保险公司客服确认材料完整性',
    ];
    case 'timeline': return [
      '导入此前在其他医院的就诊记录，完善时间线',
      '将检查报告、处方、账单按时间顺序归档',
      '标注手术日期、疫苗接种时间、确诊日期等关键节点',
    ];
    case 'medical_summary': return [
      '记录宠物的饮食、排泄、精神状态等日常变化',
      '遵医嘱按时复查，不自行调整用药或停药',
      '复诊前列出想问兽医的问题清单',
      '出现呼吸困难、持续呕吐、抽搐等症状立即就医',
    ];
    case 'chronic_review': return [
      '记录每日用药时间、剂量和宠物反应',
      '按医嘱进行血常规、生化等定期检查',
      '严格遵守处方粮或特殊饮食要求',
      '保存最近24小时急诊医院的地址和电话',
      '每月整理费用和检查结果，评估治疗效果',
    ];
    case 'clinic_client_summary': return [
      '本文须经执业兽医审核确认后方可作为正式沟通材料',
      '根据实际诊疗情况补充关键发现和复查建议',
      '与客户沟通时使用通俗易懂的语言',
    ];
    default: return [
      '补充宠物品种、年龄、性别等信息可提高分析精准度',
      '每次就诊后及时上传资料并生成报告归档',
      '如有宠物保险，可上传保单进行理赔预检',
    ];
  }
}
