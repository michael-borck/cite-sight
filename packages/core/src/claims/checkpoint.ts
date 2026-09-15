import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AnalysisResult, ClaimAnalysis } from '../types.js';
import { isClaimAnalysis } from './validation.js';

export interface ClaimCheckpoint { format: 'cite-sight-claim-checkpoint'; version: 1; signature: string; analysis: ClaimAnalysis }
export interface ClaimCheckpointOptions {
  path: string;
  restart?: boolean;
  onSaved?: (partial: AnalysisResult) => Promise<void>;
}

export async function readClaimCheckpoint(path: string): Promise<ClaimCheckpoint | undefined> {
  try {
    if ((await stat(path)).size > 8 * 1024 * 1024) throw new Error('Claim checkpoint exceeds the size limit.');
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (value?.format !== 'cite-sight-claim-checkpoint' || value.version !== 1 || !/^[a-f0-9]{64}$/.test(value.signature) ||
      !isClaimAnalysis(value.analysis) || !value.analysis.progress) throw new Error('Invalid claim checkpoint.');
    return value;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined;
    throw new Error('Could not read the claim checkpoint. Preserve it for review, or explicitly restart claim checking.');
  }
}

/** Atomic publication means a shutdown retains the last fully saved claim. */
export async function writeClaimCheckpoint(path: string, signature: string, analysis: ClaimAnalysis): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ format: 'cite-sight-claim-checkpoint', version: 1, signature, analysis } satisfies ClaimCheckpoint), { mode: 0o600, flush: true });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}
