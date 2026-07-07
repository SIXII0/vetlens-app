/** 引擎核心类型定义 */

// ---- 输入类型 ----

export interface BillItem {
  rawName: string;
  amount: number;
  category?: '检查' | '药品' | '耗材' | '手术' | '其他';
}

export interface AnalysisInput {
  items: BillItem[];
  city?: string;
  hospitalName?: string;
  hospitalType?: '连锁' | '社区诊所' | '教学医院';
  petId?: string;
  visitDate?: string;
  totalAmount?: number;
}

// ---- 知识库匹配结果 ----

export interface TermMatch {
  termId: string;
  name: string;
  aliases: string[];
  category: string;
  medicalExplain: string;
  plainExplain: string;
  necessityHint: '🔴 必做' | '🟡 建议做' | '🟢 可选';
  confidence: number; // 0-1
  matchMethod: 'fts5' | 'levenshtein' | 'llm_fallback';
}

export interface PriceAssessment {
  level: '合理' | '略高' | '偏高';
  userPrice: number;
  p10: number;
  p50: number;
  p90: number;
  city: string;
  sampleCount: number;
  message: string;
}

// ---- 输出类型 ----

export interface AnalyzedItem {
  rawName: string;
  amount: number;
  category: string;
  termMatch: TermMatch | null;
  priceAssessment: PriceAssessment | null;
  necessity: string;
  explanation: string;
  isUnknown: boolean;
  unknownReason?: string;
}

export interface AnalysisResult {
  id: string;
  items: AnalyzedItem[];
  totalAmount: number;
  city: string;
  hospitalName?: string;
  visitDate?: string;
  summary: AnalysisSummary;
}

export interface AnalysisSummary {
  totalItems: number;
  matchedItems: number;
  unknownItems: number;
  priceOkItems: number;
  priceHighItems: number;
  priceWarningItems: number;
  overallAssessment: string;
}

// ---- 保险预检 ----

export interface InsurancePolicy {
  id: string;
  company: string;
  productName: string;
  policyNumber?: string;
  effectiveDate: string;
  expiryDate: string;
  waitingPeriod: number;
  deductible: number;
  reimbursementRate: number;
  annualLimit: number;
  exclusions: string[];
  coverageItems: string[];
}

export interface InsuranceCheckItem {
  itemName: string;
  amount: number;
  coverable: boolean;
  reason: string;
  estimatedPayout: number;
}

export interface InsuranceCheckResult {
  policy: InsurancePolicy;
  items: InsuranceCheckItem[];
  totalCoverable: number;
  totalEstimatedPayout: number;
  missingDocuments: string[];
  warnings: string[];
}

// ---- 医院推荐 ----

export interface HospitalInfo {
  id: string;
  name: string;
  city: string;
  district?: string;
  address?: string;
  phone?: string;
  type: '连锁' | '社区诊所' | '教学医院';
  transparencyScore: number; // 0-5
  rating: number; // 0-5
  priceLevel: '低' | '中' | '高';
  lat?: number;
  lng?: number;
  distance?: number; // km
}

// ---- 花费统计 (方案1+3) ----

export interface MonthlyTrend { month: number; total: number; count: number; }
export interface CategoryBreakdown { category: string; total: number; count: number; pct: number; }

export interface InsuranceNetSpending {
  hasPolicy: boolean; policyId?: string; company?: string; productName?: string;
  annualLimit: number; deductible: number; reimbursementRate: number;
  totalSpent: number; estimatedPayout: number; netOutOfPocket: number;
  limitUsedPct: number; deductibleMet: boolean;
}

export interface SpendingStats {
  petId: string; petName: string; year: number;
  annualTotal: number; visitCount: number; avgPerVisit: number;
  monthlyTrend: MonthlyTrend[]; categoryBreakdown: CategoryBreakdown[];
  insurance: InsuranceNetSpending | null;
}

// ---- 知识库源接口（预留扩展） ----

export interface KnowledgeSource {
  id: string;
  name: string;
  version: string;
  priority: number;

  searchTerms(query: string, limit?: number): Promise<TermMatch[]>;
  getPrice(termId: string, city: string, hospitalType?: string): Promise<PriceAssessment | null>;
  getDrug(termId: string): Promise<unknown>;
  getBreedDiseases(species: string, breed: string): Promise<unknown[]>;

  onLoad(): Promise<void>;
  onUpdate(): Promise<void>;
  healthCheck(): Promise<boolean>;
}
