import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AnalysisResult, ProcessingOptions, ProgressUpdate, ReferenceVerification } from '@michaelborck/cite-sight-core';

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

  // Live per-reference streaming for the file currently being analysed.
  streamingRefs: ReferenceVerification[];
  streamingTotal: number;

  // Actions
  setProcessing: (processing: boolean) => void;
  requestCancel: () => void;
  clearCancel: () => void;
  setProgress: (update: ProgressUpdate) => void;
  setBatch: (index: number, total: number) => void;
  addResult: (result: AnalysisResult) => void;
  setCurrentResultIndex: (index: number) => void;
  setError: (error: string | null) => void;
  addStreamingRef: (verification: ReferenceVerification, total: number) => void;
  resetStreaming: () => void;
  reset: () => void;
}

const defaultOptions: ProcessingOptions = {
  citationStyle: 'auto',
  checkUrls: true,
  checkDoi: true,
  checkInText: true,
  screenshotUrls: true,
};

// Analysis options are the only slice worth keeping between launches — above
// all the contact email and Semantic Scholar key, which are tedious to retype
// and directly determine how many references verify. Everything else (files,
// results, progress) is per-session and deliberately starts empty.
const OPTIONS_STORAGE_KEY = 'cite-sight-options';

export const useStore = create<AppState>()(persist((set) => ({
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
  streamingRefs: [],
  streamingTotal: 0,

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
  addStreamingRef: (verification, total) =>
    set((s) => ({ streamingRefs: [...s.streamingRefs, verification], streamingTotal: total || s.streamingTotal })),
  resetStreaming: () => set({ streamingRefs: [], streamingTotal: 0 }),
  // "Start over" clears the session, not the user's settings — resetting
  // `options` here would wipe the saved email and API key on every new batch.
  reset: () =>
    set({
      filePaths: [],
      isProcessing: false,
      cancelRequested: false,
      progress: null,
      batchIndex: 0,
      batchTotal: 0,
      results: [],
      currentResultIndex: 0,
      error: null,
      streamingRefs: [],
      streamingTotal: 0,
    }),
}), {
  name: OPTIONS_STORAGE_KEY,
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({ options: s.options }),
  // Fold the stored options over the current defaults rather than replacing
  // them, so an option added in a later release still gets its default value
  // for users who already have something saved.
  merge: (persisted, current) => ({
    ...current,
    options: { ...defaultOptions, ...((persisted as { options?: Partial<ProcessingOptions> } | undefined)?.options ?? {}) },
  }),
}));
