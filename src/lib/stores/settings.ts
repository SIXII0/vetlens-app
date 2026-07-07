import { writable } from 'svelte/store';

export interface AppSettings {
  defaultCity: string;
  llmProvider: 'none' | 'claude' | 'ollama' | 'openai';
  autoUploadUnknown: boolean;
  llmEnhanceEnabled: boolean;
}

const defaultSettings: AppSettings = {
  defaultCity: '北京',
  llmProvider: 'none',
  autoUploadUnknown: false,
  llmEnhanceEnabled: false
};

// 从 localStorage 读取设置
function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return defaultSettings;
  try {
    const stored = localStorage.getItem('vetlens-settings');
    if (stored) return { ...defaultSettings, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return defaultSettings;
}

export const settings = writable<AppSettings>(loadSettings());

// 保存到 localStorage
settings.subscribe((value) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('vetlens-settings', JSON.stringify(value));
  }
});
