import { app } from 'electron';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { exportLookupCache, hydrateLookupCache } from '@michaelborck/cite-sight-core';

// ============================================================
// Persistent lookup cache (desktop only).
//
// The core cache is per-process; without persistence every re-scan and every
// app restart re-spends API quota on works already looked up — and the
// keyless Semantic Scholar pool throttles by IP with a sliding window, so
// repeated runs of the SAME document come back progressively MORE
// rate-limited. Persisting the cache in userData turns re-scans and folder
// batches into near-silent API citizens. Web stays stateless by design.
// ============================================================

const CACHE_FILE = (): string => join(app.getPath('userData'), 'lookup-cache.json');

/** Hydrate the in-process cache from disk. Call once, after app ready. */
export function loadLookupCache(): void {
  try {
    const file = CACHE_FILE();
    if (!existsSync(file)) return;
    const loaded = hydrateLookupCache(JSON.parse(readFileSync(file, 'utf8')));
    console.log(`[cache] hydrated ${loaded} lookup entries`);
  } catch (err) {
    // A corrupt cache file must never block analysis — start cold instead.
    console.warn('[cache] could not load lookup cache:', err);
  }
}

/** Snapshot the cache to disk (atomic write). Call after each run. */
export function saveLookupCache(): void {
  try {
    const file = CACHE_FILE();
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(exportLookupCache()), 'utf8');
    renameSync(tmp, file);
  } catch (err) {
    console.warn('[cache] could not save lookup cache:', err);
  }
}
