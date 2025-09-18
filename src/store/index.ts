import { create } from 'zustand';
import type { AnalysisResults, ProcessingOptions } from '../types';

interface FileWithId {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
}

interface AppState {
  // File management
  files: FileWithId[];
  addFiles: (newFiles: File[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;

  // Processing options
  options: ProcessingOptions;
  updateOptions: (options: Partial<ProcessingOptions>) => void;

  // Analysis state
  isProcessing: boolean;
  processingProgress: number;
  processingMessage: string;
  results: AnalysisResults | null;
  error: string | null;

  // Actions
  setProcessing: (isProcessing: boolean, progress?: number, message?: string) => void;
  setResults: (results: AnalysisResults) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  // UI state
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const defaultOptions: ProcessingOptions = {
  citationStyle: 'auto',
  checkUrls: true,
  checkDoi: true,
  checkWayback: true,
  checkPlagiarism: true,
  checkInText: true,
  processingMode: 'server',
};

export const useStore = create<AppState>((set) => ({
  // Initial state
  files: [],
  options: defaultOptions,
  isProcessing: false,
  processingProgress: 0,
  processingMessage: '',
  results: null,
  error: null,
  activeTab: 'overview',

  // File actions
  addFiles: (newFiles) =>
    set((state) => ({
      files: [
        ...state.files,
        ...newFiles.map((file) => ({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
        })),
      ],
      error: null,
    })),

  removeFile: (id) =>
    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
    })),

  clearFiles: () => set({ files: [], results: null, error: null }),

  // Options actions
  updateOptions: (options) =>
    set((state) => ({
      options: { ...state.options, ...options },
    })),

  // Processing actions
  setProcessing: (isProcessing, progress = 0, message = '') =>
    set({
      isProcessing,
      processingProgress: progress,
      processingMessage: message,
      error: null,
    }),

  setResults: (results) =>
    set({
      results,
      isProcessing: false,
      processingProgress: 100,
      error: null,
    }),

  setError: (error) =>
    set({
      error,
      isProcessing: false,
      processingProgress: 0,
    }),

  reset: () =>
    set({
      files: [],
      options: defaultOptions,
      isProcessing: false,
      processingProgress: 0,
      processingMessage: '',
      results: null,
      error: null,
      activeTab: 'overview',
    }),

  // UI actions
  setActiveTab: (activeTab) => set({ activeTab }),
}));