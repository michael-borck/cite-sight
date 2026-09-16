import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import type { BrowserWindow } from 'electron';
import { app, dialog, ipcMain } from 'electron';
import { desktopTask, isLocalOnly, onlineOperation } from './privacy.js';

let win: BrowserWindow | undefined;
let initialized = false;
let checkInFlight = false;

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

  // Notification-only background check: shortly after launch, then daily.
  // It can only *tell* the user an update exists (autoDownload stays false) —
  // downloading and installing always need an explicit click. Each tick
  // re-checks the guards, so a check never runs in local-only mode, during
  // analysis, or while another online operation is in flight.
  const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const FIRST_CHECK_DELAY_MS = 60 * 1000;
  const backgroundCheck = async (): Promise<void> => {
    if (checkInFlight || !app.isPackaged) return;
    if (!win || win.isDestroyed()) return;
    if (isLocalOnly()) return;
    checkInFlight = true;
    try {
      // onlineOperation refuses while a task is running or local-only is on,
      // so this can never overlap a marking run or an offline session.
      await onlineOperation(() => autoUpdater.checkForUpdates());
    } catch {
      // Offline, local-only, mid-task — silently wait for the next tick.
    } finally {
      checkInFlight = false;
    }
  };
  setTimeout(backgroundCheck, FIRST_CHECK_DELAY_MS);
  setInterval(backgroundCheck, UPDATE_CHECK_INTERVAL_MS);
}

/** Menu-invoked check: same guards as the background check, and the existing
 *  update-available banner is the notification. */
export async function menuUpdateCheck(): Promise<void> {
  if (!app.isPackaged || !win || win.isDestroyed()) return;
  const show = (message: string, detail?: string): void => {
    void dialog.showMessageBox(win!, { type: 'info', message, detail, buttons: ['OK'] });
  };
  if (isLocalOnly()) {
    show('Update checks are disabled in Local-only mode', 'Untick Local-only mode under Settings, then check again.');
    return;
  }
  if (checkInFlight) return;
  checkInFlight = true;
  try {
    const result = await onlineOperation(() => autoUpdater.checkForUpdates());
    const latest = result?.updateInfo?.version;
    const updateAvailable = Boolean(latest && latest !== autoUpdater.currentVersion.version);
    if (!updateAvailable) {
      show(`You're on the latest version (${autoUpdater.currentVersion.version})`, 'CiteSight checked for updates just now.');
      return;
    }
    // The update-available banner is already up; the dialog offers to skip ahead.
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      message: `Version ${latest} is available`,
      detail: `You are running ${autoUpdater.currentVersion.version}. Download it now? The update is installed when CiteSight next restarts.`,
      buttons: ['Download now', 'Later'], defaultId: 0, cancelId: 1,
    });
    if (response === 0) {
      await onlineOperation(() => autoUpdater.downloadUpdate());
      // 'update-downloaded' fires the Restart banner when it lands.
    }
  } catch {
    show('Could not check for updates', 'You may be offline, or an analysis or another check is in progress. Try again shortly.');
  } finally {
    checkInFlight = false;
  }
}

