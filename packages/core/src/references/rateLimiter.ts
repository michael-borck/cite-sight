// ============================================================
// Global request pacer
//
// Every outbound citation-database call (Crossref, Semantic Scholar, OpenAlex,
// doi.org) funnels through throttle() so that, across the whole process, at
// most one request leaves per `minIntervalMs` — regardless of which service it
// targets, and regardless of how many documents a batch is working through.
// Because verification is fully sequential, this is a hard ceiling on the
// request rate: the simplest reliable way to stay inside every provider's
// polite-pool limit. Cache hits skip the pacer (no request is made).
// ============================================================

const DEFAULT_MIN_INTERVAL_MS = 1000; // one request per second

let minIntervalMs = DEFAULT_MIN_INTERVAL_MS;
let lastCallAt = 0;
// A promise chain that serialises callers: each awaits the previous, so the
// gap is enforced between requests rather than merely per-caller.
let chain: Promise<void> = Promise.resolve();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Await this immediately before making an external citation-API request. */
export function throttle(): Promise<void> {
  chain = chain.then(async () => {
    const gap = lastCallAt + minIntervalMs - Date.now();
    if (gap > 0) await wait(gap);
    lastCallAt = Date.now();
  });
  return chain;
}

/** Override the minimum interval between requests (ms). */
export function setMinRequestInterval(ms: number): void {
  minIntervalMs = Math.max(0, ms);
}
