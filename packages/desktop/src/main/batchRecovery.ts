import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseReviewSession } from '@michaelborck/cite-sight-core/session';
import { makeReviewSession } from '@michaelborck/cite-sight-core/session';
import type { AnalysisResult, ClaimSourceBinding, ProcessingOptions } from '@michaelborck/cite-sight-core';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export function claimCheckpointPath(directory: string, path: string): string {
  return join(directory, 'claim-checkpoints', createHash('sha256').update(resolve(path)).digest('hex') + '.json');
}

let writes = Promise.resolve();
export function saveBatchRecovery(directory: string, value: unknown): Promise<void> {
  const encoded = JSON.stringify(parseReviewSession(value));
  writes = writes.catch(() => {}).then(async () => {
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'batch-recovery.json');
    await writeFile(path + '.tmp', encoded, { mode: 0o600, flush: true });
    await rename(path + '.tmp', path);
  });
  return writes;
}
export async function clearBatchRecovery(directory: string): Promise<void> {
  await writes.catch(() => {});
  await rm(join(directory, 'batch-recovery.json'), { force: true });
  await rm(join(directory, 'claim-checkpoints'), { recursive: true, force: true });
}
export function checkpointClaimResult(directory: string, path: string, result: AnalysisResult, sources: ClaimSourceBinding[], options: ProcessingOptions, claimLimit: number): Promise<void> {
  writes = writes.catch(() => {}).then(async () => {
    const session = await loadBatchRecovery(directory);
    const existing = session?.files.find((file) => file.path === path);
    const updated = { ...existing, path, phase: 'claims' as const, claimLimit, claimSources: sources, options,
      status: result.claims?.progress?.state === 'complete' ? 'complete' as const : 'waiting' as const,
      result: { ...result, reviews: existing?.result?.reviews }, error: undefined,
    };
    const files = session?.files.filter((file) => file.path !== path) ?? [];
    // Keep file ordering stable for the restored batch.
    const nextFiles = existing ? session!.files.map((file) => file.path === path ? updated : file) : [...files, updated];
    const encoded = JSON.stringify(makeReviewSession(nextFiles, session?.options ?? options, session?.selectedPath ?? path));
    await mkdir(directory, { recursive: true });
    const output = join(directory, 'batch-recovery.json');
    await writeFile(output + '.tmp', encoded, { mode: 0o600, flush: true });
    await rename(output + '.tmp', output);
  });
  return writes;
}
export async function loadBatchRecovery(directory: string) {
  try { return parseReviewSession(JSON.parse(await readFile(join(directory, 'batch-recovery.json'), 'utf8'))); }
  catch { return null; }
}
