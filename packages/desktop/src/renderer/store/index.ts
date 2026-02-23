import { create } from 'zustand';
import type { AnalysisResult, ProcessingOptions, ProgressUpdate } from '@michaelborck/cite-sight-core';

interface AppState {
  // Files
  filePaths: string[];
  addFiles: (paths: string[]) => void;
  removeFile: (path: string) => void;
  clearFiles: () => void;

  // Options
  options: ProcessingOptions;
  updateOptions: (opts: Partial<ProcessingOptions>) => void;

  // Processing
  isProcessing: boolean;
  progress: ProgressUpdate | null;
  results: AnalysisResult | null;
  error: string | null;

  // Actions
  setProcessing: (processing: boolean) => void;
  setProgress: (update: ProgressUpdate) => void;
  setResults: (results: AnalysisResult) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  // UI
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const defaultOptions: ProcessingOptions = {
  citationStyle: 'auto',
  checkUrls: true,
  checkDoi: true,
  checkInText: true,
  screenshotUrls: true,
};

export const useStore = create<AppState>((set) => ({
  filePaths: [],
  options: defaultOptions,
  isProcessing: false,
  progress: null,
  results: null,
  error: null,
  activeTab: 'overview',

  addFiles: (paths) => set((s) => ({ filePaths: [...s.filePaths, ...paths], error: null })),
  removeFile: (path) => set((s) => ({ filePaths: s.filePaths.filter((p) => p !== path) })),
  clearFiles: () => set({ filePaths: [], results: null, error: null }),
  updateOptions: (opts) => set((s) => ({ options: { ...s.options, ...opts } })),
  setProcessing: (isProcessing) => set({ isProcessing, error: null }),
  setProgress: (progress) => set({ progress }),
  setResults: (results) => set({ results, isProcessing: false, progress: null }),
  setError: (error) => set({ error, isProcessing: false, progress: null }),
  reset: () =>
    set({
      filePaths: [],
      options: defaultOptions,
      isProcessing: false,
      progress: null,
      results: null,
      error: null,
      activeTab: 'overview',
    }),
  setActiveTab: (activeTab) => set({ activeTab }),
}));
