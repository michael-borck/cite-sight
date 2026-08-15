import type { AnalysisResult, ProcessingOptions, ProgressUpdate, ReferenceVerification } from '@michaelborck/cite-sight-core';

declare global {
  interface Window {
    citeSight: {
      analyzeFile: (filePath: string, options: ProcessingOptions) => Promise<AnalysisResult>;
      reverifyReference: (ref: unknown, options: ProcessingOptions) => Promise<ReferenceVerification | null>;
      cacheInfo: () => Promise<{ directory: string; cacheFile: string; cacheEntries: number; cacheBytes: number; dismissalsCount: number }>;
      clearCache: () => Promise<void>;
      clearDismissals: () => Promise<void>;
      revealDataDir: () => Promise<void>;
      loadDismissals: () => Promise<string[]>;
      setDismissal: (contentKey: string, dismissed: boolean) => Promise<void>;
      selectFiles: () => Promise<string[]>;
      selectFolder: () => Promise<string[]>;
      onProgress: (callback: (update: ProgressUpdate) => void) => void;
      onReference: (callback: (data: { verification: ReferenceVerification; index: number; total: number }) => void) => void;
      onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string }) => void) => void;
      onUpdateNotAvailable: (callback: () => void) => void;
      onUpdateProgress: (callback: (progress: { percent: number }) => void) => void;
      onUpdateDownloaded: (callback: () => void) => void;
      onUpdateError: (callback: (message: string) => void) => void;
      downloadUpdate: () => Promise<void>;
      installUpdate: () => Promise<void>;
      getVersion: () => Promise<string>;
      readScreenshot: (filePath: string) => Promise<string | null>;
    };
  }
}

export {};
