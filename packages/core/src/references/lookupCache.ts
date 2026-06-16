// ============================================================
// Lookup result cache
//
// When a whole folder of student papers is checked, the same works recur across
// many bibliographies (a set text, a key paper, a course reading). Re-querying
// the databases for each occurrence wastes quota and multiplies rate-limit
// exposure. This process-level cache memoises each service's result by query
// (or by DOI), so an identical lookup is made once per run and reused.
//
// Only *successful* lookups are cached — including clean "no results" / "not
// found" answers, which are real information. Failed lookups (rate-limit,
// timeout, network) are never cached, so a transient outage is retried next
// time rather than frozen into the run.
// ============================================================

const MAX_ENTRIES = 5000;
const store = new Map<string, unknown>();

/** Return a cached value, or undefined if absent. Refreshes LRU recency. */
export function getCached<T>(key: string): T | undefined {
  if (!store.has(key)) return undefined;
  const value = store.get(key) as T;
  // Re-insert to mark as most-recently-used.
  store.delete(key);
  store.set(key, value);
  return value;
}

/** Store a successful lookup result, evicting the oldest entry past the cap. */
export function setCached<T>(key: string, value: T): void {
  if (store.has(key)) store.delete(key);
  store.set(key, value);
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
}

/** Clear every cached lookup (e.g. a long-running server starting a fresh batch). */
export function clearLookupCache(): void {
  store.clear();
}

/** Normalise a query/DOI into a stable cache key (case- and whitespace-insensitive). */
export function cacheKey(prefix: string, value: string): string {
  return `${prefix}:${value.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}
