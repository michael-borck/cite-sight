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

export async function uploadDocument(file: File, options: ProcessingOptions, signal: AbortSignal): Promise<JobResponse> {
  const form = new FormData();
  form.append('file', file);
  for (const name of ['citationStyle', 'checkUrls', 'checkDoi', 'checkInText', 'documentType'] as const) {
    if (options[name] !== undefined) form.append(name, String(options[name]));
  }
  return responseJson(await fetch('/api/analyze', { method: 'POST', body: form, signal }));
}

export async function retryReference(reference: ParsedReference, options: ProcessingOptions): Promise<ReferenceVerification> {
  const response = await responseJson<{ verification: ReferenceVerification }>(await fetch('/api/reverify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, options }),
    signal: AbortSignal.timeout(120_000),
  }));
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
