import type { AnalysisResult, ProcessingOptions, ProgressUpdate } from '@cite-sight/core';

declare global {
  interface Window {
    citeSight: {
      analyzeFile: (filePath: string, options: ProcessingOptions) => Promise<AnalysisResult>;
      selectFiles: () => Promise<string[]>;
      onProgress: (callback: (update: ProgressUpdate) => void) => void;
    };
  }
}

export {};
