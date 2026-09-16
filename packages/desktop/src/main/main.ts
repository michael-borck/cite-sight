import { app, BrowserWindow, Menu, shell, dialog } from 'electron';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc.js';
import { loadLookupCache } from './cacheStore.js';
import { initAutoUpdater, menuUpdateCheck } from './updater.js';
import { allowRendererRequest, isLocalOnly } from './privacy.js';
import { HELP_TOPICS, ACKNOWLEDGEMENTS, HELP_FOOTER } from '@michaelborck/cite-sight-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// A marking session must never be interrupted by a native crash dialog for a
// transient async failure (a provider request timing out, for example). Log
// these instead; the analysis itself already reports failed lookups per
// reference as 'unverified'. Deliberate quit paths still terminate normally.
process.on('unhandledRejection', (reason) => {
  console.error('[cite-sight] Unhandled rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[cite-sight] Uncaught exception:', error);
});

function createWindow(): BrowserWindow {
  const preloadPath = join(__dirname, 'preload.js');
  const indexPath = join(__dirname, '..', 'renderer', 'index.html');

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'default',
    show: false,
  });
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !allowRendererRequest(details.url, isDev) });
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocalOnly() && /^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!allowRendererRequest(url, isDev)) event.preventDefault();
  });

  if (isDev) {
    const devUrl = 'http://localhost:5173';
    // Retry connecting to Vite dev server (it may still be starting)
    const loadDev = async () => {
      // Give Vite time to come up when it is the only option; cut the wait
      // short when a built renderer is sitting there ready to use.
      const attempts = existsSync(indexPath) ? 3 : 10;
      for (let i = 0; i < attempts; i++) {
        try {
          await win.loadURL(devUrl);
          return;
        } catch {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      // No dev server. `npm start` builds the renderer and then runs
      // `electron .`, which is unpackaged and so lands here — fall back to that
      // build rather than stranding the user on an error page.
      if (existsSync(indexPath)) {
        console.log(`[main] No dev server at ${devUrl}; loading built renderer from ${indexPath}`);
        void win.loadFile(indexPath);
        return;
      }
      win.loadURL(`data:text/html,<h2>Could not connect to Vite dev server at ${devUrl}</h2><p>Start it with: <code>cd packages/desktop && npx vite</code> — or build the renderer with <code>npm run build</code>.</p>`);
    };
    void loadDev();
    win.webContents.openDevTools();
  } else {
    void win.loadFile(indexPath);
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  return win;
}

function showTopicDialog(title: string, body: string): void {
  const focused = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  void dialog.showMessageBox(focused, { type: 'info', title, message: title, detail: body, buttons: ['OK'] });
}

function buildApplicationMenu(): void {
  const isMac = process.platform === 'darwin';
  const aboutBody = [
    'CiteSight checks student citations: reference verification against open scholarly databases, cross-reference matching with typo-tolerant suggestions, and an experimental local claim-evidence review.',
    '',
    'Every finding is a suggestion for the marker; the final academic judgement is yours.',
  ].join('\n');
  const acknowledgements = ACKNOWLEDGEMENTS.map((a) => `${a.name} — ${a.what}`).join('\n');
  const rateLimits = HELP_TOPICS.find((t) => t.id === 'rate-limits')!.body;
  const evidence = HELP_TOPICS.find((t) => t.id === 'evidence')!.body;

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Help',
      submenu: [
        {
          label: 'About CiteSight',
          click: () => showTopicDialog('About CiteSight', `${aboutBody}\n\n${HELP_FOOTER}\n\nAcknowledgements:\n${acknowledgements}`),
        },
        { type: 'separator' },
        { label: 'Rate Limits & Pacing', click: () => showTopicDialog('Rate limits and pacing', rateLimits) },
        { label: 'Where Claim Evidence Comes From', click: () => showTopicDialog('Where claim evidence comes from', evidence) },
        { type: 'separator' },
        {
          label: 'Online Documentation',
          click: () => { if (!isLocalOnly()) void shell.openExternal('https://github.com/michael-borck/cite-sight#readme'); },
        },
        { type: 'separator' },
        { label: 'Check for Updates…', click: () => { void menuUpdateCheck(); } },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  void aboutBody; void acknowledgements;
}

app.whenReady().then(() => {
  buildApplicationMenu();
  loadLookupCache();
  const mainWindow = createWindow();
  registerIpcHandlers(mainWindow);
  initAutoUpdater(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow();
      registerIpcHandlers(win);
      initAutoUpdater(win);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
