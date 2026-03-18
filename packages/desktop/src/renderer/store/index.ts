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
  cancelRequested: boolean;
  progress: ProgressUpdate | null;
  batchIndex: number;
  batchTotal: number;
  results: AnalysisResult[];
  currentResultIndex: number;
  error: string | null;

  // Actions
  setProcessing: (processing: boolean) => void;
  requestCancel: () => void;
  clearCancel: () => void;
  setProgress: (update: ProgressUpdate) => void;
  setBatch: (index: number, total: number) => void;
  addResult: (result: AnalysisResult) => void;
  setCurrentResultIndex: (index: number) => void;
  setError: (error: string | null) => void;
  reset: () => void;
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
  cancelRequested: false,
  progress: null,
  batchIndex: 0,
  batchTotal: 0,
  results: [],
  currentResultIndex: 0,
  error: null,

  addFiles: (paths) => set((s) => {
    const unique = paths.filter((p) => !s.filePaths.includes(p));
    return { filePaths: [...s.filePaths, ...unique], error: null };
  }),
  removeFile: (path) => set((s) => ({ filePaths: s.filePaths.filter((p) => p !== path) })),
  clearFiles: () => set({ filePaths: [], results: [], currentResultIndex: 0, error: null }),
  updateOptions: (opts) => set((s) => ({ options: { ...s.options, ...opts } })),
  setProcessing: (isProcessing) => set({ isProcessing, error: null }),
  requestCancel: () => set({ cancelRequested: true }),
  clearCancel: () => set({ cancelRequested: false }),
  setProgress: (progress) => set({ progress }),
  setBatch: (batchIndex, batchTotal) => set({ batchIndex, batchTotal }),
  addResult: (result) => set((s) => ({ results: [...s.results, result] })),
  setCurrentResultIndex: (currentResultIndex) => set({ currentResultIndex }),
  setError: (error) => set({ error, isProcessing: false, progress: null }),
  reset: () =>
    set({
      filePaths: [],
      options: defaultOptions,
      isProcessing: false,
      cancelRequested: false,
      progress: null,
      batchIndex: 0,
      batchTotal: 0,
      results: [],
      currentResultIndex: 0,
      error: null,
    }),
}));
