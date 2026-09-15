let localOnly = true;
let activeTask = false;
let onlineOperations = 0;
/** A deliberate, pinned-host model download may run while a batch is merely
 * open; analysis itself still excludes it through activeTask/onlineOperations. */
export async function setupOperation<T>(action: () => Promise<T>): Promise<T> {
  if (activeTask || onlineOperations) throw new Error('Wait for the current operation to finish before model setup.');
  onlineOperations++;
  try { return await action(); } finally { onlineOperations--; }
}

export function isLocalOnly(): boolean { return localOnly; }

export function setLocalOnly(value: boolean): void {
  if (value !== localOnly && (activeTask || onlineOperations)) throw new Error('Wait for the current operation to finish before changing network mode.');
  localOnly = value;
}

export async function desktopTask<T>(offline: boolean, action: () => Promise<T>): Promise<T> {
  if (activeTask || onlineOperations) throw new Error('Another operation is running. Wait for it to finish first.');
  setLocalOnly(offline);
  activeTask = true;
  try { return await action(); }
  finally { activeTask = false; }
}

export async function onlineOperation<T>(action: () => Promise<T>): Promise<T> {
  if (localOnly || activeTask) throw new Error('Online actions are disabled during local-only mode or analysis.');
  onlineOperations++;
  try { return await action(); }
  finally { onlineOperations--; }
}

export function allowRendererRequest(url: string, development: boolean): boolean {
  if (!/^https?:|^wss?:/i.test(url)) return /^(file:|data:|blob:|devtools:)/i.test(url);
  if (!localOnly) return true;
  // The packaged app needs no network. Allow only the configured Vite origin in development.
  if (!development) return false;
  try { const parsed = new URL(url); return parsed.hostname === 'localhost' && parsed.port === '5173'; }
  catch { return false; }
}
