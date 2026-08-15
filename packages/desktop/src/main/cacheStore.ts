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

// ============================================================
// Persistent dismissals — the user's triage decisions, keyed by reference
// CONTENT (referenceContentKey), so "dismiss Ericsson's book-review flag"
// holds across re-scans, app updates, and any document citing it the same
// way. Stored separately from the lookup cache: one is API data with TTLs,
// the other is human judgement that only the human un-makes.
// ============================================================

const DISMISSALS_FILE = (): string => join(app.getPath('userData'), 'dismissals.json');

export function loadDismissals(): string[] {
  try {
    const file = DISMISSALS_FILE();
    if (!existsSync(file)) return [];
    const data = JSON.parse(readFileSync(file, 'utf8')) as { version: 1; keys: string[] };
    return data.version === 1 && Array.isArray(data.keys) ? data.keys.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export function setDismissal(contentKey: string, dismissed: boolean): void {
  try {
    const keys = new Set(loadDismissals());
    if (dismissed) keys.add(contentKey);
    else keys.delete(contentKey);
    const file = DISMISSALS_FILE();
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, keys: [...keys] }), 'utf8');
    renameSync(tmp, file);
  } catch (err) {
    console.warn('[dismissals] could not persist:', err);
  }
}
