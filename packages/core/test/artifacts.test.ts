import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { downloadArtifact } from '../src/claims/artifacts.js';
import { withoutExternalRequests } from '../src/httpClient.js';

let directory: string;
const bytes = new TextEncoder().encode('GGUF approved test model');
const artifact = { url: 'https://huggingface.co/test/resolve/pinned/model.gguf', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'cite-artifact-')); });
afterEach(async () => { vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }); });
it('publishes an artifact only after byte count and hash agree', async () => {
  const fetch = vi.fn(async () => new Response(bytes)); vi.stubGlobal('fetch', fetch);
  const path = join(directory, 'model.gguf');
  await downloadArtifact(artifact, path);
  expect(await readFile(path, 'utf8')).toBe('GGUF approved test model');
  expect(await readdir(directory)).toEqual(['model.gguf']);
  expect(fetch.mock.calls[0][1]).not.toHaveProperty('body');
});
it('keeps an existing model intact on corruption and removes partial files', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('corrupt')));
  const path = join(directory, 'model.gguf'); await writeFile(path, 'old approved model');
  await expect(downloadArtifact(artifact, path)).rejects.toThrow(/checksum/);
  expect(await readFile(path, 'utf8')).toBe('old approved model');
  expect(await readdir(directory)).toEqual(['model.gguf']);
});
it('refuses redirects to unapproved or insecure hosts', async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secrets' } })); vi.stubGlobal('fetch', fetch);
  await expect(downloadArtifact(artifact, join(directory, 'model.gguf'))).rejects.toThrow(/Unapproved/);
  expect(fetch).toHaveBeenCalledOnce();
});
it('does not allow setup downloads from within a private analysis', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await withoutExternalRequests(async () => expect(downloadArtifact(artifact, join(directory, 'model.gguf'))).rejects.toThrow(/disabled/));
  expect(fetch).not.toHaveBeenCalled();
});
it('cancels setup without publishing a partially downloaded model', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)));
  const controller = new AbortController();
  await expect(downloadArtifact(artifact, join(directory, 'model.gguf'), ({ received }) => { if (received) controller.abort(); }, controller.signal)).rejects.toThrow();
  expect(await readdir(directory)).toEqual([]);
});
