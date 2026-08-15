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
// Write timestamps ride alongside for the persistent-cache TTLs; the in-run
// LRU behaviour ignores them entirely.
const writtenAt = new Map<string, number>();

// TTLs for hydration: found records are stable bibliographic facts; a clean
// miss ("no results") can BECOME a hit as indexes update, so it expires
// sooner and gets re-asked.
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isMiss(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.length === 0);
}

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
  writtenAt.set(key, Date.now());
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) {
      store.delete(oldest);
      writtenAt.delete(oldest);
    }
  }
}

/** Clear every cached lookup (e.g. a long-running server starting a fresh batch). */
export function clearLookupCache(): void {
  store.clear();
  writtenAt.clear();
}

// ============================================================
// Persistence hooks (browser-safe: pure data in/out, no filesystem here).
// A host with disk access — the desktop main process — snapshots the cache
// after a run and hydrates it at startup, so re-scans and app restarts stop
// re-spending API quota on works already looked up. See ADR-0002's cost
// driver: the cheapest request is the one never made.
// ============================================================

export interface PersistedLookupCache {
  version: 1;
  entries: Array<{ k: string; v: unknown; at: number }>;
}

/** Snapshot the cache (values + write times) for persistence. */
export function exportLookupCache(): PersistedLookupCache {
  return {
    version: 1,
    entries: [...store.entries()].map(([k, v]) => ({
      k,
      v,
      at: writtenAt.get(k) ?? Date.now(),
    })),
  };
}

/**
 * Load a snapshot into the cache, dropping entries past their TTL (30 days
 * for found records, 7 for clean misses). Malformed input is ignored rather
 * than thrown — a corrupt cache file must never block an analysis run.
 * Returns the number of entries hydrated.
 */
export function hydrateLookupCache(data: unknown): number {
  const d = data as PersistedLookupCache | undefined;
  if (!d || d.version !== 1 || !Array.isArray(d.entries)) return 0;
  const now = Date.now();
  let loaded = 0;
  for (const e of d.entries) {
    if (!e || typeof e.k !== 'string' || typeof e.at !== 'number') continue;
    const ttl = isMiss(e.v) ? MISS_TTL_MS : HIT_TTL_MS;
    if (now - e.at > ttl) continue;
    if (store.size >= MAX_ENTRIES) break;
    store.set(e.k, e.v);
    writtenAt.set(e.k, e.at);
    loaded++;
  }
  return loaded;
}

/** Normalise a query/DOI into a stable cache key (case- and whitespace-insensitive). */
export function cacheKey(prefix: string, value: string): string {
  return `${prefix}:${value.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}
