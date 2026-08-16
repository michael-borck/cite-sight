import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
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

  // Manual "Check for updates" from the renderer. Returns whether a newer
  // version was found so the UI can say "you're up to date" — the automatic
  // path stays silent on no-update, but a click deserves an answer.
  ipcMain.handle('cite-sight:check-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      const latest = result?.updateInfo?.version;
      return { updateAvailable: Boolean(latest && latest !== autoUpdater.currentVersion.version), version: latest };
    } catch {
      return { updateAvailable: false, error: true };
    }
  });

  const check = () =>
    autoUpdater.checkForUpdates().catch(() => {
      // Silently fail — offline or no releases yet
    });

  // Check for updates after a short delay so the window is ready, then
  // every four hours — long-running sessions (the app left open across a
  // marking day) would otherwise never learn a release shipped.
  setTimeout(check, 3000);
  setInterval(check, 4 * 60 * 60 * 1000);
}
