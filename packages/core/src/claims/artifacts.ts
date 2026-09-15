import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { assertExternalRequestsAllowed } from '../httpClient.js';

export interface Artifact { url: string; sha256: string; bytes: number }
export interface DownloadProgress { received: number; total: number }

export async function hashFile(path: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(path, { signal });
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

function allowedUrl(value: string): URL {
  const url = new URL(value);
  const hosts = ['huggingface.co', 'github.com', 'githubusercontent.com', 'hf.co'];
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' ||
    !hosts.some((host) => url.hostname === host || url.hostname.endsWith('.' + host))) throw new Error('Unapproved artifact download host.');
  return url;
}

/** Explicit setup downloads only. This transport never accepts document content,
 * credentials or arbitrary headers, and remains subject to the offline guard. */
export async function downloadArtifact(
  artifact: Artifact, destination: string, onProgress?: (progress: DownloadProgress) => void, signal?: AbortSignal,
): Promise<void> {
  assertExternalRequestsAllowed();
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256) || !Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0) throw new Error('Invalid pinned artifact.');
  const deadline = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(60 * 60 * 1000)]);
  let url = allowedUrl(artifact.url);
  let response: Response | undefined;
  for (let hop = 0; hop < 6; hop++) {
    assertExternalRequestsAllowed();
    deadline.throwIfAborted();
    response = await fetch(url, { redirect: 'manual', signal: deadline, headers: { 'User-Agent': 'CiteSight-Setup/1.0' } });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new Error('Artifact redirect has no destination.');
    url = allowedUrl(new URL(location, url).href);
    response = undefined;
  }
  if (!response?.ok || !response.body) throw new Error(`Artifact download failed${response ? `: HTTP ${response.status}` : ': too many redirects'}.`);
  const declared = response.headers.get('content-length');
  if (declared && Number(declared) !== artifact.bytes) { await response.body.cancel(); throw new Error('Artifact size does not match the pinned release.'); }
  await mkdir(dirname(destination), { recursive: true });
  const partial = destination + '.' + randomUUID() + '.partial';
  const file = await open(partial, 'wx', 0o600);
  const reader = response.body.getReader();
  const hash = createHash('sha256');
  let received = 0;
  try {
    onProgress?.({ received, total: artifact.bytes });
    while (true) {
      assertExternalRequestsAllowed();
      deadline.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > artifact.bytes) throw new Error('Artifact exceeds the pinned size.');
      hash.update(value);
      // FileHandle.write may write fewer bytes than requested.
      for (let offset = 0; offset < value.length;) {
        const { bytesWritten } = await file.write(value, offset, value.length - offset);
        if (!bytesWritten) throw new Error('Artifact could not be written to disk.');
        offset += bytesWritten;
      }
      onProgress?.({ received, total: artifact.bytes });
    }
    if (received !== artifact.bytes || hash.digest('hex') !== artifact.sha256) throw new Error('Artifact checksum verification failed.');
    deadline.throwIfAborted();
    await file.sync(); await file.close();
    await rename(partial, destination);
  } finally {
    await reader.cancel().catch(() => undefined);
    await file.close().catch(() => undefined);
    await rm(partial, { force: true });
  }
}
