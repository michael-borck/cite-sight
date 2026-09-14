import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request, type Server } from 'node:http';

const state = vi.hoisted(() => ({ directory: '', analyze: vi.fn(), verify: vi.fn(), available: vi.fn(), addJob: vi.fn(), getJob: vi.fn() }));
vi.mock('os', () => ({ tmpdir: () => state.directory }));
vi.mock('@michaelborck/cite-sight-core', () => ({ analyzePipeline: state.analyze, verifyReferences: state.verify, DISCLAIMER: 'Test disclaimer' }));
vi.mock('../src/queue.js', () => ({
  isQueueAvailable: state.available, addJob: state.addJob, getJob: state.getJob, cancelJob: vi.fn(),
}));

let server: Server;
let base: string;
const result = { fileName: 'test.txt', extractedText: 'Text', references: {}, processingTime: 1 };

beforeAll(async () => {
  state.directory = await mkdtemp(join(tmpdir(), 'cite-sight-upload-test-'));
  const { router } = await import('../src/routes.js');
  const { errorHandler } = await import('../src/middleware.js');
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  state.available.mockReturnValue(false);
  state.analyze.mockResolvedValue(result);
});

afterEach(async () => {
  state.available.mockReturnValue(false);
  state.analyze.mockReset().mockResolvedValue(result);
  state.addJob.mockReset();
  state.getJob.mockReset();
  for (const file of await readdir(state.directory)) await rm(join(state.directory, file), { force: true });
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(state.directory, { recursive: true, force: true });
});

async function upload(endpoint = '/api/analyze', name = 'test.txt', text = 'Text', signal?: AbortSignal) {
  const form = new FormData();
  form.append('file', new Blob([text], { type: name.endsWith('.pdf') ? 'application/pdf' : 'text/plain' }), name);
  const response = await fetch(base + endpoint, { method: 'POST', body: form, signal });
  await response.text();
  return response.status;
}

describe('upload lifecycle', () => {
  it('validates and retries a single reference without uploading its document', async () => {
    const reference = { raw: 'Smith, J. (2020). A study.', title: 'A study', authors: ['Smith, J.'], year: 2020, detectedStyle: 'apa' };
    state.verify.mockResolvedValue([{ reference, status: 'verified' }]);
    const response = await fetch(base + '/api/reverify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, options: { checkDoi: false } }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ verification: { status: 'verified' } });
    expect(state.verify).toHaveBeenCalledWith([expect.objectContaining({ raw: reference.raw })], expect.objectContaining({ checkDoi: false }));
    expect(state.analyze).not.toHaveBeenCalled();
  });

  it('rejects malformed retry inputs without consuming capacity', async () => {
    for (let i = 0; i < 12; i++) {
      const response = await fetch(base + '/api/reverify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: { raw: 'x', authors: 'not an array' } }) });
      expect(response.status).toBe(400);
    }
    expect(await upload()).toBe(200);
  });
  it('serves terminal reports to SSE reconnects after the replay buffer has expired', async () => {
    state.getJob.mockResolvedValue({ status: 'complete', result: { ...result, extractedText: '' } });
    const response = await fetch(base + '/api/stream/finished');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"type":"complete"');
  });

  it('rejects an unknown or expired stream instead of keeping it open', async () => {
    state.getJob.mockResolvedValue(null);
    const response = await fetch(base + '/api/stream/expired');
    expect(response.status).toBe(404);
  });
  it('does not exhaust capacity after repeated Multer rejections', async () => {
    for (let i = 0; i < 12; i++) expect(await upload('/api/analyze', 'bad.exe')).toBe(415);
    expect(await upload()).toBe(200);
  });

  it('cleans renamed files on validation failure on both routes', async () => {
    for (const route of ['/api/analyze', '/analyse']) expect(await upload(route, 'bad.pdf', 'not PDF')).toBe(415);
    await vi.waitFor(async () => expect(await readdir(state.directory)).toEqual([]));
    expect(state.analyze).not.toHaveBeenCalled();
  });

  it('releases capacity after oversized uploads and returns 413', async () => {
    expect(await upload('/api/analyze', 'large.txt', 'x'.repeat(10 * 1024 * 1024 + 1))).toBe(413);
    expect(await upload()).toBe(200);
    await vi.waitFor(async () => expect(await readdir(state.directory)).toEqual([]));
  });

  it('cleans files when queue admission fails, but transfers ownership on success', async () => {
    state.available.mockReturnValue(true);
    state.addJob.mockRejectedValueOnce(Object.assign(new Error('Queue unavailable'), { status: 503 }));
    expect(await upload()).toBe(503);
    await vi.waitFor(async () => expect(await readdir(state.directory)).toEqual([]));
    state.addJob.mockResolvedValueOnce('test-job');
    expect(await upload()).toBe(202);
    // exFAT on macOS may add an AppleDouble resource-fork companion.
    expect((await readdir(state.directory)).filter((name) => !name.startsWith('._'))).toHaveLength(1);
  });

  it('shares capacity across routes and holds it while disconnected analysis still runs', async () => {
    const releases: (() => void)[] = [];
    state.analyze.mockImplementation(() => new Promise((resolve) => releases.push(() => resolve(result))));
    const controller = new AbortController();
    const pending = Array.from({ length: 10 }, (_, i) => upload(i % 2 ? '/analyse' : '/api/analyze', 'test.txt', 'Text', controller.signal).catch(() => 0));
    try {
      await vi.waitFor(() => expect(releases).toHaveLength(10));
      controller.abort();
      expect(await upload('/api/analyze')).toBe(503);
      expect(await upload('/analyse')).toBe(503);
    } finally {
      releases.forEach((release) => release());
      await Promise.all(pending);
    }
    await vi.waitFor(async () => expect(await readdir(state.directory)).toEqual([]));
    state.analyze.mockResolvedValue(result);
    expect(await upload()).toBe(200);
  });

  it('releases capacity and partial files when a multipart upload is aborted', async () => {
    const req = request(base + '/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=audit' },
    });
    req.on('error', () => undefined);
    req.write('--audit\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\n');
    req.write('x'.repeat(65536));
    await vi.waitFor(async () => expect((await readdir(state.directory)).length).toBeGreaterThan(0));
    req.destroy();
    await vi.waitFor(async () => expect(await readdir(state.directory)).toEqual([]));
    expect(await upload()).toBe(200);
  });
});
