import { writable } from 'svelte/store';

export interface AnalysisState {
  loading: boolean;
  step: 'upload' | 'ocr' | 'review' | 'result' | 'error';
  ocrText: string;
  ocrStructured: {
    hospitalName?: string;
    date?: string;
    items: Array<{ name: string; amount: number | null; line: string }>;
    totalAmount?: number;
  } | null;
  analysisResult: Record<string, unknown> | null;
  error: string | null;
  recordId: string | null;
}

export const analysisState = writable<AnalysisState>({
  loading: false,
  step: 'upload',
  ocrText: '',
  ocrStructured: null,
  analysisResult: null,
  error: null,
  recordId: null
});

export function resetAnalysis() {
  analysisState.set({
    loading: false,
    step: 'upload',
    ocrText: '',
    ocrStructured: null,
    analysisResult: null,
    error: null,
    recordId: null
  });
}
