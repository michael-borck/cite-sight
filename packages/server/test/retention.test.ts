import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { REPORT_TTL_SECONDS } from '../src/retention.js';
import type { AnalysisResult } from '@michaelborck/cite-sight-core';

const state = vi.hoisted(() => ({
  analyze: vi.fn(), unlink: vi.fn(async () => undefined),
  processor: null as null | ((job: { id: string; data: object }) => Promise<void>),
  add: vi.fn(async () => ({ id: 'job-1' })),
  fromId: vi.fn(async () => null),
  clean: vi.fn(async () => []),
  values: new Map<string, { value: string; expires: number }>(),
  set: vi.fn(),
}));

vi.mock('fs/promises', () => ({ unlink: state.unlink }));
vi.mock('@michaelborck/cite-sight-core', () => ({ analyzePipeline: state.analyze }));
vi.mock('bullmq', () => {
  const client = {
    set: state.set.mockImplementation(async (key: string, value: string, mode: string, seconds: number) => {
      if (mode !== 'EX') throw new Error('An expiry is required');
      state.values.set(key, { value, expires: Date.now() + seconds * 1000 });
      return 'OK';
    }),
    get: async (key: string) => {
      const stored = state.values.get(key);
      return stored && stored.expires > Date.now() ? stored.value : null;
    },
  };
  return {
    Queue: class {
      client = Promise.resolve(client);
      on() { return this; }
      async waitUntilReady() { return client; }
      clean = state.clean;
      add = state.add;
    },
    Worker: class {
      constructor(_name: string, processor: typeof state.processor) { state.processor = processor; }
      on() { return this; }
    },
    Job: { fromId: state.fromId },
  };
});

let queue: typeof import('../src/queue.js');
const data = { filePath: '/test/upload.txt', citationStyle: 'auto' as const, checkUrls: false, checkDoi: false, checkInText: true };
const result: AnalysisResult = {
  fileName: 'upload.txt', extractedText: 'PRIVATE DOCUMENT BODY', processingTime: 10,
  references: {
    references: [], inTextCitations: [], verifications: [],
    crossReference: { unmatchedBibliography: [], unmatchedInText: [] },
    detectedStyle: 'unknown', totalReferences: 0, verifiedCount: 0, suspiciousCount: 0,
    notFoundCount: 0, unverifiedCount: 0, brokenUrlCount: 0, sourceListLikely: false,
  },
};

beforeAll(async () => {
  vi.useFakeTimers();
  vi.stubEnv('REDIS_URL', 'redis://test.invalid');
  queue = await import('../src/queue.js');
  await vi.waitFor(() => expect(queue.isQueueAvailable()).toBe(true));
});
afterAll(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('queued report lifecycle', () => {
  it('removes legacy terminal jobs and disables BullMQ result retention', async () => {
    expect(state.clean).toHaveBeenCalledWith(0, 1000, 'completed');
    expect(state.clean).toHaveBeenCalledWith(0, 1000, 'failed');
    await queue.addJob(data);
    expect(state.add).toHaveBeenCalledWith('analyze', data, expect.objectContaining({
      removeOnComplete: true, removeOnFail: true,
    }));
  });

  it('serves the report after job removal without ever persisting full document text', async () => {
    state.analyze.mockResolvedValue(result);
    const workerReturn = await state.processor!({ id: 'completed', data });
    expect(workerReturn).toBeUndefined();
    expect(state.unlink).toHaveBeenCalledWith(data.filePath);
    expect(state.set).toHaveBeenCalledWith('cite-sight:report:completed', expect.not.stringContaining('PRIVATE DOCUMENT BODY'), 'EX', REPORT_TTL_SECONDS);
    expect(await queue.getJob('completed')).toMatchObject({ status: 'complete', result: { extractedText: '' } });
    expect(result.extractedText).toBe('PRIVATE DOCUMENT BODY');
    expect(await queue.cancelJob('completed')).toBe('finished');
  });

  it('expires a completed report without any further queue activity', async () => {
    await vi.advanceTimersByTime(REPORT_TTL_SECONDS * 1000 + 1);
    expect(await queue.getJob('completed')).toBeNull();
  });

  it('expires failures and still cleans the upload', async () => {
    state.analyze.mockRejectedValue(new Error('Parser failed'));
    await expect(state.processor!({ id: 'failed', data })).rejects.toThrow('Parser failed');
    expect(await queue.getJob('failed')).toMatchObject({ status: 'failed', error: 'Parser failed', expiresAt: expect.any(String) });
    expect(state.unlink).toHaveBeenCalledWith(data.filePath);
    await vi.advanceTimersByTime(REPORT_TTL_SECONDS * 1000 + 1);
    expect(await queue.getJob('failed')).toBeNull();
  });
});
