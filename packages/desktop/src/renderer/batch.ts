import type { AnalysisResult } from '@michaelborck/cite-sight-core';
import type { SessionFile } from '@michaelborck/cite-sight-core/session';

export type BatchItem = SessionFile;

/** One failed document must not discard the rest of a marking batch. */
export async function runBatch(paths: string[], callbacks: {
  stopped: () => boolean;
  analyze: (path: string) => Promise<AnalysisResult>;
  started: (path: string) => void;
  completed: (path: string, result: AnalysisResult) => void | Promise<void>;
  failed: (path: string, error: string) => void | Promise<void>;
}): Promise<void> {
  for (const path of paths) {
    if (callbacks.stopped()) break;
    callbacks.started(path);
    try { await callbacks.completed(path, await callbacks.analyze(path)); }
    catch (error) { await callbacks.failed(path, error instanceof Error ? error.message : String(error)); }
  }
}
