export interface SafetyCheck {
  triggered: boolean;
  type?: 'emergency' | 'diagnosis' | 'medication' | 'insurance_fraud' | 'legal' | 'billing';
  message?: string;
}

const EMERGENCY_KEYWORDS = [
  '猫吃百合', '狗吃巧克力', '猫吃了百合', '狗吃了巧克力',
  '误食药物', '中毒', '呼吸困难', '抽搐', '无法排尿',
  '持续呕吐', '昏迷', '严重外伤', '大量出血', '车祸', '尿不出来', '尿不出',
  '休克', '倒地不起', '吃了老鼠药', '吃了蟑螂药',
  '猫吃了', '狗吃了', '催吐',
];

const INSURANCE_FRAUD_KEYWORDS = [
  '改病历', '修改病历', '篡改病历', '伪造病历',
  '改日期', '修改日期', '改到等待期', '隐藏既往',
  '隐瞒既往', '既往病史不要说', '不要提及',
  '伪造发票', '修改发票',
];

export function checkSafety(userMessage: string): SafetyCheck {
  for (const kw of EMERGENCY_KEYWORDS) {
    if (userMessage.includes(kw)) {
      return {
        triggered: true,
        type: 'emergency',
        message: `这属于可能需要尽快就医的情况，我不能建议你在家观察或自行处理。

建议你现在做三件事：
1. 立即联系附近的急诊宠物医院；
2. 带上误食物、药品包装、账单或既往病历；
3. 不要自行催吐、喂药或等待症状变化，除非兽医明确指导。

我可以继续帮你整理"需要告诉医生的信息清单"。`
      };
    }
  }

  for (const kw of INSURANCE_FRAUD_KEYWORDS) {
    if (userMessage.includes(kw)) {
      return {
        triggered: true,
        type: 'insurance_fraud',
        message: '我不能帮助修改、伪造或隐瞒病历和理赔材料。你可以整理真实的就诊记录和发票，按照保单要求如实提交。如果有不清楚的理赔流程，我可以帮你梳理材料清单。'
      };
    }
  }

  return { triggered: false };
}
