import { describe, it, expect, beforeEach } from 'vitest';
import {
  setCached,
  getCached,
  clearLookupCache,
  exportLookupCache,
  hydrateLookupCache,
} from '../src/references/lookupCache.js';

const DAY = 24 * 60 * 60 * 1000;

describe('lookup cache persistence', () => {
  beforeEach(() => clearLookupCache());

  it('round-trips entries through export and hydrate', () => {
    setCached('crossref:some query', [{ title: 'A Paper' }]);
    setCached('s2:another query', null);
    const snapshot = exportLookupCache();
    clearLookupCache();
    expect(getCached('crossref:some query')).toBeUndefined();

    const loaded = hydrateLookupCache(snapshot);
    expect(loaded).toBe(2);
    expect(getCached('crossref:some query')).toEqual([{ title: 'A Paper' }]);
    expect(getCached('s2:another query')).toBeNull();
  });

  it('drops found records after 30 days and misses after 7', () => {
    const now = Date.now();
    const loaded = hydrateLookupCache({
      version: 1,
      entries: [
        { k: 'hit:fresh', v: [{ title: 'x' }], at: now - 29 * DAY },
        { k: 'hit:stale', v: [{ title: 'x' }], at: now - 31 * DAY },
        { k: 'miss:fresh', v: [], at: now - 6 * DAY },
        { k: 'miss:stale', v: [], at: now - 8 * DAY },
      ],
    });
    expect(loaded).toBe(2);
    expect(getCached('hit:fresh')).toBeDefined();
    expect(getCached('hit:stale')).toBeUndefined();
    expect(getCached('miss:fresh')).toBeDefined();
    expect(getCached('miss:stale')).toBeUndefined();
  });

  it('ignores malformed snapshots instead of throwing', () => {
    expect(hydrateLookupCache(undefined)).toBe(0);
    expect(hydrateLookupCache('garbage')).toBe(0);
    expect(hydrateLookupCache({ version: 2, entries: [] })).toBe(0);
    expect(hydrateLookupCache({ version: 1, entries: [{ bad: true }] })).toBe(0);
  });

  it('preserves original write times across a round-trip (TTL continuity)', () => {
    const now = Date.now();
    hydrateLookupCache({
      version: 1,
      entries: [{ k: 'hit:old', v: [{ title: 'x' }], at: now - 20 * DAY }],
    });
    const again = exportLookupCache();
    const entry = again.entries.find((e) => e.k === 'hit:old');
    // The write time must survive, not reset — otherwise every restart
    // renews the TTL and stale records never expire.
    expect(entry?.at).toBe(now - 20 * DAY);
  });
});
