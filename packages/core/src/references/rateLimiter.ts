// ============================================================
// Per-service request pacer
//
// Each citation-database service (crossref, openalex, semantic_scholar,
// datacite, doi.org) gets its own serialized chain, so independent services no
// longer share one global gap. A reference that misses on Crossref and must
// also query OpenAlex and Semantic Scholar no longer pays 3x the cooldown —
// each service fires as soon as its own chain is free. Cache hits skip the
// pacer entirely (no request is made).
//
// Every provider's polite-pool limit sits comfortably above one request per
// second per service, so the default interval is a safe ceiling; pass 0 to
// disable pacing (used by tests).
// ============================================================

const DEFAULT_MIN_INTERVAL_MS = 1000;

let defaultInterval = DEFAULT_MIN_INTERVAL_MS;
const serviceIntervals = new Map<string, number>();
const chains = new Map<string, Promise<void>>();
const lastCallAt = new Map<string, number>();

/** Await immediately before an external request to `service` to enforce its
 *  minimum gap. Defaults to one request per second per service. */
export function throttle(service = 'default'): Promise<void> {
  const interval = serviceIntervals.get(service) ?? defaultInterval;
  // `.catch` keeps one anomaly from poisoning the chain for later callers.
  const prev = (chains.get(service) ?? Promise.resolve()).catch(() => undefined);
  const next = prev.then(async () => {
    const gap = (lastCallAt.get(service) ?? 0) + interval - Date.now();
    if (gap > 0) {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, gap);
      await promise;
    }
    lastCallAt.set(service, Date.now());
  });
  chains.set(service, next);
  return next;
}

/** Override the minimum gap (ms) for every service not individually configured.
 *  Pass 0 to disable pacing globally (tests use this). */
export function setMinRequestInterval(ms: number): void {
  defaultInterval = Math.max(0, ms);
}

/** Override the minimum gap (ms) for a single service — e.g. to slow Semantic
 *  Scholar's keyless tier independently of Crossref. */
export function setServiceInterval(service: string, ms: number): void {
  serviceIntervals.set(service, Math.max(0, ms));
}
