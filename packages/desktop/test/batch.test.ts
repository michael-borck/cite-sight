import { describe, expect, it, vi } from 'vitest';
import { runBatch } from '../src/renderer/batch';
import type { AnalysisResult } from '@michaelborck/cite-sight-core';

describe('desktop batch processing', () => {
  it('continues after a failed document and retains successful results', async () => {
    const completed = vi.fn(); const failed = vi.fn();
    await runBatch(['one.txt', 'bad.pdf', 'three.txt'], {
      stopped: () => false, started: vi.fn(), completed, failed,
      analyze: async (path) => { if (path === 'bad.pdf') throw new Error('No text'); return { fileName: path } as AnalysisResult; },
    });
    expect(completed.mock.calls.map(([path]) => path)).toEqual(['one.txt', 'three.txt']);
    expect(failed).toHaveBeenCalledWith('bad.pdf', 'No text');
  });
  it('finishes the active file before stopping and leaves later files untouched', async () => {
    let stop = false; const completed = vi.fn(); const started = vi.fn();
    await runBatch(['one.txt', 'two.txt'], {
      stopped: () => stop, started, completed, failed: vi.fn(),
      analyze: async (path) => { stop = true; return { fileName: path } as AnalysisResult; },
    });
    expect(started).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledWith('one.txt', { fileName: 'one.txt' });
  });
});
