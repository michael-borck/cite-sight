import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchCrossref } from '../src/references/crossref.js';
import { clearLookupCache } from '../src/references/lookupCache.js';
import { setMinRequestInterval } from '../src/references/rateLimiter.js';

// No real pacing in tests — the 1 req/sec limiter would otherwise add a second
// per call.
setMinRequestInterval(0);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  clearLookupCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookup cache', () => {
  it('queries the network once for an identical Crossref search within a run', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ message: { items: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    await searchCrossref('cognitive offloading risko', 'a@b.com');
    await searchCrossref('Cognitive Offloading  Risko', 'a@b.com'); // case/space variant → same key

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed lookup — it is retried next time', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 429));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchCrossref('throttled query', 'a@b.com')).rejects.toMatchObject({
      service: 'crossref',
      reason: 'rate_limited',
    });
    // Second call must hit the network again rather than returning a cached failure.
    await expect(searchCrossref('throttled query', 'a@b.com')).rejects.toMatchObject({
      reason: 'rate_limited',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
