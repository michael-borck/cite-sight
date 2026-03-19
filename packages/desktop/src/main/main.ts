import { app, BrowserWindow } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc.js';
import { initAutoUpdater } from './updater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): BrowserWindow {
  const preloadPath = join(__dirname, 'preload.js');

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
      for (let i = 0; i < 10; i++) {
        try {
          await win.loadURL(devUrl);
          return;
        } catch {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      // Fallback: show error in the window
      win.loadURL(`data:text/html,<h2>Could not connect to Vite dev server at ${devUrl}</h2><p>Start it with: <code>cd packages/desktop && npx vite</code></p>`);
    };
    void loadDev();
    win.webContents.openDevTools();
  } else {
    const indexPath = join(__dirname, '..', 'renderer', 'index.html');
    void win.loadFile(indexPath);
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  return win;
}

app.whenReady().then(() => {
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
