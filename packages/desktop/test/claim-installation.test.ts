import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { ClaimInstallation } from '../src/main/claimInstallation';

let directory: string;
const bytes = 'GGUF test model';
const model = { id: 'test', name: 'Test model', fileName: 'test.gguf', url: 'https://huggingface.co/test', revision: 'pinned', license: 'Apache-2.0', licenseUrl: 'https://example.org/license',
  sha256: createHash('sha256').update(bytes).digest('hex'), bytes: Buffer.byteLength(bytes), suggestedRamGB: 8, assessmentStatus: 'experimental' as const };
const probe = vi.fn(async () => 'b8680 (15f786e65)');
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cite-setup-'));
  await mkdir(join(directory, 'runtime'));
  await writeFile(join(directory, 'runtime', 'llama-cli'), 'binary');
  await writeFile(join(directory, 'runtime', 'runtime.json'), JSON.stringify({ version: 'b8680', platform: process.platform, arch: process.arch, executable: 'llama-cli' }));
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
const service = () => new ClaimInstallation(directory, join(directory, 'runtime'), [model], probe, async (_artifact, destination, progress) => {
  await writeFile(destination, bytes); progress?.({ received: model.bytes, total: model.bytes });
});
it('remembers a verified install across process/service restarts without downloading again', async () => {
  const first = service();
  expect((await first.status()).ready).toBe(false);
  await first.install('test', () => {});
  const restarted = service();
  expect(await restarted.status()).toMatchObject({ ready: true, modelId: 'test' });
  expect((await restarted.resolve()).modelPath).toBe(join(directory, 'claim-models', 'test.gguf'));
  expect(JSON.parse(await readFile(join(directory, 'claim-setup.json'), 'utf8'))).not.toHaveProperty('runnerPath');
});
it('detects tampered installed model bytes before inference', async () => {
  const manager = service(); await manager.install('test', () => {});
  await writeFile(join(directory, 'claim-models', 'test.gguf'), 'X'.repeat(model.bytes));
  await expect(manager.resolve()).rejects.toThrow(/failed verification/);
});
it('rejects an unpinned runtime and arbitrary model IDs', async () => {
  await expect(service().install('https://attacker.invalid/model', () => {})).rejects.toThrow(/Unknown/);
  await writeFile(join(directory, 'runtime', 'runtime.json'), JSON.stringify({ version: 'latest', executable: 'llama-cli' }));
  expect((await service().status()).runtimeReady).toBe(false);
});
it('supports checksum-checked offline imports and removal', async () => {
  const source = join(directory, 'import.gguf'); await writeFile(source, bytes);
  const manager = service(); await manager.install('test', () => {}, source);
  expect((await manager.status()).ready).toBe(true);
  await manager.remove();
  expect((await manager.status()).ready).toBe(false);
  expect(await readFile(source, 'utf8')).toBe(bytes);
});
it('uses the catalog inference profile for the actual run and CPU sample', async () => {
  const profiled = { ...model, inferenceProfile: { chatTemplate: 'chatml' as const, reasoning: 'off' as const } };
  const manager = new ClaimInstallation(directory, join(directory, 'runtime'), [profiled], probe, async (_artifact, path) => { await writeFile(path, bytes); });
  await manager.install('test', () => {});
  expect(await manager.resolve()).toMatchObject({ reasoning: 'off', chatTemplate: 'chatml' });
});
