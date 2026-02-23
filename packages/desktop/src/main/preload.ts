import { contextBridge, ipcRenderer } from 'electron';
import type { ProcessingOptions, AnalysisResult, ProgressUpdate } from '@cite-sight/core';

contextBridge.exposeInMainWorld('citeSight', {
  analyzeFile: (filePath: string, options: ProcessingOptions): Promise<AnalysisResult> => {
    return ipcRenderer.invoke('cite-sight:analyze', filePath, options) as Promise<AnalysisResult>;
  },

  selectFiles: (): Promise<string[]> => {
    return ipcRenderer.invoke('cite-sight:select-files') as Promise<string[]>;
  },

  onProgress: (callback: (update: ProgressUpdate) => void): void => {
    ipcRenderer.on('cite-sight:progress', (_event, update: ProgressUpdate) => {
      callback(update);
    });
  },
});
