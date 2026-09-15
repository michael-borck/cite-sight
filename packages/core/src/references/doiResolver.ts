import type { AcademicWork } from '../types.js';
import { lookupDoi } from './crossref.js';
import { lookupDoiDataCite } from './datacite.js';
import { throttle } from './rateLimiter.js';
import { httpFetch } from '../httpClient.js';
import { isPrivateUrl } from './ssrf.js';
import { LookupError, reasonFromFetchError, reasonFromStatus } from './lookupError.js';

// ============================================================
// Public API
// ============================================================

/**
 * Resolve a DOI to full academic metadata.
 *
 * Strategy:
 *  1. Primary: Crossref REST API (authoritative, structured metadata)
 *  2. DataCite metadata, including repository deposits.
 *  3. doi.org redirect to confirm registration without requesting the publisher.
 */
export async function resolveDoi(
  doi: string,
  mailto?: string,
): Promise<AcademicWork | null> {
  let failure: unknown;
  for (const lookup of [lookupDoi, lookupDoiDataCite]) {
    try {
      const result = await lookup(doi, mailto);
      if (result) return result;
    } catch (err) { failure ??= err; }
  }

  // Inspect the registry's redirect without probing the publisher. A service
  // error is not proof of registration, and a publisher's 404 says nothing
  // about whether the DOI itself exists.
  try {
    let url = `https://doi.org/${encodeURIComponent(doi)}`;
    const signal = AbortSignal.timeout(10_000);
    for (let hop = 0; hop < 5; hop++) {
      await throttle('doi.org');
      const res = await httpFetch(url, {
        method: 'HEAD', redirect: 'manual', signal,
        headers: { 'User-Agent': 'CiteSight/1.0' + (mailto ? ` (mailto:${mailto})` : '') },
      });
      await res.body?.cancel();
      if (res.status === 404 || res.status === 410) {
        if (failure) throw failure;
        return null;
      }
      const location = res.headers.get('location');
      if (![301, 302, 303, 307, 308].includes(res.status) || !location) {
        throw new LookupError('doi.org', reasonFromStatus(res.status));
      }
      const target = new URL(location, url);
      if (isPrivateUrl(target.href)) throw new LookupError('doi.org', 'unknown', 'DOI points to a private address');
      if (target.hostname === 'doi.org' || target.hostname === 'dx.doi.org') {
        url = target.href;
        continue;
      }
      return { title: '', authors: [], year: null, doi, url: target.href, source: 'crossref' };
    }
    throw new LookupError('doi.org', 'unknown', 'DOI redirect limit exceeded');
  } catch (err) {
    if (err instanceof LookupError) throw err;
    throw new LookupError('doi.org', reasonFromFetchError(err));
  }
}
