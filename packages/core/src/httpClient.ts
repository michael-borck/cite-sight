// ============================================================
// Outbound HTTP indirection
//
// Every external request core makes — Crossref, Semantic Scholar, OpenAlex,
// doi.org, URL liveness checks — goes through httpFetch() rather than calling
// the global `fetch` directly. That lets a host supply its own implementation
// without monkey-patching globalThis.
//
// This is not ceremony. A webview host (Tauri) has to route requests through a
// native HTTP layer to escape the webview's same-origin policy, and patching
// globalThis.fetch there is actively dangerous: those plugins read their own
// response bodies back over the runtime's internal origin using the *native*
// fetch, so a blanket override makes the plugin re-enter itself. The request
// then never settles — no error, no timeout, just a hang.
// ============================================================

import { isPrivateUrl } from './references/ssrf.js';

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

let impl: FetchLike | undefined;
let defaultImpl: FetchLike | undefined;
let networkBlocks = 0;
export function assertExternalRequestsAllowed(): void {
  if (networkBlocks > 0) throw new Error('External requests are disabled for local-only analysis.');
}

/** Fail closed at the request boundary, including overlapping local-only runs. */
export async function withoutExternalRequests<T>(action: () => Promise<T>): Promise<T> {
  networkBlocks++;
  try { return await action(); }
  finally { networkBlocks--; }
}

/** Installed only by the Node entry point; browser imports stay Node-free. */
export function setDefaultFetch(fetchImpl: FetchLike): void {
  defaultImpl = fetchImpl;
}

/**
 * Install the fetch implementation core should use for outbound requests.
 *
 * Custom native transports must validate DNS and pin public destination IPs.
 * Pass `undefined` to restore the platform's default transport.
 */
export function setFetch(fetchImpl: FetchLike | undefined): void {
  impl = fetchImpl;
}

/**
 * Perform an outbound request. Resolves the implementation per call so that a
 * host installing one later — or a test stubbing the global — is respected.
 */
export async function httpFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  assertExternalRequestsAllowed();
  const original = new Request(input, init);
  const signal = AbortSignal.any([original.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
  let request = new Request(original, { signal, redirect: 'manual' });

  for (let redirects = 0; ; redirects++) {
    if (networkBlocks > 0) throw new Error('External requests are disabled for local-only analysis.');
    if (isPrivateUrl(request.url)) throw new Error('URL points to a private or reserved network address');
    signal.throwIfAborted();
    const response = await (impl ?? defaultImpl ?? globalThis.fetch)(request.url, {
      method: request.method,
      headers: request.headers,
      signal,
      redirect: 'manual',
      ...(request.body ? { body: request.body, duplex: 'half' } : {}),
    });
    const location = response.headers.get('location');
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    if (response.type === 'opaqueredirect') {
      await response.body?.cancel();
      throw new Error('Cannot safely follow a cross-origin redirect in this browser');
    }
    if (!isRedirect || original.redirect === 'manual') {
      return boundedResponse(response, signal, request.url, redirects > 0);
    }
    await response.body?.cancel();
    if (original.redirect === 'error' || redirects >= MAX_REDIRECTS || !location) {
      throw new Error('Redirect refused or redirect limit exceeded');
    }
    const url = new URL(location, request.url);
    const headers = new Headers(request.headers);
    if (url.origin !== new URL(request.url).origin) {
      for (const name of ['authorization', 'cookie', 'proxy-authorization']) headers.delete(name);
    }
    // Core only issues GET/HEAD. Refuse replaying arbitrary bodies on redirects.
    if (!['GET', 'HEAD'].includes(request.method)) throw new Error('Redirect of a request body is not supported');
    request = new Request(url, { method: request.method, headers, signal, redirect: 'manual' });
  }
}

/** Bound decompressed bytes and keep cancellation active until the body closes. */
function boundedResponse(response: Response, signal: AbortSignal, url: string, redirected: boolean): Response {
  if (!response.body) return response;
  const reader = response.body.getReader();
  let total = 0;
  let ended = false;
  let abort: () => void;
  const finish = () => {
    ended = true;
    signal.removeEventListener('abort', abort);
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      abort = () => {
        if (ended) return;
        finish();
        controller.error(signal.reason);
        void reader.cancel(signal.reason).catch(() => undefined);
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (ended) return;
        if (done) {
          finish();
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          throw new Error(`Response exceeds ${MAX_RESPONSE_BYTES} bytes`);
        }
        controller.enqueue(value);
      } catch (err) {
        if (ended) return;
        finish();
        controller.error(err);
        void reader.cancel(err).catch(() => undefined);
      }
    },
    cancel(reason) {
      finish();
      return reader.cancel(reason);
    },
  });
  const bounded = new Response(stream, {
    status: response.status, statusText: response.statusText, headers: response.headers,
  });
  Object.defineProperties(bounded, {
    url: { value: response.url || url },
    redirected: { value: redirected || response.redirected },
  });
  return bounded;
}
