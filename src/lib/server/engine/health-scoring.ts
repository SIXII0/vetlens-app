/**
 * 宠物健康综合评分引擎
 *
 * 参考值来源：
 *   - IDEXX Veterinary Reference Ranges
 *   - Zoetis Diagnostics
 *   - AAHA/AAFP 临床指南
 *
 * 评分规则：
 *   100分 = 指标恰好落在参考范围中位值
 *   80-99 = 在参考范围内但偏离中位
 *   40-79 = 轻度异常（超出参考范围 <50%）
 *   0-39  = 显著异常（超出参考范围 >50% 或危急值）
 */

// ─── 参考范围 ──────────────────────────────────────

export interface IndicatorRange {
  low: number;      // 参考范围下限
  high: number;     // 参考范围上限
  optimal: number;  // 理想中位值（得分最高）
  criticalLow: number;   // 危急低值（低于此值严重异常）
  criticalHigh: number;  // 危急高值（高于此值严重异常）
  unit: string;
  name: string;
}

export interface SpeciesRanges {
  cat: IndicatorRange;
  dog: IndicatorRange;
}

/** 所有指标参考范围 */
export const REFERENCE_RANGES: Record<string, SpeciesRanges> = {
  // ═══ 肾功能 (32%) ═══
  bun: {
    cat: { low: 5.7, high: 12.9, optimal: 8.5, criticalLow: 2.5, criticalHigh: 30, unit: 'mmol/L', name: '尿素氮 BUN' },
    dog: { low: 2.5, high: 9.6, optimal: 6.0, criticalLow: 1.5, criticalHigh: 25, unit: 'mmol/L', name: '尿素氮 BUN' },
  },
  crea: {
    cat: { low: 71, high: 212, optimal: 140, criticalLow: 40, criticalHigh: 500, unit: 'μmol/L', name: '肌酐 CREA' },
    dog: { low: 44, high: 159, optimal: 100, criticalLow: 25, criticalHigh: 400, unit: 'μmol/L', name: '肌酐 CREA' },
  },

  // ═══ 血糖+胰腺 (28%) ═══
  glu: {
    cat: { low: 3.9, high: 8.3, optimal: 5.5, criticalLow: 2.5, criticalHigh: 16, unit: 'mmol/L', name: '血糖 GLU' },
    dog: { low: 4.1, high: 7.9, optimal: 5.8, criticalLow: 2.8, criticalHigh: 14, unit: 'mmol/L', name: '血糖 GLU' },
  },
  amy: {
    cat: { low: 500, high: 1500, optimal: 950, criticalLow: 200, criticalHigh: 3000, unit: 'U/L', name: '淀粉酶 AMY' },
    dog: { low: 300, high: 1500, optimal: 850, criticalLow: 100, criticalHigh: 3000, unit: 'U/L', name: '淀粉酶 AMY' },
  },

  // ═══ 血常规 (30%) ═══
  wbc: {
    cat: { low: 5.5, high: 19.5, optimal: 11.0, criticalLow: 2.0, criticalHigh: 35, unit: '10^9/L', name: '白细胞 WBC' },
    dog: { low: 6.0, high: 17.0, optimal: 11.0, criticalLow: 2.5, criticalHigh: 30, unit: '10^9/L', name: '白细胞 WBC' },
  },
  rbc: {
    cat: { low: 5.0, high: 10.0, optimal: 7.5, criticalLow: 3.0, criticalHigh: 12, unit: '10^12/L', name: '红细胞 RBC' },
    dog: { low: 5.5, high: 8.5, optimal: 7.0, criticalLow: 3.5, criticalHigh: 10, unit: '10^12/L', name: '红细胞 RBC' },
  },
  hct: {
    cat: { low: 24, high: 45, optimal: 34, criticalLow: 15, criticalHigh: 55, unit: '%', name: '红细胞比容 HCT' },
    dog: { low: 37, high: 55, optimal: 46, criticalLow: 20, criticalHigh: 65, unit: '%', name: '红细胞比容 HCT' },
  },
};

// ─── 评分函数 ──────────────────────────────────────

/** 单个指标评分 (0-100) */
export function scoreIndicator(value: number, range: IndicatorRange): number {
  if (value <= range.criticalLow || value >= range.criticalHigh) {
    // 危急值 → 0-20 分
    return Math.max(0, 20 - Math.abs(value - range.optimal) / (range.criticalHigh - range.optimal) * 40);
  }

  if (value >= range.low && value <= range.high) {
    // 正常范围 → 80-100 分，中位值最近得 100
    const distFromOptimal = Math.abs(value - range.optimal);
    const maxDistInRange = Math.max(range.high - range.optimal, range.optimal - range.low);
    return Math.round(100 - (distFromOptimal / maxDistInRange) * 20);
  }

  // 轻度异常 → 40-79 分
  const distFromNormal = value < range.low
    ? (range.low - value) / (range.low - range.criticalLow)
    : (value - range.high) / (range.criticalHigh - range.high);
  return Math.round(80 - distFromNormal * 40);
}

/** 分类得分 */
export interface CategoryScore {
  name: string;
  weight: number;
  indicators: Array<{ key: string; name: string; value: number | null; score: number | null; unit: string; status: 'normal' | 'mild' | 'severe' | 'critical' | 'unknown' }>;
  totalScore: number | null;   // 该分类加权得分 0-100
}

/** 综合评分 */
export interface HealthScoreResult {
  categories: CategoryScore[];
  overallScore: number | null;  // 综合加权得分 0-100
  grade: string;                // A+/A/B/C/D
  warnings: string[];           // 警告项
}

// ─── 分类定义 ──────────────────────────────────────

interface CategoryDef {
  name: string;
  weight: number;   // 权重（百分比）
  keys: string[];   // 对应指标 key
}

const LAB_CATEGORIES: CategoryDef[] = [
  { name: '肾功能',   weight: 32, keys: ['bun', 'crea'] },
  { name: '血糖+胰腺', weight: 28, keys: ['glu', 'amy'] },
  { name: '血常规',   weight: 30, keys: ['wbc', 'rbc', 'hct'] },
];

/** 所有分类（含体重、年龄），总权重=100% */
const ALL_CATEGORIES: CategoryDef[] = [
  ...LAB_CATEGORIES,
  { name: '体重', weight: 5,  keys: ['weight'] },
  { name: '年龄', weight: 5,  keys: ['age'] },
];

// ─── 体重评分 ──────────────────────────────────────

/** 物种默认理想体重范围 (kg) */
const DEFAULT_WEIGHT_RANGE: Record<string, { min: number; max: number }> = {
  cat: { min: 3.0, max: 5.5 },
  dog: { min: 5.0, max: 25.0 },  // 犬种差异大，默认中等体型
};

/**
 * 体重评分 (0-100)
 * - 在品种理想范围内 → 100
 * - 偏离 10% → 80, 偏离 20% → 50, 偏离 >40% → 20
 */
export function scoreWeight(
  weightKg: number,
  breedRange: { min: number; max: number } | null,
  species: 'cat' | 'dog'
): number {
  const range = breedRange || DEFAULT_WEIGHT_RANGE[species];
  const { min, max } = range;
  const ideal = (min + max) / 2;

  if (weightKg >= min && weightKg <= max) {
    // 正常范围 → 80-100，理想中值得最高分
    const distFromIdeal = Math.abs(weightKg - ideal);
    const maxDist = Math.max(max - ideal, ideal - min);
    return Math.round(100 - (distFromIdeal / (maxDist || 1)) * 20);
  }

  // 偏离理想范围
  const excess = weightKg < min
    ? (min - weightKg) / (min || 1)
    : (weightKg - max) / (max || 1);

  if (excess <= 0.1) return 80;
  if (excess <= 0.2) return 65;
  if (excess <= 0.3) return 50;
  if (excess <= 0.5) return 30;
  return 15;  // 严重偏离（肥胖/消瘦）
}

// ─── 年龄评分 ──────────────────────────────────────

/**
 * 年龄评分 (0-100)
 * 根据物种和年龄段的健康风险曲线
 */
export function scoreAge(ageYears: number, species: 'cat' | 'dog'): number {
  if (species === 'cat') {
    if (ageYears < 0.5)  return 85;   // 幼猫（免疫未完善）
    if (ageYears < 1)    return 90;
    if (ageYears < 7)    return 100;  // 青壮年（黄金期）
    if (ageYears < 10)   return 80;   // 中年
    if (ageYears < 13)   return 60;   // 老年
    if (ageYears < 16)   return 40;   // 高龄
    return 20;                         // 超高龄
  } else {
    // 狗：大型犬衰老更快，简化版取中等曲线
    if (ageYears < 0.5)  return 85;
    if (ageYears < 1)    return 90;
    if (ageYears < 6)    return 100;  // 狗的青壮年较猫短
    if (ageYears < 9)    return 75;
    if (ageYears < 12)   return 55;
    if (ageYears < 15)   return 35;
    return 15;
  }
}

// ─── 品种体重范围查询 ──────────────────────────────

/** 从品种名模糊匹配品种表的理想体重范围 */
export function getBreedWeightRange(
  breed: string | null | undefined,
  species: 'cat' | 'dog'
): { min: number; max: number } | null {
  if (!breed) return null;
  // 由调用方传入已查询的范围，引擎本身不做 DB 查询
  return null;
}

function getStatus(score: number | null): 'normal' | 'mild' | 'severe' | 'critical' | 'unknown' {
  if (score === null) return 'unknown';
  if (score >= 80) return 'normal';
  if (score >= 50) return 'mild';
  if (score >= 25) return 'severe';
  return 'critical';
}

export interface HealthScoreInput {
  species: 'cat' | 'dog';
  /** 化验值: { bun, crea, glu, amy, wbc, rbc, hct } */
  values: Record<string, number | null>;
  /** 体重 (kg) */
  weightKg?: number | null;
  /** 年龄 (岁) */
  ageYears?: number | null;
  /** 品种理想体重范围 (min/max kg) */
  breedRange?: { min: number; max: number } | null;
}

/** 计算综合健康评分 */
export function calculateHealthScore(input: HealthScoreInput): HealthScoreResult {
  const { species, values, weightKg, ageYears, breedRange } = input;
  const categories: CategoryScore[] = [];
  const warnings: string[] = [];
  let totalWeight = 0;
  let weightedSum = 0;

  for (const cat of ALL_CATEGORIES) {
    if (cat.keys[0] === 'weight') {
      // ── 体重评分 ──
      const score = weightKg != null ? scoreWeight(weightKg, breedRange || null, species) : null;
      const status = getStatus(score);
      const name = weightKg != null ? `体重 ${weightKg}kg` : '体重（未录入）';

      if (status === 'critical') warnings.push(`体重严重偏离理想范围`);
      else if (status === 'severe') warnings.push(`体重明显偏离理想范围`);

      categories.push({
        name: cat.name,
        weight: cat.weight,
        indicators: [{ key: 'weight', name, value: weightKg ?? null, score, unit: 'kg', status }],
        totalScore: score
      });

      if (score !== null) { weightedSum += score * cat.weight; totalWeight += cat.weight; }
    } else if (cat.keys[0] === 'age') {
      // ── 年龄评分 ──
      const score = ageYears != null ? scoreAge(ageYears, species) : null;
      const status = getStatus(score);
      const name = ageYears != null
        ? `年龄 ${ageYears.toFixed(1)}岁`
        : '年龄（未录入）';

      if (score !== null && score < 40) warnings.push(`宠物已进入高龄阶段，建议增加体检频率`);

      categories.push({
        name: cat.name,
        weight: cat.weight,
        indicators: [{ key: 'age', name, value: ageYears ?? null, score, unit: '岁', status }],
        totalScore: score
      });

      if (score !== null) { weightedSum += score * cat.weight; totalWeight += cat.weight; }
    } else {
      // ── 化验指标 ──
      const indicators = cat.keys.map(key => {
        const value = values[key] ?? null;
        const rangeData = REFERENCE_RANGES[key];
        if (!rangeData) return { key, name: key, value, score: null, unit: '', status: 'unknown' as const };

        const range = rangeData[species];
        const score = value !== null ? scoreIndicator(value, range) : null;
        const status = getStatus(score);

        if (status === 'critical') {
          warnings.push(`${range.name}: ${value} ${range.unit}（危急值！参考范围 ${range.low}-${range.high} ${range.unit}）`);
        } else if (status === 'severe') {
          warnings.push(`${range.name}: ${value} ${range.unit}（严重偏离，参考范围 ${range.low}-${range.high} ${range.unit}）`);
        }

        return { key, name: range.name, value, score, unit: range.unit, status };
      });

      const validScores = indicators.filter(i => i.score !== null).map(i => i.score!);
      const totalScore = validScores.length > 0
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : null;

      if (totalScore !== null) {
        weightedSum += totalScore * cat.weight;
        totalWeight += cat.weight;
      }

      categories.push({ name: cat.name, weight: cat.weight, indicators, totalScore });
    }
  }

  // 综合得分
  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;

  let grade = '无数据';
  if (overallScore !== null) {
    if (overallScore >= 90) grade = 'A+';
    else if (overallScore >= 80) grade = 'A';
    else if (overallScore >= 65) grade = 'B';
    else if (overallScore >= 50) grade = 'C';
    else grade = 'D';
  }

  return { categories, overallScore, grade, warnings };
}
