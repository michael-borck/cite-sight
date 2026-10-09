// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { requestWithBusyRetry } from '../src/utils/analysisApi';

// A class submitting at once used to get a flat 503 and nothing to do but retry
// by hand. The server now queues for up to ~20s before answering 503, so the
// client has to ride that out rather than surface the error immediately.

function busy(retryAfter?: string): Response {
  return new Response(JSON.stringify({ error: 'The server is busy.' }), {
    status: 503,
    headers: retryAfter ? { 'Content-Type': 'application/json', 'Retry-After': retryAfter } : { 'Content-Type': 'application/json' },
  });
}

const ok = () => new Response('{}', { status: 200 });

afterEach(() => { vi.useRealTimers(); });

it('returns a successful response without retrying', async () => {
  const send = vi.fn(async () => ok());
  const response = await requestWithBusyRetry(send, new AbortController().signal);
  expect(response.status).toBe(200);
  expect(send).toHaveBeenCalledTimes(1);
});

it('retries a 503 and succeeds', async () => {
  vi.useFakeTimers();
  const send = vi.fn()
    .mockResolvedValueOnce(busy('1'))
    .mockResolvedValueOnce(ok());
  const promise = requestWithBusyRetry(send, new AbortController().signal);
  await vi.runAllTimersAsync();
  expect((await promise).status).toBe(200);
  expect(send).toHaveBeenCalledTimes(2);
});

it('retries a 429 as well as a 503', async () => {
  vi.useFakeTimers();
  const send = vi.fn()
    .mockResolvedValueOnce(new Response('{}', { status: 429 }))
    .mockResolvedValueOnce(ok());
  const promise = requestWithBusyRetry(send, new AbortController().signal);
  await vi.runAllTimersAsync();
  expect((await promise).status).toBe(200);
});

it('honours Retry-After in seconds', async () => {
  vi.useFakeTimers();
  const waits: number[] = [];
  const send = vi.fn()
    .mockResolvedValueOnce(busy('2'))
    .mockResolvedValueOnce(ok());
  const promise = requestWithBusyRetry(send, new AbortController().signal, (_a, delay) => waits.push(delay));
  await vi.runAllTimersAsync();
  await promise;
  expect(waits).toEqual([2000]);
});

it('honours an HTTP-date Retry-After', async () => {
  vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
  const waits: number[] = [];
  const send = vi.fn()
    .mockResolvedValueOnce(busy(new Date(Date.now() + 5000).toUTCString()))
    .mockResolvedValueOnce(ok());
  const promise = requestWithBusyRetry(send, new AbortController().signal, (_a, delay) => waits.push(delay));
  await vi.runAllTimersAsync();
  await promise;
  expect(waits[0]).toBeGreaterThan(4_000);
  expect(waits[0]).toBeLessThanOrEqual(5_000);
});

it('caps an absurd Retry-After so the user is not stranded', async () => {
  vi.useFakeTimers();
  const waits: number[] = [];
  const send = vi.fn()
    .mockResolvedValueOnce(busy('3600'))
    .mockResolvedValueOnce(ok());
  const promise = requestWithBusyRetry(send, new AbortController().signal, (_a, delay) => waits.push(delay));
  await vi.runAllTimersAsync();
  await promise;
  expect(waits[0]).toBe(30_000);
});

it('backs off exponentially when no Retry-After is given', async () => {
  vi.useFakeTimers();
  const waits: number[] = [];
  const send = vi.fn()
    .mockResolvedValueOnce(busy())
    .mockResolvedValueOnce(busy())
    .mockResolvedValueOnce(ok());
  const promise = requestWithBusyRetry(send, new AbortController().signal, (_a, delay) => waits.push(delay));
  await vi.runAllTimersAsync();
  await promise;
  expect(waits).toEqual([1000, 2000]);
});

it('gives up after a bounded number of attempts', async () => {
  vi.useFakeTimers();
  const send = vi.fn(async () => busy('1'));
  const promise = requestWithBusyRetry(send, new AbortController().signal);
  await vi.runAllTimersAsync();
  expect((await promise).status).toBe(503);
  expect(send).toHaveBeenCalledTimes(3);
});

// A student who presses Cancel must not be held for a backoff.
it('aborts immediately while waiting', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const send = vi.fn(async () => busy('30'));
  const promise = requestWithBusyRetry(send, controller.signal);
  await vi.advanceTimersByTimeAsync(10);
  controller.abort();
  await expect(promise).rejects.toBeTruthy();
  expect(send).toHaveBeenCalledTimes(1);
});

it('does not retry a client error', async () => {
  const send = vi.fn(async () => new Response('{}', { status: 400 }));
  const response = await requestWithBusyRetry(send, new AbortController().signal);
  expect(response.status).toBe(400);
  expect(send).toHaveBeenCalledTimes(1);
});