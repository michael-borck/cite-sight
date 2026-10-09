import { describe, expect, it, vi } from 'vitest';
import { Capacity } from '../src/capacity.js';

// The gate is process-wide rather than per-IP on purpose: a classroom shares one
// NAT address, and with no `trust proxy` configured a reverse proxy collapses a
// whole institution to a single IP. These tests pin the behaviour that replaces
// the old immediate rejection — a burst queues instead of being turned away.

describe('Capacity', () => {
  it('grants immediately while below the limit', async () => {
    const capacity = new Capacity({ limit: 2, waitMs: 50 });
    expect(await capacity.acquire()).toBe(true);
    expect(await capacity.acquire()).toBe(true);
    expect(capacity.inUse).toBe(2);
  });

  it('queues rather than rejecting when full, and drains in arrival order', async () => {
    const capacity = new Capacity({ limit: 2, waitMs: 1_000 });
    await capacity.acquire();
    await capacity.acquire();

    const order: number[] = [];
    const first = capacity.acquire().then((granted) => { order.push(1); return granted; });
    const second = capacity.acquire().then((granted) => { order.push(2); return granted; });
    const third = capacity.acquire().then((granted) => { order.push(3); return granted; });

    expect(capacity.queued).toBe(3);
    expect(order).toEqual([]);

    capacity.release();
    await expect(first).resolves.toBe(true);
    expect(order).toEqual([1]);

    capacity.release();
    await expect(second).resolves.toBe(true);
    expect(order).toEqual([1, 2]);

    capacity.release();
    await expect(third).resolves.toBe(true);
    expect(order).toEqual([1, 2, 3]);
    expect(capacity.queued).toBe(0);
  });

  // The bug this replaces: 11 simultaneous submissions meant the 11th got a flat
  // 503 with nothing to do but retry.
  it('serves a burst of 30 with a limit of 10 without rejecting anyone', async () => {
    const capacity = new Capacity({ limit: 10, waitMs: 5_000 });
    // Start all 30 without awaiting: awaiting inline would deadlock, since the
    // 11th request can only be granted once something is released.
    const all = Array.from({ length: 30 }, () => capacity.acquire());
    await vi.waitFor(() => expect(capacity.inUse).toBe(10));
    expect(capacity.queued).toBe(20);

    for (let i = 0; i < 20; i++) capacity.release();
    expect((await Promise.all(all)).every(Boolean)).toBe(true);
    expect(capacity.inUse).toBe(10);
    expect(capacity.queued).toBe(0);
  });

  it('gives up once the wait expires so a caller can be told to retry', async () => {
    const capacity = new Capacity({ limit: 1, waitMs: 20 });
    await capacity.acquire();
    expect(await capacity.acquire()).toBe(false);
    expect(capacity.queued).toBe(0);
  });

  it('removes a waiter whose client disconnected', async () => {
    const capacity = new Capacity({ limit: 1, waitMs: 5_000 });
    await capacity.acquire();
    const controller = new AbortController();
    const pending = capacity.acquire(controller.signal);
    expect(capacity.queued).toBe(1);

    // A student who closes the tab must not hold a place in the queue.
    controller.abort();
    expect(await pending).toBe(false);
    expect(capacity.queued).toBe(0);
  });

  it('refuses immediately when the signal is already aborted', async () => {
    const capacity = new Capacity({ limit: 1, waitMs: 1_000 });
    expect(await capacity.acquire(AbortSignal.abort())).toBe(false);
    expect(capacity.inUse).toBe(0);
    expect(capacity.queued).toBe(0);
  });

  // A released slot must transfer, not be lost to a race between the decrement
  // and the next waiter's wake-up — otherwise the server drifts below its limit.
  it('transfers a freed slot rather than losing it', async () => {
    const capacity = new Capacity({ limit: 3, waitMs: 1_000 });
    for (let i = 0; i < 3; i++) await capacity.acquire();
    const queued = [capacity.acquire(), capacity.acquire()];
    capacity.release();
    capacity.release();
    expect(await Promise.all(queued)).toEqual([true, true]);
    expect(capacity.inUse).toBe(3);
    expect(capacity.queued).toBe(0);
  });

  it('never drops below zero on an extra release', async () => {
    const capacity = new Capacity({ limit: 2, waitMs: 50 });
    await capacity.acquire();
    capacity.release();
    capacity.release();
    expect(capacity.inUse).toBe(0);
    // Still usable afterwards.
    expect(await capacity.acquire()).toBe(true);
  });

  // Regression: releasing to a waiter incremented the count, so `active` climbed
  // past the limit and new requests were admitted while every slot was busy.
  it('never exceeds the limit while handing slots to waiters', async () => {
    const capacity = new Capacity({ limit: 3, waitMs: 1_000 });
    const initial = await Promise.all([capacity.acquire(), capacity.acquire(), capacity.acquire()]);
    expect(initial).toEqual([true, true, true]);
    const waiting = [capacity.acquire(), capacity.acquire()];

    for (let i = 0; i < 6; i++) {
      capacity.release();
      expect(capacity.inUse).toBeLessThanOrEqual(3);
    }
    // 3 holders + 2 waiters = 5 releases to drain; the sixth finds an empty
    // queue and is clamped rather than going negative.
    expect(capacity.inUse).toBe(0);
    expect(capacity.queued).toBe(0);
    expect((await Promise.all(waiting)).every(Boolean)).toBe(true);
  });
});