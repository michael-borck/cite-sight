import type { AnalysisResult, ParsedReference, ProcessingOptions, ReferenceVerification } from '../types';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PASTE_CHARS = 100_000;
export const ACCEPTED_FILES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'], 'text/markdown': ['.md', '.qmd'], 'application/json': ['.json'],
};

export interface JobResponse {
  jobId?: string;
  status?: 'queued' | 'processing' | 'complete' | 'failed';
  result?: AnalysisResult;
  error?: string;
  expiresAt?: string;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/**
 * How a request that was told the server is busy is retried.
 *
 * A class submitting at once used to get a flat 503 and nothing to do but retry
 * by hand, which turned a burst into a retry storm. The server now queues a
 * request for up to ~20s before answering 503, so a client that waits and tries
 * again turns "10 succeed, 20 error" into "everyone runs, just staggered".
 */
const BUSY_MAX_ATTEMPTS = 3;
const BUSY_MAX_DELAY_MS = 30_000;

function isBusy(status: number): boolean {
  return status === 503 || status === 429;
}

/** Honour Retry-After (delta-seconds or HTTP-date), capped so we cannot hang. */
function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get('Retry-After');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, BUSY_MAX_DELAY_MS);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), BUSY_MAX_DELAY_MS);
  }
  // Exponential backoff: 1s, 2s, 4s.
  return Math.min(1000 * 2 ** attempt, BUSY_MAX_DELAY_MS);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); return; }
    const aborted = () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, ms);
    signal.addEventListener('abort', aborted, { once: true });
  });
}

/**
 * Run a request, retrying while the server reports itself busy. Aborting cancels
 * immediately — a student who presses Cancel must not be held for a backoff.
 */
export async function requestWithBusyRetry(
  send: () => Promise<Response>,
  signal: AbortSignal,
  onWait?: (attempt: number, delayMs: number) => void,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await send();
    if (!isBusy(response.status) || attempt >= BUSY_MAX_ATTEMPTS - 1) return response;
    const delay = retryDelay(response, attempt);
    onWait?.(attempt + 1, delay);
    await sleep(delay, signal);
  }
}

export async function responseJson<T>(response: Response): Promise<T> {
  let value: unknown;
  try { value = await response.json(); } catch { throw new Error(`The server returned an unreadable response (${response.status}). Please try again.`); }
  if (!response.ok) {
    const message = value && typeof value === 'object' && 'error' in value ? String(value.error) : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return value as T;
}

export function referencesFile(text: string): File {
  if (!text.trim()) throw new Error('Paste at least one reference.');
  if (text.length > MAX_PASTE_CHARS) throw new Error(`Pasted references must be ${MAX_PASTE_CHARS.toLocaleString()} characters or fewer.`);
  const content = /^(?:#{1,6}\s+)?(?:references|bibliography|works cited)\s*$/im.test(text)
    ? text : `References\n\n${text.trim()}`;
  return new File([content], 'pasted-references.txt', { type: 'text/plain' });
}

export async function uploadDocument(file: File, options: ProcessingOptions, signal: AbortSignal, onBusyWait?: (attempt: number, delayMs: number) => void): Promise<JobResponse> {
  // Built per attempt: a consumed multipart body cannot be replayed.
  const send = () => {
    const form = new FormData();
    form.append('file', file);
    for (const name of ['citationStyle', 'checkUrls', 'checkDoi', 'checkInText', 'documentType'] as const) {
      if (options[name] !== undefined) form.append(name, String(options[name]));
    }
    return fetch('/api/analyze', { method: 'POST', body: form, signal });
  };
  return responseJson(await requestWithBusyRetry(send, signal, onBusyWait));
}

export async function retryReference(reference: ParsedReference, options: ProcessingOptions): Promise<ReferenceVerification> {
  const send = () => fetch('/api/reverify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, options }),
    signal: AbortSignal.timeout(120_000),
  });
  const response = await responseJson<{ verification: ReferenceVerification }>(await requestWithBusyRetry(send, AbortSignal.timeout(120_000)));
  return response.verification;
}

export async function pollJob(jobId: string, signal: AbortSignal): Promise<JobResponse> {
  while (!signal.aborted) {
    const data = await responseJson<JobResponse>(await fetch(`/api/job/${encodeURIComponent(jobId)}`, { signal }));
    if (data.status === 'complete' || data.status === 'failed') return data;
    await new Promise<void>((resolve, reject) => {
      const aborted = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, 2000);
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
    });
  }
  throw signal.reason;
}
