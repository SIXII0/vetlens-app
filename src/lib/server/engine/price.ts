/**
 * 价格评估引擎 —— 规则引擎，不依赖 LLM
 *
 * 判断逻辑：
 * - 用户价格 ≤ P90 → "合理"
 * - P90 < 用户价格 ≤ P90 × 1.3 → "略高"
 * - 用户价格 > P90 × 1.3 → "偏高"
 */
import { getPriceRange } from '../db/prices';
import type { PriceAssessment, TermMatch } from './types';

/** 城市价格修正系数 */
const CITY_ADJUSTMENTS: Record<string, number> = {
  '北京': 1.0, '上海': 1.0, '广州': 0.95, '深圳': 1.0,
  '杭州': 0.95, '成都': 0.85, '重庆': 0.85, '武汉': 0.85,
  '南京': 0.90, '天津': 0.88, '苏州': 0.90, '西安': 0.82,
  '长沙': 0.82, '郑州': 0.80, '青岛': 0.85, '厦门': 0.90,
  '合肥': 0.80, '福州': 0.85, '沈阳': 0.80, '大连': 0.82,
};

/** 医院类型修正系数 */
const HOSPITAL_TYPE_ADJUSTMENTS: Record<string, number> = {
  '教学医院': 1.15,
  '连锁': 1.05,
  '社区诊所': 0.85,
};

/**
 * 评估单项价格
 */
export function evaluatePrice(
  termMatch: TermMatch,
  userPrice: number,
  city = '北京',
  hospitalType?: string
): PriceAssessment {
  // 从知识库获取价格区间
  const priceRow = getPriceRange(termMatch.termId, city, hospitalType);

  if (!priceRow) {
    // 无价格数据时返回不确定
    return {
      level: '合理',
      userPrice,
      p10: 0,
      p50: 0,
      p90: 0,
      city,
      sampleCount: 0,
      message: '暂无足够的价格数据，无法评估。该评估基于通用知识推断，仅供参考'
    };
  }

  // 城市修正
  const cityAdjust = CITY_ADJUSTMENTS[city] || 1.0;
  const typeAdjust = hospitalType ? (HOSPITAL_TYPE_ADJUSTMENTS[hospitalType] || 1.0) : 1.0;

  const adjustedP10 = Math.round(priceRow.p10 * cityAdjust * typeAdjust);
  const adjustedP50 = Math.round(priceRow.p50 * cityAdjust * typeAdjust);
  const adjustedP90 = Math.round(priceRow.p90 * cityAdjust * typeAdjust);

  const { p90 } = priceRow;

  if (userPrice <= priceRow.p90) {
    return {
      level: '合理',
      userPrice,
      p10: adjustedP10,
      p50: adjustedP50,
      p90: adjustedP90,
      city,
      sampleCount: priceRow.sample_count,
      message: `✅ 在${city}常见区间内（¥${adjustedP10}-${adjustedP90}，共${priceRow.sample_count}个数据点）`
    };
  }

  if (userPrice <= priceRow.p90 * 1.3) {
    return {
      level: '略高',
      userPrice,
      p10: adjustedP10,
      p50: adjustedP50,
      p90: adjustedP90,
      city,
      sampleCount: priceRow.sample_count,
      message: `⚠️ 略高于${city}常见区间（¥${adjustedP10}-${adjustedP90}）。可能因医院类型、急诊加价等因素，不一定不合理`
    };
  }

  return {
    level: '偏高',
    userPrice,
    p10: adjustedP10,
    p50: adjustedP50,
    p90: adjustedP90,
    city,
    sampleCount: priceRow.sample_count,
    message: `🔴 明显高于${city}常见区间（¥${adjustedP10}-${adjustedP90}），建议下次就诊前提前询问价格或对比其他医院`
  };
}
