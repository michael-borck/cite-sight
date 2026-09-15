import { copyFile, lstat, mkdir, readFile, realpath, rename, rm, statfs, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { cpus, totalmem } from 'node:os';
import { CLAIM_MODELS, CLAIM_RUNTIME_VERSION, CLAIM_PROMPT_VERSION, downloadArtifact, hashFile, probeRuntimeVersion, benchmarkClaims } from '@michaelborck/cite-sight-core';
import type { ClaimInstallationStatus } from '../shared/claimInstallation.js';

type Catalog = typeof CLAIM_MODELS;
export class ClaimInstallation {
  private controller?: AbortController;
  private progress: Pick<ClaimInstallationStatus, 'phase' | 'received' | 'total' | 'error'> = { phase: 'idle', received: 0, total: 0 };
  constructor(private readonly directory: string, private readonly runtimeDirectory: string,
    private readonly catalog: Catalog = CLAIM_MODELS,
    private readonly probe = probeRuntimeVersion,
    private readonly download = downloadArtifact) {}

  private configPath(): string { return join(this.directory, 'claim-setup.json'); }
  private modelPath(model: Catalog[number]): string { return join(this.directory, 'claim-models', model.fileName); }
  private async config(): Promise<{ modelId: string } | undefined> {
    try {
      const value = JSON.parse(await readFile(this.configPath(), 'utf8'));
      if (value.version === 1 && this.catalog.some((model) => model.id === value.modelId && model.sha256 === value.sha256)) return value;
    } catch { /* Unconfigured or incompatible setup. Never execute paths from this file. */ }
    return undefined;
  }
  private async runtime(): Promise<{ path: string; version: string }> {
    const root = await realpath(this.runtimeDirectory);
    const receipt = JSON.parse(await readFile(join(root, 'runtime.json'), 'utf8'));
    if (receipt.version !== CLAIM_RUNTIME_VERSION || receipt.platform !== process.platform || receipt.arch !== process.arch || typeof receipt.executable !== 'string') throw new Error('Bundled runtime does not match this app or computer.');
    const path = await realpath(resolve(root, receipt.executable));
    if (!path.startsWith(root + sep)) throw new Error('Invalid bundled runtime path.');
    const version = await this.probe(path);
    if (!version.startsWith(CLAIM_RUNTIME_VERSION + ' ')) throw new Error('Unexpected bundled runtime version.');
    return { path, version };
  }
  async status(): Promise<ClaimInstallationStatus> {
    let runtimeVersion: string | undefined;
    let runtimeError: string | undefined;
    try { runtimeVersion = (await this.runtime()).version; }
    catch { runtimeError = 'Bundled runtime is missing or incompatible. Development builds: run npm run prepare:runtime -w packages/desktop.'; }
    const config = await this.config();
    const model = this.catalog.find((entry) => entry.id === config?.modelId);
    let installed = false;
    try { if (model) { const info = await lstat(this.modelPath(model)); installed = info.isFile() && !info.isSymbolicLink() && info.size === model.bytes; } } catch { /* Not installed. */ }
    let freeDiskBytes: number | undefined;
    let sampleMsPerClaim: number | undefined;
    try {
      const timing = JSON.parse(await readFile(join(this.directory, 'claim-speed.json'), 'utf8'));
      if (timing.modelId === model?.id && timing.runtimeVersion === runtimeVersion && timing.promptVersion === CLAIM_PROMPT_VERSION && timing.cpu === cpus()[0]?.model && timing.arch === process.arch && Number.isFinite(timing.ms) && timing.ms > 0) sampleMsPerClaim = timing.ms;
    } catch { /* No local speed sample yet. */ }
    try { const info = await statfs(this.directory); freeDiskBytes = info.bavail * info.bsize; } catch { /* Directory created on first setup. */ }
    return { ...this.progress, runtimeVersion, runtimeReady: !!runtimeVersion, modelId: installed ? model?.id : undefined,
      ready: !!runtimeVersion && installed, ramGB: totalmem() / 1024 ** 3, freeDiskBytes, sampleMsPerClaim,
      error: this.progress.error ?? runtimeError,
    };
  }
  cancel(): void { this.controller?.abort(new Error('Model setup cancelled.')); }
  async install(id: string, notify: (progress: typeof this.progress) => void, importPath?: string): Promise<void> {
    if (this.controller) throw new Error('Model setup is already running.');
    const model = this.catalog.find((entry) => entry.id === id);
    if (!model) throw new Error('Unknown catalog model.');
    const controller = new AbortController(); this.controller = controller;
    const update = (phase: typeof this.progress.phase, received = 0) => {
      this.progress = { phase, received, total: model.bytes }; notify(this.progress);
    };
    const destination = this.modelPath(model);
    const imported = destination + '.importing';
    try {
      await this.runtime();
      await mkdir(join(this.directory, 'claim-models'), { recursive: true });
      const disk = await statfs(this.directory);
      if (disk.bavail * disk.bsize < model.bytes * 1.15) throw new Error('Not enough free disk space for this model.');
      if (importPath) {
        const info = await lstat(importPath);
        if (!info.isFile() || info.size !== model.bytes) throw new Error('The selected file does not match this catalog model.');
        update('verifying');
        await copyFile(importPath, imported);
        if (await hashFile(imported, controller.signal) !== model.sha256) throw new Error('Model checksum verification failed.');
        controller.signal.throwIfAborted(); await rename(imported, destination);
      } else {
        update('downloading');
        let reportedAt = 0;
        await this.download(model, destination, ({ received }) => {
          if (Date.now() - reportedAt > 250 || received === model.bytes) { update(received === model.bytes ? 'verifying' : 'downloading', received); reportedAt = Date.now(); }
        }, controller.signal);
      }
      controller.signal.throwIfAborted();
      const pending = this.configPath() + '.tmp';
      await writeFile(pending, JSON.stringify({ version: 1, modelId: model.id, sha256: model.sha256, revision: model.revision, installedAt: new Date().toISOString() }), { mode: 0o600 });
      await rename(pending, this.configPath());
      update('idle', model.bytes);
    } catch (error) {
      this.progress = { ...this.progress, phase: 'failed', error: controller.signal.aborted ? 'Model setup cancelled.' : error instanceof Error ? error.message : 'Model setup failed.' };
      notify(this.progress); throw new Error(this.progress.error);
    } finally { await rm(imported, { force: true }); this.controller = undefined; }
  }
  async resolve(): Promise<{ runnerPath: string; modelPath: string; reasoning?: 'off'; chatTemplate?: 'chatml' }> {
    if (this.controller) throw new Error('Wait for model setup to finish.');
    const config = await this.config();
    const model = this.catalog.find((entry) => entry.id === config?.modelId);
    if (!model) throw new Error('Set up a model in Settings > Local claim review first.');
    const runtime = await this.runtime();
    const path = this.modelPath(model);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== model.bytes || await hashFile(path) !== model.sha256) throw new Error('The installed model failed verification. Reinstall it in Settings.');
    return { runnerPath: runtime.path, modelPath: path, ...model.inferenceProfile };
  }
  async remove(): Promise<void> {
    if (this.controller) throw new Error('Cancel model setup before removing files.');
    await rm(this.configPath(), { force: true });
    await rm(join(this.directory, 'claim-speed.json'), { force: true });
    for (const model of this.catalog) await rm(this.modelPath(model), { force: true });
    this.progress = { phase: 'idle', received: 0, total: 0 };
  }
  async calibrate(): Promise<void> {
    const paths = await this.resolve();
    const controller = new AbortController(); this.controller = controller;
    this.progress = { phase: 'calibrating', received: 0, total: 1 };
    try {
      const result = await benchmarkClaims([{ id: 'speed-sample', statement: 'The trial enrolled 120 participants.',
        source: 'The trial enrolled 120 participants across three clinics.', expected: 'supported' }], { ...paths, sources: [], timeoutMs: 60_000 }, undefined, controller.signal);
      if (result.metrics.unavailable || !result.metrics.medianMs) throw new Error('The speed sample did not produce usable output. See the benchmark results before choosing this model.');
      const config = await this.config();
      const pending = join(this.directory, 'claim-speed.json.tmp');
      await writeFile(pending, JSON.stringify({ modelId: config?.modelId, runtimeVersion: result.provenance.runtimeVersion, promptVersion: CLAIM_PROMPT_VERSION, cpu: cpus()[0]?.model, arch: process.arch, ms: result.metrics.medianMs }), { mode: 0o600 });
      await rename(pending, join(this.directory, 'claim-speed.json'));
    } finally { this.controller = undefined; this.progress = { phase: 'idle', received: 0, total: 0 }; }
  }
}
