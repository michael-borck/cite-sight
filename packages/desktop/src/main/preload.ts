import { contextBridge, ipcRenderer } from 'electron';
import type { ProcessingOptions, AnalysisResult, ProgressUpdate } from '@michaelborck/cite-sight-core';

contextBridge.exposeInMainWorld('citeSight', {
  analyzeFile: (filePath: string, options: ProcessingOptions): Promise<AnalysisResult> => {
    return ipcRenderer.invoke('cite-sight:analyze', filePath, options) as Promise<AnalysisResult>;
  },

  selectFiles: (): Promise<string[]> => {
    return ipcRenderer.invoke('cite-sight:select-files') as Promise<string[]>;
  },

  selectFolder: (): Promise<string[]> => {
    return ipcRenderer.invoke('cite-sight:select-folder') as Promise<string[]>;
  },

  onProgress: (callback: (update: ProgressUpdate) => void): void => {
    ipcRenderer.on('cite-sight:progress', (_event, update: ProgressUpdate) => {
      callback(update);
    });
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
