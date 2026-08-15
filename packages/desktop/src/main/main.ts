import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc.js';
import { loadLookupCache } from './cacheStore.js';
import { initAutoUpdater } from './updater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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

app.whenReady().then(() => {
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
