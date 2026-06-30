/**
 * In-process event bridge for streaming analysis progress to SSE clients.
 *
 * The BullMQ worker runs in the same Node process as the HTTP server (see
 * queue.ts), so a plain EventEmitter is sufficient — no Redis pub/sub needed.
 * If the worker is ever split into its own process, swap emit/subscribe for a
 * Redis pub/sub transport keyed by jobId.
 */

import { EventEmitter } from 'events';
import type { AnalysisResult, ReferenceVerification } from '@michaelborck/cite-sight-core';

export interface StreamMessage {
  type: 'progress' | 'reference' | 'complete' | 'error';
  jobId: string;
  // progress
  stage?: string;
  message?: string;
  progress?: number;
  // reference
  index?: number;
  total?: number;
  verification?: ReferenceVerification;
  // complete
  result?: AnalysisResult;
  // error
  error?: string;
}

const bus = new EventEmitter();
// Many concurrent SSE clients may subscribe; lift the default 10-listener cap.
bus.setMaxListeners(0);

// Per-job buffer of emitted messages, so a client whose EventSource connects
// slightly after the first references were verified still catches up.
const buffers = new Map<string, StreamMessage[]>();
// Small static table of terminal message types (the ones after which the
// connection should close). A Record, not a Set — the keys are fixed strings.
const TERMINAL: Partial<Record<StreamMessage['type'], true>> = {
  complete: true,
  error: true,
};

export function emit(msg: StreamMessage): void {
  let buf = buffers.get(msg.jobId);
  if (!buf) {
    buf = [];
    buffers.set(msg.jobId, buf);
  }
  buf.push(msg);
  bus.emit(msg.jobId, msg);
  if (TERMINAL[msg.type]) {
    // Retain the terminal state briefly for late connectors, then drop it to
    // avoid unbounded memory growth across jobs.
    setTimeout(() => buffers.delete(msg.jobId), 60_000);
  }
}

/**
 * Attach a listener to a job's stream. Any already-buffered messages are
 * replayed to the listener first (so a late-connecting client catches up),
 * then live messages follow. Returns an unsubscribe handle plus a flag that is
 * true when a terminal message was encountered during replay — in that case no
 * further events will arrive and the caller should close the connection.
 */
export function subscribe(
  jobId: string,
  listener: (msg: StreamMessage) => void,
): { unsubscribe: () => void; replayedTerminal: boolean } {
  bus.on(jobId, listener);
  let replayedTerminal = false;
  for (const msg of buffers.get(jobId) ?? []) {
    listener(msg);
    if (TERMINAL[msg.type]) {
      replayedTerminal = true;
      break;
    }
  }
  return { unsubscribe: () => bus.off(jobId, listener), replayedTerminal };
}
