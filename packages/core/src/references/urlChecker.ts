import type { UrlCheckResult, UrlStatus } from '../types';

const TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; CiteSight/1.0; +https://cite-sight.app)';

// ============================================================
// Public API
// ============================================================

/**
 * Check whether a URL is accessible.
 *
 * - Sends an HTTP GET request following redirects.
 * - Times out after 10 seconds.
 * - Returns a UrlCheckResult describing the outcome.
 */
export async function checkUrl(url: string): Promise<UrlCheckResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          // Some servers return 403 on HEAD; GET with Accept is more reliable
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    const statusCode = res.status;
    const finalUrl = res.url !== url ? res.url : undefined;

    let status: UrlStatus;
    if (statusCode >= 200 && statusCode < 300) {
      status = 'live';
    } else if (statusCode >= 300 && statusCode < 400) {
      // fetch follows redirects by default, so a 3xx here means redirect: manual
      // In practice with redirect:'follow' we won't normally see 3xx — but handle
      // it defensively.
      status = 'redirect';
    } else {
      status = 'dead';
    }

    return {
      url,
      status,
      statusCode,
      finalUrl,
    };
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'AbortError' || err.message.toLowerCase().includes('timeout')) {
        return { url, status: 'timeout', error: 'Request timed out after 10 seconds' };
      }
      return { url, status: 'error', error: err.message };
    }
    return { url, status: 'error', error: 'Unknown network error' };
  }
}
