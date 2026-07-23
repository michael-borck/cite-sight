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

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

let impl: FetchLike | undefined;

/**
 * Install the fetch implementation core should use for outbound requests.
 *
 * Pass `undefined` to fall back to the ambient global `fetch`.
 */
export function setFetch(fetchImpl: FetchLike | undefined): void {
  impl = fetchImpl;
}

/**
 * Perform an outbound request. Resolves the implementation per call so that a
 * host installing one later — or a test stubbing the global — is respected.
 */
export function httpFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  return (impl ?? globalThis.fetch)(input, init);
}
