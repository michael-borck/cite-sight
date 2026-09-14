import { dialog, type BrowserWindow } from 'electron';
import { readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseReviewSession, type ReviewSession } from '@michaelborck/cite-sight-core/session';

export async function saveSession(window: BrowserWindow, value: unknown): Promise<string | null> {
  const session = parseReviewSession(value);
  const json = JSON.stringify(session, null, 2);
  if (Buffer.byteLength(json) > 50 * 1024 * 1024) throw new Error('This session is larger than 50 MB. Save a smaller batch.');
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Save review session', defaultPath: `citesight-session-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'CiteSight review session', extensions: ['json'] }],
  });
  if (canceled || !filePath) return null;
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, json, { mode: 0o600 }); await rename(temporary, filePath); }
  finally { await unlink(temporary).catch(() => undefined); }
  return filePath;
}

export async function openSession(window: BrowserWindow): Promise<ReviewSession | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Open review session', properties: ['openFile'], filters: [{ name: 'CiteSight review session', extensions: ['json'] }],
  });
  if (canceled || !filePaths[0]) return null;
  if ((await stat(filePaths[0])).size > 50 * 1024 * 1024) throw new Error('Session files must be 50 MB or smaller.');
  try { return parseReviewSession(JSON.parse(await readFile(filePaths[0], 'utf8'))); }
  catch (err) { throw new Error(err instanceof SyntaxError ? 'The selected file is not valid JSON.' : (err as Error).message); }
}
