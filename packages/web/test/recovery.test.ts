// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readRecovery, RECOVERY_KEY, writeRecovery } from '../src/utils/recovery';
import { sampleResult } from '../../core/test/fixtures/analysis-result';

const options = { citationStyle: 'auto' as const, checkUrls: true, checkDoi: true, checkInText: true, screenshotUrls: false };
beforeEach(() => sessionStorage.clear());
describe('web refresh recovery', () => {
  it('keeps a queued job ID without needing the original upload', () => {
    writeRecovery(sessionStorage, { version: 1, jobId: 'job-123', fileName: 'paper.pdf', options });
    expect(readRecovery(sessionStorage).snapshot).toMatchObject({ jobId: 'job-123', fileName: 'paper.pdf' });
  });
  it('saves updated reports with full document text removed', () => {
    const result = sampleResult('verified');
    writeRecovery(sessionStorage, { version: 1, fileName: 'paper.txt', options, result, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    expect(sessionStorage.getItem(RECOVERY_KEY)).not.toContain('Private assignment text.');
    expect(readRecovery(sessionStorage).snapshot?.result?.references.verifiedCount).toBe(1);
  });
  it('clears expired or corrupted recovery data with an explanatory message', () => {
    sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, jobId: 'job-123', fileName: 'paper.pdf', options, expiresAt: '2020-01-01T00:00:00Z' }));
    expect(readRecovery(sessionStorage).message).toMatch(/expired/);
    expect(sessionStorage.getItem(RECOVERY_KEY)).toBeNull();
    sessionStorage.setItem(RECOVERY_KEY, '{');
    expect(readRecovery(sessionStorage).message).toMatch(/could not be restored/);
  });
});
