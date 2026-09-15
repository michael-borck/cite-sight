import type { AnalysisResult, ProcessingOptions, ProgressUpdate, ReferenceVerification } from '@michaelborck/cite-sight-core';
import type { ReviewSession } from '@michaelborck/cite-sight-core/session';
import type { ClaimInstallationStatus, ClaimRequest } from '../shared/claimInstallation';

declare global {
  interface Window {
    citeSight: {
      planBatch: (paths: string[], options: { offline: boolean; claims?: boolean; observedMs?: number }) => Promise<import('@michaelborck/cite-sight-core').BatchPlan>;
      saveBatchCheckpoint: (session: ReviewSession) => Promise<void>;
      loadBatchCheckpoint: () => Promise<ReviewSession | null>;
      clearBatchCheckpoint: () => Promise<void>;
      setLocalOnly: (value: boolean) => Promise<void>;
      setDocumentsOpen: (value: boolean) => Promise<void>;
      getClaimInstallation: () => Promise<ClaimInstallationStatus>;
      calibrateClaimModel: () => Promise<ClaimInstallationStatus>;
      installClaimModel: (id: string) => Promise<ClaimInstallationStatus>;
      importClaimModel: (id: string) => Promise<ClaimInstallationStatus>;
      removeClaimModel: () => Promise<ClaimInstallationStatus>;
      cancelClaimInstall: () => Promise<void>;
      onClaimInstallProgress: (callback: (progress: Partial<ClaimInstallationStatus>) => void) => () => void;
      selectClaimFile: (kind: 'source') => Promise<string | null>;
      checkClaims: (path: string, config: ClaimRequest, options: ProcessingOptions) => Promise<AnalysisResult>;
      cancelClaims: () => Promise<void>;
      onClaimCheckpoint: (callback: (data: { path: string; result: AnalysisResult }) => void) => () => void;
      saveSession: (session: ReviewSession) => Promise<string | null>;
      openSession: () => Promise<ReviewSession | null>;
      getPathForFile: (file: File) => string;
      analyzeFile: (filePath: string, options: ProcessingOptions) => Promise<AnalysisResult>;
      reverifyReference: (ref: unknown, options: ProcessingOptions) => Promise<ReferenceVerification | null>;
      checkForUpdates: () => Promise<{ updateAvailable: boolean; version?: string; error?: boolean }>;
      cacheInfo: () => Promise<{ directory: string; cacheFile: string; cacheEntries: number; cacheBytes: number; dismissalsCount: number }>;
      clearCache: () => Promise<void>;
      clearDismissals: () => Promise<void>;
      revealDataDir: () => Promise<void>;
      loadDismissals: () => Promise<string[]>;
      setDismissal: (contentKey: string, dismissed: boolean) => Promise<void>;
      selectFiles: () => Promise<string[]>;
      selectFolder: () => Promise<string[]>;
      onProgress: (callback: (update: ProgressUpdate) => void) => () => void;
      onReference: (callback: (data: { verification: ReferenceVerification; index: number; total: number }) => void) => () => void;
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
