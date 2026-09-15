import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planFiles } from '../src/claims/planning.js';
import { remainingEstimate, unitEstimate } from '../src/claims/timing.js';
import { benchmarkMetrics } from '../src/claims/benchmark.js';
import { setFetch } from '../src/httpClient.js';

afterEach(() => setFetch(undefined));
it('scans repeated references locally and counts all potential cited statements', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cite-plan-'));
  const fetch = vi.fn(); setFetch(fetch);
  try {
    const text = 'Practice improved recall (Smith, 2020).\n\nReferences\n\nSmith, J. (2020). Practice and recall. Journal, 1, 1-10.';
    const paths = [join(directory, 'one.txt'), join(directory, 'two.txt')];
    for (const path of paths) await writeFile(path, text);
    const plan = await planFiles(paths, { offline: false, claims: true, observedMs: 20_000 });
    expect(plan).toMatchObject({ references: 2, uniqueReferences: 1, claims: 2 });
    expect(plan.estimate.basis).toBe('observed');
    expect(fetch).not.toHaveBeenCalled();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it('updates the remaining range from observed throughput and ends at zero', () => {
  const initial = unitEstimate(100, 'claims');
  const measured = remainingEstimate(100, 10, 100_000, initial);
  expect(measured).toEqual({ minMs: 540000, maxMs: 1620000, basis: 'observed' });
  expect(remainingEstimate(100, 100, 1000000, initial).maxMs).toBe(0);
});
it('counts false support and contradiction independently of unavailable outputs', () => {
  const result = benchmarkMetrics([
    { expected: 'contradicted', actual: 'supported', elapsedMs: 100 },
    { expected: 'supported', actual: 'contradicted', elapsedMs: 200 },
    { expected: 'supported', actual: 'unavailable', elapsedMs: 300 },
    { expected: 'insufficient_evidence', actual: 'insufficient_evidence', elapsedMs: 400 },
  ]);
  expect(result).toMatchObject({ correct: 1, accuracy: 0.25, falseSupport: 1, falseContradiction: 1, unavailable: 1, falseSupportRate: 0.5, falseContradictionRate: 1 / 3 });
});
