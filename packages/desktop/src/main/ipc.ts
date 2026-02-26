import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import { analyzePipeline } from '@michaelborck/cite-sight-core';
import { takeScreenshot } from './screenshot';
import type { ProcessingOptions } from '@michaelborck/cite-sight-core';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('cite-sight:get-version', () => app.getVersion());
  // Handle document analysis
  ipcMain.handle(
    'cite-sight:analyze',
    async (_event, filePath: string, options: ProcessingOptions) => {
      const result = await analyzePipeline(filePath, options, (update) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('cite-sight:progress', update);
        }
      });
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

  // Handle URL screenshot capture
  ipcMain.handle('cite-sight:take-screenshot', async (_event, url: string) => {
    return takeScreenshot(url);
  });
}
