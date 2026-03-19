import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import { analyzePipeline } from '@michaelborck/cite-sight-core';
import { takeScreenshot } from './screenshot.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { ProcessingOptions, AnalysisResult } from '@michaelborck/cite-sight-core';

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

/** Recursively collect supported files from a directory. */
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('cite-sight:get-version', () => app.getVersion());

  // Handle document analysis (with optional post-analysis screenshots)
  ipcMain.handle(
    'cite-sight:analyze',
    async (_event, filePath: string, options: ProcessingOptions) => {
      const result: AnalysisResult = await analyzePipeline(filePath, options, (update) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('cite-sight:progress', update);
        }
      });

      // Take screenshots of live URLs if requested
      if (options.screenshotUrls && result.references?.verifications) {
        for (const v of result.references.verifications) {
          if (v.urlCheck?.url && v.urlCheck.status === 'live') {
            try {
              v.urlCheck.screenshotPath = await takeScreenshot(v.urlCheck.url);
            } catch {
              // Skip failed screenshots — non-critical
            }
          }
        }
      }

      return result;
    },
  );

  // Handle native file dialog
  ipcMain.handle('cite-sight:select-files', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Documents',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Documents',
          extensions: ['pdf', 'docx', 'txt', 'md'],
        },
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'Word Documents', extensions: ['docx'] },
        { name: 'Text Files', extensions: ['txt', 'md'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (canceled) {
      return [];
    }
    return filePaths;
  });

  // Handle folder selection — collect all supported files recursively
  ipcMain.handle('cite-sight:select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Folder',
      properties: ['openDirectory'],
    });

    if (canceled || filePaths.length === 0) {
      return [];
    }

    return collectFiles(filePaths[0]);
  });

  // Handle URL screenshot capture
  ipcMain.handle('cite-sight:take-screenshot', async (_event, url: string) => {
    return takeScreenshot(url);
  });

  // Read a screenshot file and return as data URL for renderer use
  ipcMain.handle('cite-sight:read-screenshot', (_event, filePath: string) => {
    if (!existsSync(filePath)) return null;
    const data = readFileSync(filePath);
    return `data:image/png;base64,${data.toString('base64')}`;
  });
}
