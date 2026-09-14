/**
 * BullMQ job queue — optional, only active when REDIS_URL is set.
 *
 * When Redis is not configured every export is a no-op stub and
 * `isQueueAvailable()` returns false so callers can fall back to
 * synchronous processing.
 */

import { unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { analyzePipeline } from '@michaelborck/cite-sight-core';
import type { AnalysisResult, ProcessingOptions } from '@michaelborck/cite-sight-core';
import { emit } from './stream.js';
import { loadOutcome, saveOutcome, reportWithoutDocument } from './retention.js';

// BullMQ types — imported lazily so the module loads even without Redis.
// We use `import type` here; the actual values are required() at runtime.
type BullQueue = import('bullmq').Queue;
type BullWorker = import('bullmq').Worker;

export interface AnalysisJobData {
  fileName?: string;
  documentType?: ProcessingOptions['documentType'];
  filePath: string;
  citationStyle: ProcessingOptions['citationStyle'];
  checkUrls: boolean;
  checkDoi: boolean;
  checkInText: boolean;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _queue: BullQueue | null = null;
let _worker: BullWorker | null = null;
let _available = false;

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) {
    return; // Redis not configured — run in synchronous mode
  }

  try {
    // Dynamic import so the module loads even without bullmq/ioredis installed
    // (synchronous mode). ESM requires import(), not require().
    const { Queue, Worker } = await import('bullmq');

    const connection = { url: redisUrl };

    _queue = new Queue('analysis', { connection }) as BullQueue;
    _queue.on('error', (err) => console.error('[queue] Redis error:', err.message));
    await _queue.waitUntilReady();

    // Remove legacy terminal jobs, which stored whole documents and used lazy
    // age-based cleanup. Waiting/active uploads still belong to their workers.
    for (const state of ['completed', 'failed'] as const) {
      while ((await _queue.clean(0, 1000, state)).length === 1000) { /* next batch */ }
    }

    _worker = new Worker<AnalysisJobData, void>(
      'analysis',
      async (job) => {
        const { filePath, citationStyle, checkUrls, checkDoi, checkInText, documentType } =
          job.data;

        const options: ProcessingOptions = {
          citationStyle,
          documentType,
          checkUrls,
          checkDoi,
          checkInText,
          screenshotUrls: false,
          semanticScholarApiKey: process.env.SEMANTIC_SCHOLAR_API_KEY,
        };

        const jobId = job.id ?? '';

        try {
          const result = await analyzePipeline(
            filePath,
            options,
            (p) =>
              emit({ type: 'progress', jobId, stage: p.stage, message: p.message, progress: p.progress }),
            (verification, index, total) =>
              emit({ type: 'reference', jobId, verification, index, total }),
          );
          const report = reportWithoutDocument(result);
          report.fileName = job.data.fileName ?? report.fileName;
          const expiresAt = await saveOutcome(await _queue!.client, jobId, { status: 'complete', result: report });
          emit({ type: 'complete', jobId, result: report, expiresAt });
          // BullMQ must not keep a second copy in its non-expiring job hash.
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          const expiresAt = await saveOutcome(await _queue!.client, jobId, { status: 'failed', error });
          emit({ type: 'error', jobId, error, expiresAt });
          throw err;
        } finally {
          await unlink(filePath).catch(() => undefined);
        }
      },
      {
        connection,
        concurrency: 2, // respect external API rate limits
      },
    ) as BullWorker;

    _worker.on('failed', (job, err) => {
      console.error(`[queue] Job ${job?.id ?? '?'} failed:`, err);
    });
    _worker.on('error', (err) => console.error('[queue] Worker error:', err.message));

    _available = true;
    console.log('[queue] BullMQ worker started');
  } catch (err) {
    console.warn('[queue] Failed to initialise BullMQ — running in synchronous mode:', err);
    _available = false;
  }
}

// Run on module load
void init();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the BullMQ queue is available (i.e. REDIS_URL was set and
 * the connection was established successfully).
 */
export function isQueueAvailable(): boolean {
  return _available;
}

/**
 * Add an analysis job to the queue.  Throws if the queue is not available.
 */
export async function addJob(data: AnalysisJobData): Promise<string> {
  if (!_queue) {
    throw new Error('Queue is not available');
  }

  const job = await _queue.add('analyze', data, {
    // A random id, not BullMQ's default counter. The id is the only thing
    // guarding /api/job/:id, /api/stream/:id and DELETE /api/job/:id, so a
    // sequential one would let anybody read — or cancel — a stranger's
    // analysis by counting upwards.
    jobId: randomUUID(),
    removeOnComplete: true,
    removeOnFail: true,
  });

  if (!job.id) {
    throw new Error('Failed to get job ID from queue');
  }

  return job.id;
}

/**
 * Fetch the current status (and result/error) of a job by its ID.
 * Returns null if the queue is not available.
 */
export async function getJob(
  jobId: string,
): Promise<{
  status: 'queued' | 'processing' | 'complete' | 'failed';
  expiresAt?: string;
  result?: AnalysisResult;
  error?: string;
} | null> {
  if (!_queue) {
    return null;
  }

  const outcome = await loadOutcome(await _queue.client, jobId);
  if (outcome) return outcome;

  // Must be import(), not require(): this file is ESM, where require is not
  // defined — a require() here threw on every poll and returned a 500.
  const { Job } = await import('bullmq');
  const job = await Job.fromId<AnalysisJobData, void>(_queue, jobId);

  if (!job) {
    // It may have completed between the first outcome lookup and Job.fromId.
    return loadOutcome(await _queue.client, jobId);
  }

  const state = await job.getState();

  switch (state) {
    case 'completed':
    case 'failed':
      return loadOutcome(await _queue.client, jobId);

    case 'active':
      return { status: 'processing' };

    default:
      // waiting, delayed, prioritized, etc.
      return { status: 'queued' };
  }
}

/**
 * Cancel a job that has not started yet.
 *
 * Only a *waiting* job can be pulled out: BullMQ holds a lock on an active job
 * and has no way to interrupt one, and `analyzePipeline` takes no abort signal,
 * so a run already in progress plays out to the end regardless. The caller gets
 * an honest answer either way:
 *
 *   'cancelled'  — removed from the queue, upload deleted
 *   'running'    — already being analysed; nothing was changed
 *   'finished'   — already completed or failed
 *   'not_found'  — no such job (or it aged out of Redis)
 */
export async function cancelJob(
  jobId: string,
): Promise<'cancelled' | 'running' | 'finished' | 'not_found'> {
  if (!_queue) {
    return 'not_found';
  }

  const { Job } = await import('bullmq');
  const job = await Job.fromId<AnalysisJobData, AnalysisResult>(_queue, jobId);

  if (!job) {
    return await loadOutcome(await _queue.client, jobId) ? 'finished' : 'not_found';
  }

  const state = await job.getState();
  if (state === 'active') return 'running';
  if (state === 'completed' || state === 'failed') return 'finished';

  const filePath = job.data.filePath;

  try {
    await job.remove();
  } catch {
    // The worker picked it up between getState() and remove() — BullMQ refuses
    // to remove a locked job. The upload now belongs to the worker, which
    // deletes it in its own `finally`, so leave the file alone.
    return 'running';
  }

  // The worker never ran, so nothing else will clean up the upload.
  await unlink(filePath).catch(() => undefined);

  // Close any SSE client still attached to this job (e.g. a second tab).
  emit({ type: 'error', jobId, error: 'Analysis cancelled.' });

  return 'cancelled';
}
