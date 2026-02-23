import { BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCREENSHOT_TIMEOUT_MS = 15_000;

export async function takeScreenshot(url: string): Promise<string> {
  let win: BrowserWindow | null = null;

  try {
    win = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        javascript: true,
      },
    });

    await Promise.race([
      new Promise<void>((resolve, reject) => {
        win!.webContents.once('did-finish-load', resolve);
        win!.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
          reject(new Error(`Page load failed (${errorCode}): ${errorDescription}`));
        });
        void win!.loadURL(url);
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Screenshot timed out after ${SCREENSHOT_TIMEOUT_MS / 1000}s for: ${url}`)),
          SCREENSHOT_TIMEOUT_MS,
        ),
      ),
    ]);

    const image = await win.webContents.capturePage();
    const png = image.toPNG();

    // Build a safe filename from the URL
    const safeName = url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 100);
    const fileName = `cite-sight-screenshot-${safeName}-${Date.now()}.png`;
    const filePath = join(tmpdir(), fileName);

    await writeFile(filePath, png);
    return filePath;
  } finally {
    if (win && !win.isDestroyed()) {
      win.close();
    }
  }
}
