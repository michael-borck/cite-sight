import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerIpcHandlers } from '../src/main/ipc';
import { analyzeClaimsFile } from '@michaelborck/cite-sight-core';
import { dialog } from 'electron';

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>());
vi.mock('electron', () => ({
  ipcMain: { handle: (key: string, callback: (...args: any[]) => any) => handlers.set(key, callback) },
  dialog: { showOpenDialog: vi.fn() }, BrowserWindow: vi.fn(), app: { getVersion: () => 'test', getPath: () => directory, getAppPath: () => directory }, shell: { showItemInFolder: vi.fn() },
}));
vi.mock('@michaelborck/cite-sight-core', async (original) => ({ ...await original<object>(), analyzeClaimsFile: vi.fn(async () => ({ offline: true })) }));
vi.mock('../src/main/screenshot.js', () => ({ takeScreenshot: vi.fn() }));
vi.mock('../src/main/sessions.js', () => ({ saveSession: vi.fn(), openSession: vi.fn() }));
vi.mock('../src/main/cacheStore.js', () => ({ saveLookupCache: vi.fn(), loadDismissals: vi.fn(), setDismissal: vi.fn(), cacheInfo: vi.fn(), clearCacheFile: vi.fn(), clearDismissalsFile: vi.fn() }));
vi.mock('../src/main/claimInstallation.js', () => ({ ClaimInstallation: class { async resolve() { return { runnerPath: '/managed/llama-cli', modelPath: '/managed/model.gguf' }; } } }));
let directory: string;
const invoke = (name: string, ...args: unknown[]) => handlers.get(`cite-sight:${name}`)!({}, ...args);
beforeAll(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'cite-ipc-test-')));
  for (const name of ['runner', 'model', 'source']) writeFileSync(join(directory, name), name);
  registerIpcHandlers({ once: vi.fn(), isDestroyed: () => false, webContents: { send: vi.fn() } } as never);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

it('refuses to execute paths supplied by IPC without native picker authorization', async () => {
  await expect(invoke('select-claim-file', 'runner')).rejects.toThrow(/managed in Settings/);
  await expect(invoke('check-claims', '/essay.txt', { sources: [{ reference: 1, path: '/forged/source' }] }, {})).rejects.toThrow(/file pickers/);
  expect(analyzeClaimsFile).not.toHaveBeenCalled();
});
it('uses the managed runtime and model, ignoring forged executable fields', async () => {
  for (const kind of ['source']) {
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: [join(directory, kind)] });
    expect(await invoke('select-claim-file', kind)).toBe(join(directory, kind));
  }
  const config = { runnerPath: '/forged/executable', modelPath: '/forged/model', sources: [{ reference: 1, path: join(directory, 'source') }] };
  await expect(invoke('check-claims', '/essay.txt', config, {})).resolves.toEqual({ offline: true });
  expect(analyzeClaimsFile).toHaveBeenCalledOnce();
  expect(vi.mocked(analyzeClaimsFile).mock.calls[0][1]).toMatchObject({ runnerPath: '/managed/llama-cli', modelPath: '/managed/model.gguf' });
});
