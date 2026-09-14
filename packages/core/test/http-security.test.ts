import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpFetch, MAX_RESPONSE_BYTES, setFetch } from '../src/httpClient.js';
import { checkUrl } from '../src/references/urlChecker.js';

afterEach(() => setFetch(undefined));

describe('outbound HTTP limits', () => {
  it('rejects redirect hops to internal addresses before making a second request', async () => {
    const fetch = vi.fn(async () => new Response(null, {
      status: 302, headers: { location: 'http://127.0.0.1/admin' },
    }));
    setFetch(fetch);
    await expect(httpFetch('https://public.example/page')).rejects.toThrow(/private/);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.length).toBeGreaterThan(0);
  });

  it('follows relative public redirects and strips credentials across origins', async () => {
    const calls: { url: string; headers: Headers }[] = [];
    setFetch(async (url, init) => {
      calls.push({ url: String(url), headers: new Headers(init?.headers) });
      if (calls.length === 1) return new Response(null, { status: 302, headers: { location: '/next' } });
      if (calls.length === 2) return new Response(null, { status: 302, headers: { location: 'https://other.example/' } });
      return new Response('done');
    });
    const result = await httpFetch('https://public.example/start', { headers: { Authorization: 'test-token' } });
    expect(await result.text()).toBe('done');
    expect(result.url).toBe('https://other.example/');
    expect(calls[1].url).toBe('https://public.example/next');
    expect(calls[1].headers.get('authorization')).toBe('test-token');
    expect(calls[2].headers.has('authorization')).toBe(false);
  });

  it('cancels a stalled body when the request deadline expires after headers', async () => {
    const cancel = vi.fn();
    setFetch(async () => new Response(new ReadableStream({ cancel })));
    const response = await httpFetch('https://public.example/', { signal: AbortSignal.timeout(25) });
    await expect(response.text()).rejects.toThrow(/timeout/i);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects oversized streamed responses without trusting Content-Length', async () => {
    const cancel = vi.fn();
    setFetch(async () => new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(256 * 1024)); }, cancel,
    }), { headers: { 'content-length': '1' } }));
    const response = await httpFetch('https://public.example/');
    await expect(response.text()).rejects.toThrow(`${MAX_RESPONSE_BYTES} bytes`);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels unused bodies for liveness checks', async () => {
    const cancel = vi.fn();
    setFetch(async () => new Response(new ReadableStream({ cancel })));
    expect((await checkUrl('https://public.example/large.pdf')).status).toBe('live');
    expect(cancel).toHaveBeenCalledOnce();
  });
});
