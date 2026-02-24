import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';

export function initAutoUpdater(win: BrowserWindow): void {
  // Don't check for updates during development
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('cite-sight:update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    win.webContents.send('cite-sight:update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send('cite-sight:update-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('cite-sight:update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    win.webContents.send('cite-sight:update-error', err.message);
  });

  // Renderer can request to download or install
  ipcMain.handle('cite-sight:download-update', () => {
    return autoUpdater.downloadUpdate();
  });

  ipcMain.handle('cite-sight:install-update', () => {
    autoUpdater.quitAndInstall();
  });

  // Check for updates after a short delay so the window is ready
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silently fail — offline or no releases yet
    });
  }, 3000);
}
