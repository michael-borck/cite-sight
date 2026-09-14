import type { AnalysisResult } from '@michaelborck/cite-sight-core';

export const REPORT_TTL_SECONDS = 3600;

export type StoredOutcome =
  | { status: 'complete'; result: AnalysisResult; expiresAt?: string }
  | { status: 'failed'; error: string; expiresAt?: string };

interface ReportStore {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

export function reportWithoutDocument(result: AnalysisResult): AnalysisResult {
  return { ...result, extractedText: '' };
}

/** Redis expiry is independent of future jobs or a running application process. */
export async function saveOutcome(store: ReportStore, jobId: string, outcome: StoredOutcome): Promise<string> {
  const expiresAt = new Date(Date.now() + REPORT_TTL_SECONDS * 1000).toISOString();
  const limited: StoredOutcome = outcome.status === 'complete'
    ? { status: 'complete', result: reportWithoutDocument(outcome.result), expiresAt }
    : { status: 'failed', error: outcome.error.slice(0, 1000), expiresAt };
  await store.set(`cite-sight:report:${jobId}`, JSON.stringify(limited), 'EX', REPORT_TTL_SECONDS);
  return expiresAt;
}

export async function loadOutcome(store: ReportStore, jobId: string): Promise<StoredOutcome | null> {
  const value = await store.get(`cite-sight:report:${jobId}`);
  return value ? JSON.parse(value) as StoredOutcome : null;
}
