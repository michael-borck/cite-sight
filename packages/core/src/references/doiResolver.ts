import type { AcademicWork } from '../types.js';
import { lookupDoi } from './crossref.js';
import { throttle } from './rateLimiter.js';

// ============================================================
// Public API
// ============================================================

/**
 * Resolve a DOI to full academic metadata.
 *
 * Strategy:
 *  1. Primary: Crossref REST API (authoritative, structured metadata)
 *  2. Fallback: dx.doi.org HEAD redirect to capture at least the canonical URL
 *     when Crossref has no record (e.g. non-Crossref DOIs).
 */
export async function resolveDoi(
  doi: string,
  mailto?: string,
): Promise<AcademicWork | null> {
  // --- Primary: Crossref ---
  const crossrefResult = await lookupDoi(doi, mailto);
  if (crossrefResult) return crossrefResult;

  // --- Fallback: dx.doi.org ---
  try {
    await throttle();
    const res = await fetch(`https://dx.doi.org/${encodeURIComponent(doi)}`, {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        'User-Agent': 'CiteSight/1.0' + (mailto ? ` (mailto:${mailto})` : ''),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });

    // A 404/410 from doi.org means the DOI is not registered. Any other
    // outcome (including a redirect to a publisher that then 403s/paywalls an
    // automated client) means doi.org *did* resolve the DOI to a real target.
    if (res.status !== 404 && res.status !== 410) {
      // We only have a URL — return a minimal AcademicWork so callers know
      // the DOI resolves to something.
      return {
        title: '',
        authors: [],
        year: null,
        doi,
        url: res.url,
        source: 'crossref',
      };
    }
  } catch {
    // Network error or timeout — swallow and return null
  }

  return null;
}
