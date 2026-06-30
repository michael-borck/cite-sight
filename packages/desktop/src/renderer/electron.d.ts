import type { AnalysisResult, ProcessingOptions, ProgressUpdate, ReferenceVerification } from '@michaelborck/cite-sight-core';

declare global {
  interface Window {
    citeSight: {
      analyzeFile: (filePath: string, options: ProcessingOptions) => Promise<AnalysisResult>;
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
