import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerIpcHandlers } from './ipc.js';

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
    void win.loadURL('http://localhost:5173');
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow();
      registerIpcHandlers(win);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
