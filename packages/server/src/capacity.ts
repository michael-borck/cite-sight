/**
 * Concurrency gate for expensive request handlers.
 *
 * The tool's limiter is deliberately process-wide rather than per-IP: a
 * classroom shares one NAT address, and a reverse proxy with no `trust proxy`
 * configured collapses a whole institution to a single IP. Per-IP counting would
 * reject exactly the users this tool exists for. What it does need to do is stop
 * the server holding unbounded work, and — this is the part that matters when a
 * class submits at once — *queue* the burst instead of rejecting it.
 *
 * Extracted from routes.ts so it can be tested directly: as module-level state
 * inside the router, one failing test leaked its held slots into every test
 * after it.
 */

export interface CapacityOptions {
  /** Maximum slots. */
  limit: number;
  /** How long `acquire` waits before giving up, in milliseconds. */
  waitMs: number;
}

interface Waiter {
  resolve: (granted: boolean) => void;
  timer: NodeJS.Timeout;
  onAbort?: () => void;
}

export class Capacity {
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(private readonly options: CapacityOptions) {}

  /** Slots currently held. Exposed for tests and diagnostics. */
  get inUse(): number {
    return this.active;
  }

  /** Requests currently queued. Exposed for tests and diagnostics. */
  get queued(): number {
    return this.waiters.length;
  }

  /**
   * Take a slot, waiting for one if the server is saturated.
   *
   * Resolves true when a slot is held (the caller must then call `release`),
   * false when the wait timed out or the client disconnected. A queued request
   * that is abandoned is removed from the queue, so a student closing the tab
   * does not hold a place in line.
   */
  acquire(signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return Promise.resolve(false);
    if (this.active < this.options.limit) {
      this.active++;
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      const waiter: Waiter = {
        resolve,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          resolve(false);
        }, this.options.waitMs),
      };
      // A pending timer must never hold the process open.
      waiter.timer.unref?.();
      waiter.onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        resolve(false);
      };
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  /** Give the slot back, handing it directly to the next waiter. */
  release(): void {
    const next = this.waiters.shift();
    if (next) {
      // The slot transfers, so the count is unchanged: the caller's holder is
      // replaced by the waiter's. Incrementing here would push `active` past
      // the limit and let new requests in while the real work was still full.
      clearTimeout(next.timer);
      next.onAbort = undefined;
      next.resolve(true);
      return;
    }
    this.active = Math.max(0, this.active - 1);
  }
}

/** Defaults, overridable for tests and unusual deployments. */
export const MAX_CONCURRENT_UPLOADS = Number(process.env['CITESIGHT_MAX_UPLOADS'] ?? 10);
export const SLOT_WAIT_MS = Number(process.env['CITESIGHT_SLOT_WAIT_MS'] ?? 20_000);
/** Seconds advertised to a client that could not be served. */
export const BUSY_RETRY_AFTER_SECONDS = 30;