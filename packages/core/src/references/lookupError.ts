// ============================================================
// Typed lookup failures
//
// A failed database lookup is not the same as "this reference does not exist".
// When a service is rate-limited, times out, or is down, the verifier must say
// so — "unverified, rate-limited on Semantic Scholar" — rather than reporting a
// confident "not found". LookupError carries which service failed and why, so
// that reason can travel all the way to the report.
// ============================================================

export type LookupFailureReason =
  | 'rate_limited'  // HTTP 429 — provider throttled us (often Semantic Scholar's keyless pool)
  | 'timeout'       // request exceeded its deadline
  | 'server_error'  // HTTP 5xx
  | 'network'       // connection refused/reset/DNS — never reached the service
  | 'unknown';      // any other non-OK response

export class LookupError extends Error {
  readonly service: string;
  readonly reason: LookupFailureReason;

  constructor(service: string, reason: LookupFailureReason, message?: string) {
    super(message ?? `${service} lookup failed (${reason})`);
    this.name = 'LookupError';
    this.service = service;
    this.reason = reason;
  }
}

/** Classify a non-OK HTTP status from a citation API. */
export function reasonFromStatus(status: number): LookupFailureReason {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'unknown';
}

/** Classify a thrown fetch error (an aborted/timed-out request vs a network failure). */
export function reasonFromFetchError(err: unknown): LookupFailureReason {
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return 'timeout';
  }
  return 'network';
}
