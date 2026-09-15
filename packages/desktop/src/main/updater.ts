import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import type { BrowserWindow } from 'electron';
import { app, ipcMain } from 'electron';
import { desktopTask, isLocalOnly, onlineOperation } from './privacy.js';

let win: BrowserWindow | undefined;
let initialized = false;

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

export function initAutoUpdater(window: BrowserWindow): void {
  win = window;
  // Don't check for updates during development. NB: this must be
  // app.isPackaged — packaged Electron apps do NOT set NODE_ENV, so the old
  // `!process.env.NODE_ENV` guard returned early in every production build
  // and the auto-updater never ran for anyone (found 2026-08-16 when a
  // relaunch of 0.8.23 showed no banner despite newer published releases).
  if (!app.isPackaged || initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    send('cite-sight:update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    send('cite-sight:update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    send('cite-sight:update-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    send('cite-sight:update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    send('cite-sight:update-error', err.message);
  });

  // Renderer can request to download or install
  ipcMain.handle('cite-sight:download-update', () => {
    return onlineOperation(() => autoUpdater.downloadUpdate());
  });

  ipcMain.handle('cite-sight:install-update', () => {
    return desktopTask(isLocalOnly(), async () => { autoUpdater.quitAndInstall(); });
  });

  // Manual "Check for updates" from the renderer. Returns whether a newer
  // version was found so the UI can say "you're up to date" — the automatic
  // path stays silent on no-update, but a click deserves an answer.
  ipcMain.handle('cite-sight:check-updates', async () => {
    try {
      const result = await onlineOperation(() => autoUpdater.checkForUpdates());
      const latest = result?.updateInfo?.version;
      return { updateAvailable: Boolean(latest && latest !== autoUpdater.currentVersion.version), version: latest };
    } catch {
      return { updateAvailable: false, error: true };
    }
  });

  // Updates are manual. No background connection can overlap a private run.
}
