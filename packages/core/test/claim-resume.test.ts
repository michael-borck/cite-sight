import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeClaimsFile } from '../src/claims/checkClaims.js';
import { createLocalRunner } from '../src/claims/localRunner.js';
import { readClaimCheckpoint } from '../src/claims/checkpoint.js';
import { setFetch } from '../src/httpClient.js';
import { claimCsv } from '../src/claims/report.js';
import type { ClaimProvenance } from '../src/types.js';
import { reviewKey } from '../src/review.js';

vi.mock('../src/claims/localRunner.js', async (original) => ({ ...await original<object>(), createLocalRunner: vi.fn() }));
const processing = { offline: true, citationStyle: 'auto' as const, checkUrls: false, checkDoi: false, checkInText: true, screenshotUrls: false };
const text = 'Practice improved recall (Smith, 2020). Practice improved recall after two weeks (Smith, 2020).\n\nReferences\n\nSmith, J. (2020). Practice and recall. Journal, 1, 1-10.';
const quote = 'Practice improved recall in adults after two weeks.';
const provenance: ClaimProvenance = { runtimeVersion: 'b8680 (test)', runtimeSha256: 'a'.repeat(64), modelSha256: 'b'.repeat(64), platform: 'test', arch: 'test', promptVersion: 'v2', parameters: { temperature: 0, seed: 0, contextSize: 8192, maxTokens: 1024, device: 'cpu' } };
const response = () => JSON.stringify({ evidence: [{ passageId: 'p0', quote }], reason: 'The source reports improved recall.', status: 'supported' });
let directory: string;
let infer: ReturnType<typeof vi.fn>;
let network: ReturnType<typeof vi.fn>;
const config = () => ({ runnerPath: '/local/runner', modelPath: '/local/model.gguf', sources: [{ reference: 1, path: join(directory, 'source.txt') }] });
const checkpoint = () => join(directory, 'claims.json');
const run = (onSaved?: NonNullable<Parameters<typeof analyzeClaimsFile>[5]>['onSaved'], restart = false, signal?: AbortSignal) => analyzeClaimsFile(join(directory, 'essay.txt'), config(), processing, undefined, signal, { path: checkpoint(), restart, onSaved });
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cite-resume-'));
  await writeFile(join(directory, 'essay.txt'), text); await writeFile(join(directory, 'source.txt'), quote);
  infer = vi.fn(async () => response());
  vi.mocked(createLocalRunner).mockResolvedValue({ name: 'test.gguf', provenance, infer });
  network = vi.fn(); setFetch(network);
});
afterEach(async () => { expect(network).not.toHaveBeenCalled(); setFetch(undefined); await rm(directory, { recursive: true, force: true }); });

describe('per-claim recovery', () => {
  async function stopAfterFirst() {
    const controller = new AbortController();
    await expect(run(async (partial) => {
      if (partial.claims?.progress?.completed === 1) controller.abort(new Error('Shutdown'));
    }, false, controller.signal)).rejects.toThrow('Shutdown');
  }
  it('resumes after shutdown without repeating the completed inference', async () => {
    await stopAfterFirst();
    expect(infer).toHaveBeenCalledTimes(1);
    const saved = await readClaimCheckpoint(checkpoint());
    expect(saved?.analysis.progress).toMatchObject({ state: 'partial', completed: 1, total: 2 });
    const result = await run();
    expect(infer).toHaveBeenCalledTimes(2);
    expect(result.claims?.progress).toEqual({ state: 'complete', completed: 2, total: 2, reused: 1 });
    expect(result.claims?.checkedAt).toBe(saved?.analysis.checkedAt);
    expect(result.extractedText).toBe('');
  });
  it('repeats only the interrupted claim when inference is cancelled', async () => {
    const controller = new AbortController();
    infer.mockImplementationOnce(async () => response()).mockImplementationOnce(async () => { controller.abort(new Error('Shutdown')); throw new Error('Model stopped'); });
    await expect(run(undefined, false, controller.signal)).rejects.toThrow('Shutdown');
    expect((await readClaimCheckpoint(checkpoint()))?.analysis.progress?.completed).toBe(1);
    const result = await run();
    expect(infer).toHaveBeenCalledTimes(3);
    expect(result.claims?.progress?.reused).toBe(1);
  });
  it('rechecks claims when their source changes and validates cached quotations', async () => {
    await stopAfterFirst();
    await writeFile(join(directory, 'source.txt'), quote + ' Additional source detail.');
    expect((await run()).claims?.progress?.reused).toBe(0);
    expect(infer).toHaveBeenCalledTimes(3);
    const saved = JSON.parse(await readFile(checkpoint(), 'utf8'));
    saved.analysis.findings[0].evidence[0].quote = 'X'.repeat(quote.length);
    await writeFile(checkpoint(), JSON.stringify(saved));
    expect((await run()).claims?.progress?.reused).toBe(1);
    expect(infer).toHaveBeenCalledTimes(4);
  });
  it('refuses incompatible model/settings checkpoints until explicit restart', async () => {
    await stopAfterFirst();
    vi.mocked(createLocalRunner).mockResolvedValue({ name: 'other.gguf', provenance: { ...provenance, modelSha256: 'c'.repeat(64) }, infer });
    await expect(run()).rejects.toThrow(/no longer matches/);
    expect(infer).toHaveBeenCalledTimes(1);
    expect((await run(undefined, true)).claims?.progress?.reused).toBe(0);
    expect(infer).toHaveBeenCalledTimes(3);
  });
  it('does not reuse unavailable model results', async () => {
    infer.mockResolvedValueOnce('invalid JSON');
    await run();
    const result = await run();
    expect(result.claims?.progress?.reused).toBe(1);
    expect(infer).toHaveBeenCalledTimes(3);
  });
  it('does not overwrite inputs or silently accept a broken checkpoint', async () => {
    await expect(analyzeClaimsFile(join(directory, 'essay.txt'), config(), processing, undefined, undefined, { path: join(directory, 'source.txt') })).rejects.toThrow(/must not overwrite/);
    expect(await readFile(join(directory, 'source.txt'), 'utf8')).toBe(quote);
    await writeFile(checkpoint(), '{invalid');
    await expect(run()).rejects.toThrow(/Could not read/);
    expect((await run(undefined, true)).claims?.progress?.state).toBe('complete');
  });
  it('exports model suggestions and human assessments as separate columns', async () => {
    const result = await run();
    const csv = claimCsv(result.claims!, [{ decision: 'claim_not_supported', reviewedAt: '2026-09-14T00:00:00Z' }]);
    expect(csv).toContain('Model suggestion'); expect(csv).toContain('Human assessment');
    expect(csv).toContain('Suggested support'); expect(csv).toContain('claim_not_supported'); expect(csv).toContain('not_assessed');
    expect(result.claims?.findings[0].status).toBe('supported');
  });
  it('keeps assessment keys for restored evidence but changes them when the suggestion changes', async () => {
    const first = await run();
    const key = reviewKey(first, 'claim:0');
    const resumed = await run();
    expect(reviewKey(resumed, 'claim:0')).toBe(key);
    resumed.claims!.findings[0].reason = 'New interpretation after rechecking.';
    expect(reviewKey(resumed, 'claim:0')).not.toBe(key);
  });
});
