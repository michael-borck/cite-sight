// Preloaded via `node --import` ahead of the CLI so the built binary never
// touches the network during e2e. core's httpFetch falls back to
// globalThis.fetch when no implementation is injected (see core/httpClient.ts),
// and the CLI never injects one — so replacing the global here intercepts every
// outbound citation-API and URL-liveness request.
//
// Every lookup returns an empty result set (→ each reference resolves to
// "not found", deterministically and instantly); every HEAD (URL checks,
// doi.org) returns 404. This keeps runs fast and stable while still exercising
// the full extract → parse → verify → report → exit-code pipeline.
//
// We also zero core's polite-pool rate limiter: with real APIs it paces one
// request per second per service, which would drag each analysis out to ~10s+
// even though the mock answers instantly. There is no polite pool to protect
// here, so remove the pacing.
import { setMinRequestInterval } from '@michaelborck/cite-sight-core';
setMinRequestInterval(0);

const EMPTY_BODY = JSON.stringify({ message: { items: [] }, results: [], data: [], total: 0 });

function methodOf(input, init) {
  if (init && typeof init.method === 'string') return init.method.toUpperCase();
  if (input && typeof input === 'object' && 'method' in input && input.method) {
    return String(input.method).toUpperCase();
  }
  return 'GET';
}

globalThis.fetch = async (input, init) => {
  if (methodOf(input, init) === 'HEAD') {
    return new Response(null, { status: 404 });
  }
  return new Response(EMPTY_BODY, { status: 200, headers: { 'content-type': 'application/json' } });
};
