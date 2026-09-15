import type { ClaimStatus, LocalClaimOptions } from '../types.js';
import { createLocalRunner } from './localRunner.js';
import { claimPrompt, retrievePassages, sourcePassages, validateClaimResponse } from './evidence.js';
import { withoutExternalRequests } from '../httpClient.js';
import { cpus, totalmem } from 'node:os';

export interface BenchmarkCase { id: string; statement: string; source: string; expected: Exclude<ClaimStatus, 'unavailable'> }
export function benchmarkMetrics(rows: { expected: ClaimStatus; actual: ClaimStatus; elapsedMs: number }[]) {
  const count = (test: (row: typeof rows[number]) => boolean) => rows.filter(test).length;
  const nonSupport = count((row) => row.expected !== 'supported');
  const nonContradiction = count((row) => row.expected !== 'contradicted');
  const times = rows.map((row) => row.elapsedMs).sort((a, b) => a - b);
  return { total: rows.length, correct: count((row) => row.expected === row.actual),
    accuracy: rows.length ? count((row) => row.expected === row.actual) / rows.length : null,
    falseSupport: count((row) => row.actual === 'supported' && row.expected !== 'supported'),
    falseSupportRate: nonSupport ? count((row) => row.actual === 'supported' && row.expected !== 'supported') / nonSupport : null,
    falseContradiction: count((row) => row.actual === 'contradicted' && row.expected !== 'contradicted'),
    falseContradictionRate: nonContradiction ? count((row) => row.actual === 'contradicted' && row.expected !== 'contradicted') / nonContradiction : null,
    unavailable: count((row) => row.actual === 'unavailable'),
    insufficientEvidence: count((row) => row.actual === 'insufficient_evidence'),
    medianMs: times.length ? times[Math.floor(times.length / 2)] : null,
    p90Ms: times.length ? times[Math.min(times.length - 1, Math.floor(times.length * 0.9))] : null,
  };
}

export async function benchmarkClaims(cases: BenchmarkCase[], options: LocalClaimOptions, progress?: (id: string, index: number) => void, signal?: AbortSignal) {
  if (!Array.isArray(cases) || !cases.length || cases.length > 1000 || cases.some((item) => !item || typeof item.id !== 'string' || typeof item.statement !== 'string' || item.statement.length > 2000 || typeof item.source !== 'string' || item.source.length > 100_000 || !['supported', 'partially_supported', 'contradicted', 'insufficient_evidence'].includes(item.expected))) throw new Error('Invalid benchmark cases.');
  return withoutExternalRequests(async () => {
    const runner = await createLocalRunner(options);
    const rows = [];
    for (const [index, item] of cases.entries()) {
      signal?.throwIfAborted();
      const start = Date.now();
      const passages = retrievePassages(item.statement, sourcePassages({ text: item.source, fileName: item.id + '.txt', fileType: 'txt' }));
      let result = { status: 'insufficient_evidence' as ClaimStatus, reason: 'No retrieved passages.', evidence: [] as unknown[] };
      try { if (passages.length) result = validateClaimResponse(await runner.infer(claimPrompt(item.statement, passages), signal), passages); }
      catch (error) { signal?.throwIfAborted(); result = { status: 'unavailable', reason: error instanceof Error ? error.message : 'Inference failed.', evidence: [] }; }
      rows.push({ id: item.id, expected: item.expected, actual: result.status, elapsedMs: Date.now() - start, reason: result.reason, evidence: result.evidence });
      progress?.(item.id, index + 1);
    }
    return { version: 1, evaluatedAt: new Date().toISOString(), hardware: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, ramGB: totalmem() / 1024 ** 3 }, provenance: runner.provenance, metrics: benchmarkMetrics(rows), rows };
  });
}
