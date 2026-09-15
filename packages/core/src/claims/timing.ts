import type { RuntimeEstimate } from '../types.js';

/** Broad planning ranges, not deadlines or confidence intervals. */
export function unitEstimate(units: number, mode: 'claims' | 'references', observedMs?: number): RuntimeEstimate {
  const count = Math.max(0, units);
  if (observedMs !== undefined && Number.isFinite(observedMs) && observedMs > 0) return { minMs: count * observedMs * 0.6, maxMs: count * observedMs * 1.8, basis: 'observed' };
  return { minMs: count * (mode === 'claims' ? 10_000 : 2000), maxMs: count * (mode === 'claims' ? 180_000 : 45_000), basis: 'planning' };
}

export function remainingEstimate(total: number, completed: number, elapsedMs: number, initial: RuntimeEstimate): RuntimeEstimate {
  if (completed >= total) return { minMs: 0, maxMs: 0, basis: completed ? 'observed' : initial.basis };
  if (completed > 0 && elapsedMs > 0) {
    const duration = (total - completed) * elapsedMs / completed;
    return { minMs: duration * 0.6, maxMs: duration * 1.8, basis: 'observed' };
  }
  return { ...initial, minMs: Math.max(0, initial.minMs - elapsedMs), maxMs: Math.max(initial.maxMs - elapsedMs, 1000) };
}

export function durationRange(estimate: RuntimeEstimate): string {
  const duration = (ms: number) => ms < 60_000 ? `${Math.max(0, Math.ceil(ms / 1000))} seconds`
    : ms < 3_600_000 ? `${Math.ceil(ms / 60_000)} minutes` : `${(ms / 3_600_000).toFixed(1)} hours`;
  return `${duration(estimate.minMs)} to ${duration(estimate.maxMs)}`;
}
