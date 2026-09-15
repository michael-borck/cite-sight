import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimCheckpointPath, checkpointClaimResult, clearBatchRecovery, loadBatchRecovery, saveBatchRecovery } from '../src/main/batchRecovery';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { makeReviewSession } from '@michaelborck/cite-sight-core/session';
import { sampleResult } from '../../core/test/fixtures/analysis-result';

it('saves completed results and resumes interrupted claim work with source mappings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cite-recovery-'));
  try {
    const options = { offline: true, citationStyle: 'auto' as const, checkUrls: false, checkDoi: false, checkInText: true, screenshotUrls: false };
    const first = makeReviewSession([{ path: '/one.txt', status: 'complete', result: sampleResult() }], options);
    const second = makeReviewSession([...first.files, { path: '/two.txt', phase: 'claims', status: 'processing', result: sampleResult(),
      claimSources: [{ reference: 1, path: '/source.pdf', referenceText: sampleResult().references.references[0].raw }],
    }], options);
    await Promise.all([saveBatchRecovery(directory, first), saveBatchRecovery(directory, second)]);
    const restored = await loadBatchRecovery(directory);
    expect(restored?.files).toHaveLength(2);
    expect(restored?.files[1]).toMatchObject({ phase: 'claims', status: 'waiting', claimSources: [{ reference: 1, path: '/source.pdf' }] });
    expect(restored?.files[0].result?.extractedText).toBe('');
    await clearBatchRecovery(directory);
    expect(await loadBatchRecovery(directory)).toBeNull();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it('updates the saved batch from main-process per-claim snapshots and retains reviewer decisions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cite-recovery-'));
  try {
    const options = { offline: true, citationStyle: 'auto' as const, checkUrls: false, checkDoi: false, checkInText: true, screenshotUrls: false };
    const prior = sampleResult(); prior.reviews = { saved: { decision: 'reviewed', reviewedAt: '2026-09-14T00:00:00Z' } };
    await saveBatchRecovery(directory, makeReviewSession([{ path: '/one.txt', status: 'complete', result: prior }, { path: '/two.txt', status: 'waiting' }], options));
    const partial = sampleResult('format_only'); partial.offline = true;
    partial.claims = { version: 1, mode: 'local-only', model: 'local', checkedAt: '2026-09-14T00:00:00Z', warnings: [], omittedCount: 0, findings: [], progress: { state: 'partial', completed: 0, total: 10, reused: 0 } };
    await checkpointClaimResult(directory, '/one.txt', partial, [{ reference: 1, path: '/source.pdf' }], options, 10);
    const restored = await loadBatchRecovery(directory);
    expect(restored?.files.map((file) => file.path)).toEqual(['/one.txt', '/two.txt']);
    expect(restored?.files[0]).toMatchObject({ phase: 'claims', status: 'waiting', claimLimit: 10, result: { reviews: prior.reviews } });
    const path = claimCheckpointPath(directory, '/one.txt'); await mkdir(dirname(path), { recursive: true }); await writeFile(path, '{}');
    await clearBatchRecovery(directory);
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
