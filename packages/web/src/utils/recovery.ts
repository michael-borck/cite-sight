import type { AnalysisResult, ProcessingOptions } from '../types';
import { compactResult, isAnalysisResult, portableOptions } from '@michaelborck/cite-sight-core/session';

export const RECOVERY_KEY = 'cite-sight-active-check-v1';
export interface RecoverySnapshot {
  version: 1;
  jobId?: string;
  fileName: string;
  options: ProcessingOptions;
  result?: AnalysisResult;
  expiresAt?: string;
}

export function readRecovery(storage: Storage): { snapshot?: RecoverySnapshot; message?: string } {
  try {
    const raw = storage.getItem(RECOVERY_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw);
    if (value.version !== 1 || typeof value.fileName !== 'string' || !value.options || typeof value.options !== 'object' ||
        value.jobId !== undefined && (typeof value.jobId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.jobId)) ||
        value.result !== undefined && !isAnalysisResult(value.result) || !value.jobId && !value.result ||
        value.expiresAt !== undefined && !Number.isFinite(Date.parse(value.expiresAt)) || value.result && !value.expiresAt) throw new Error('Invalid saved check');
    if (value.expiresAt && Date.parse(value.expiresAt) <= Date.now()) {
      storage.removeItem(RECOVERY_KEY);
      return { message: 'Your previous report has expired. Upload the document or paste its references to check again.' };
    }
    return { snapshot: { version: 1, fileName: value.fileName, jobId: value.jobId,
      options: portableOptions(value.options), result: value.result ? compactResult(value.result) : undefined, expiresAt: value.expiresAt,
    } };
  } catch {
    try { storage.removeItem(RECOVERY_KEY); } catch { /* Browser storage may be disabled. */ }
    return { message: 'The saved check could not be restored. Please start a new check.' };
  }
}

export function writeRecovery(storage: Storage, snapshot: RecoverySnapshot): boolean {
  try {
    if (snapshot.expiresAt && Date.parse(snapshot.expiresAt) <= Date.now()) { storage.removeItem(RECOVERY_KEY); return true; }
    storage.setItem(RECOVERY_KEY, JSON.stringify({ ...snapshot, options: portableOptions(snapshot.options),
      result: snapshot.result ? compactResult(snapshot.result) : undefined,
    }));
    return true;
  } catch { return false; }
}

export function clearRecovery(): void { try { sessionStorage.removeItem(RECOVERY_KEY); } catch { /* No usable storage. */ } }
