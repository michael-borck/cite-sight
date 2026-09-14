import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ProcessingOptions, AnalysisResult, ProgressUpdate, ReferenceVerification, ReviewSession } from '@michaelborck/cite-sight-core';

contextBridge.exposeInMainWorld('citeSight', {
  saveSession: (session: ReviewSession): Promise<string | null> => ipcRenderer.invoke('cite-sight:save-session', session),
  openSession: (): Promise<ReviewSession | null> => ipcRenderer.invoke('cite-sight:open-session'),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  analyzeFile: (filePath: string, options: ProcessingOptions): Promise<AnalysisResult> => {
    return ipcRenderer.invoke('cite-sight:analyze', filePath, options) as Promise<AnalysisResult>;
  },

  reverifyReference: (ref: unknown, options: ProcessingOptions): Promise<ReferenceVerification | null> => {
    return ipcRenderer.invoke('cite-sight:reverify', ref, options) as Promise<ReferenceVerification | null>;
  },

  checkForUpdates: (): Promise<{ updateAvailable: boolean; version?: string; error?: boolean }> =>
    ipcRenderer.invoke('cite-sight:check-updates') as Promise<{ updateAvailable: boolean; version?: string; error?: boolean }>,
  cacheInfo: (): Promise<unknown> => ipcRenderer.invoke('cite-sight:cache-info'),
  clearCache: (): Promise<void> => ipcRenderer.invoke('cite-sight:clear-cache') as Promise<void>,
  clearDismissals: (): Promise<void> => ipcRenderer.invoke('cite-sight:clear-dismissals') as Promise<void>,
  revealDataDir: (): Promise<void> => ipcRenderer.invoke('cite-sight:reveal-data-dir') as Promise<void>,

  loadDismissals: (): Promise<string[]> => {
    return ipcRenderer.invoke('cite-sight:load-dismissals') as Promise<string[]>;
  },

  setDismissal: (contentKey: string, dismissed: boolean): Promise<void> => {
    return ipcRenderer.invoke('cite-sight:set-dismissal', contentKey, dismissed) as Promise<void>;
  },

  selectFiles: (): Promise<string[]> => {
    return ipcRenderer.invoke('cite-sight:select-files') as Promise<string[]>;
  },

  selectFolder: (): Promise<string[]> => {
    return ipcRenderer.invoke('cite-sight:select-folder') as Promise<string[]>;
  },

  onProgress: (callback: (update: ProgressUpdate) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, update: ProgressUpdate) => callback(update);
    ipcRenderer.on('cite-sight:progress', listener);
    return () => ipcRenderer.removeListener('cite-sight:progress', listener);
  },

  onReference: (callback: (data: { verification: ReferenceVerification; index: number; total: number }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { verification: ReferenceVerification; index: number; total: number }) => callback(data);
    ipcRenderer.on('cite-sight:reference', listener);
    return () => ipcRenderer.removeListener('cite-sight:reference', listener);
  },

  // Auto-update API
  onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string }) => void): void => {
    ipcRenderer.on('cite-sight:update-available', (_event, info) => callback(info));
  },
  onUpdateNotAvailable: (callback: () => void): void => {
    ipcRenderer.on('cite-sight:update-not-available', () => callback());
  },
  onUpdateProgress: (callback: (progress: { percent: number }) => void): void => {
    ipcRenderer.on('cite-sight:update-progress', (_event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback: () => void): void => {
    ipcRenderer.on('cite-sight:update-downloaded', () => callback());
  },
  onUpdateError: (callback: (message: string) => void): void => {
    ipcRenderer.on('cite-sight:update-error', (_event, message) => callback(message));
  },
  downloadUpdate: (): Promise<void> => {
    return ipcRenderer.invoke('cite-sight:download-update') as Promise<void>;
  },
  installUpdate: (): Promise<void> => {
    return ipcRenderer.invoke('cite-sight:install-update') as Promise<void>;
  },

  getVersion: (): Promise<string> => {
    return ipcRenderer.invoke('cite-sight:get-version') as Promise<string>;
  },

  readScreenshot: (filePath: string): Promise<string | null> => {
    return ipcRenderer.invoke('cite-sight:read-screenshot', filePath) as Promise<string | null>;
  },
});
