import { expect, it, vi } from 'vitest';
import { retryOutcomes } from '../src/retry.js';
import { verifyReferences, analyzePipeline } from '@michaelborck/cite-sight-core';
import type { AnalysisResult } from '@michaelborck/cite-sight-core';

vi.mock('@michaelborck/cite-sight-core', async (original) => ({
  ...await original<object>(), verifyReferences: vi.fn(), analyzePipeline: vi.fn(),
}));

it('rechecks only unavailable references and recomputes report totals', async () => {
  const reference = { raw: 'Smith (2020). Work.', authors: ['Smith'], title: 'Work', year: 2020, detectedStyle: 'apa' as const };
  const available = { reference, status: 'verified' as const, flags: [], formatIssues: [], confidenceScore: .9, matchCategory: 'exact' as const };
  const result = { fileName: 'paper.txt', extractedText: '', processingTime: 0, references: {
    verifications: [available, { ...available, status: 'unverified' }], verifiedCount: 1, unverifiedCount: 1,
  } } as AnalysisResult;
  vi.mocked(verifyReferences).mockResolvedValue([available]);
  const [retried] = await retryOutcomes([{ file: '/missing-original.txt', result }], { citationStyle: 'auto', checkUrls: false, checkDoi: true, checkInText: true, screenshotUrls: false }, 'unavailable');
  expect(analyzePipeline).not.toHaveBeenCalled();
  expect(verifyReferences).toHaveBeenCalledTimes(1);
  expect(retried.result?.references).toMatchObject({ verifiedCount: 2, unverifiedCount: 0 });
});
