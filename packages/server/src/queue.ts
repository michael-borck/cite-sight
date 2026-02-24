/**
 * BullMQ job queue — optional, only active when REDIS_URL is set.
 *
 * When Redis is not configured every export is a no-op stub and
 * `isQueueAvailable()` returns false so callers can fall back to
 * synchronous processing.
 */

import { unlink } from 'fs/promises';
import { analyzePipeline } from '@michaelborck/cite-sight-core';
import type { AnalysisResult, ProcessingOptions } from '@michaelborck/cite-sight-core';

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

function init(): void {
  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) {
    return; // Redis not configured — run in synchronous mode
  }

  try {
    // Dynamic import so the module can be loaded without bullmq/ioredis installed
    // if running in synchronous mode.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Queue, Worker } = require('bullmq') as typeof import('bullmq');

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

        try {
          return await analyzePipeline(filePath, options);
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
init();

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

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Job } = require('bullmq') as typeof import('bullmq');
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
