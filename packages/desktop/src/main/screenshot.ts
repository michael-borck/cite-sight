import { BrowserWindow, session } from 'electron';
import { isPrivateUrl, httpFetch } from '@michaelborck/cite-sight-core';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCREENSHOT_TIMEOUT_MS = 15_000;

export async function takeScreenshot(url: string): Promise<string> {
  // The URL comes from an untrusted uploaded document. Loading it in a real
  // browser window is an SSRF sink — block private/internal addresses and
  // non-http(s) schemes (file://, etc.) before it ever reaches loadURL.
  if (isPrivateUrl(url)) {
    throw new Error(`Refusing to screenshot a private or non-web URL: ${url}`);
  }

  let win: BrowserWindow | null = null;
  // Route documents and subresources through the same DNS-pinned transport as
  // analysis. A separate, non-persistent session contains no user cookies.
  const screenshotSession = session.fromPartition(`screenshot-${randomUUID()}`);
  for (const scheme of ['http', 'https']) {
    screenshotSession.protocol.handle(scheme, async (request) => {
      try {
        // Let Chromium follow redirects through these handlers so document
        // URLs and relative assets retain their normal browser semantics.
        const response = await httpFetch(request.url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
        const headers = new Headers(response.headers);
        // fetch has already decompressed the body.
        headers.delete('content-encoding');
        headers.delete('content-length');
        return new Response(response.body, { status: response.status, headers });
      } catch {
        return new Response('Resource unavailable', { status: 502 });
      }
    });
  }
  screenshotSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  screenshotSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !/^(https?:|data:)/.test(details.url) });
  });
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    win = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        javascript: false,
        session: screenshotSession,
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    await Promise.race([
      new Promise<void>((resolve, reject) => {
        win!.webContents.once('did-finish-load', resolve);
        win!.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
          reject(new Error(`Page load failed (${errorCode}): ${errorDescription}`));
        });
        void win!.loadURL(url).catch(reject);
      }),
      new Promise<never>((_, reject) =>
        timer = setTimeout(
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
    clearTimeout(timer);
    if (win && !win.isDestroyed()) {
      win.close();
    }
    for (const scheme of ['http', 'https']) screenshotSession.protocol.unhandle(scheme);
    await screenshotSession.closeAllConnections();
  }
}
