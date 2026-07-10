export type ChatIntent =
  | 'emergency_boundary'
  | 'bill_explain'
  | 'insurance_precheck'
  | 'pet_record_lookup'
  | 'knowledge_search'
  | 'report_generate'
  | 'archive_update'
  | 'general_followup';

interface IntentRule {
  keywords: string[];
  intent: ChatIntent;
}

const RULES: IntentRule[] = [
  {
    keywords: ['猫吃百合', '狗吃巧克力', '中毒', '呼吸困难', '抽搐', '无法排尿', '持续呕吐', '昏迷', '严重外伤', '车祸', '大量出血', '休克', '倒地不起', '误食', '催吐'],
    intent: 'emergency_boundary',
  },
  {
    keywords: ['保险', '理赔', '报销', '等待期', '免赔额', '保单', '拒赔', '材料', '诊断证明', '发票', '病历'],
    intent: 'insurance_precheck',
  },
  {
    keywords: ['报告', 'PDF', '给家人看', '总结', '导出', '保存报告', '生成'],
    intent: 'report_generate',
  },
  {
    keywords: ['归档', '保存到档案', '加入记录', '更新档案'],
    intent: 'archive_update',
  },
  {
    keywords: ['账单', '费用', '检查', '项目', '为什么贵', '是不是重复', '处置费', '治疗费', '检查费', '药费', '耗材费', '大头'],
    intent: 'bill_explain',
  },
  {
    keywords: ['档案', '宠物信息', '品种', '年龄', '体重', '病史'],
    intent: 'pet_record_lookup',
  },
  {
    keywords: ['什么是', '是什么意思', '解释一下', '科普', '血常规', '生化', 'B超', 'X光', '查', '检查什么'],
    intent: 'knowledge_search',
  },
];

export function routeIntent(userMessage: string): ChatIntent {
  const lower = userMessage.toLowerCase();
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) return rule.intent;
    }
  }
  return 'general_followup';
}
