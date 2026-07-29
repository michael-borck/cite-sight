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

// BullMQ types — imported lazily so the module loads even without Redis.
// We use `import type` here; the actual values are required() at runtime.
type BullQueue = import('bullmq').Queue;
type BullWorker = import('bullmq').Worker;

export interface AnalysisJobData {
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

    _worker = new Worker<AnalysisJobData, AnalysisResult>(
      'analysis',
      async (job) => {
        const { filePath, citationStyle, checkUrls, checkDoi, checkInText } =
          job.data;

        const options: ProcessingOptions = {
          citationStyle,
          checkUrls,
          checkDoi,
          checkInText,
          screenshotUrls: false,
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
          emit({ type: 'complete', jobId, result });
          return result;
        } catch (err) {
          emit({ type: 'error', jobId, error: err instanceof Error ? err.message : String(err) });
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

    _available = true;
    console.log('[queue] BullMQ worker started (Redis:', redisUrl, ')');
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
    removeOnComplete: { age: 3600 }, // keep results for 1 hour
    removeOnFail: { age: 86400 },    // keep failures for 24 hours
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
  result?: AnalysisResult;
  error?: string;
} | null> {
  if (!_queue) {
    return null;
  }

  // Must be import(), not require(): this file is ESM, where require is not
  // defined — a require() here threw on every poll and returned a 500.
  const { Job } = await import('bullmq');
  const job = await Job.fromId<AnalysisJobData, AnalysisResult>(_queue, jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();

  switch (state) {
    case 'completed':
      return { status: 'complete', result: job.returnvalue };

    case 'failed':
      return {
        status: 'failed',
        error: job.failedReason ?? 'Unknown error',
      };

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
    return 'not_found';
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
