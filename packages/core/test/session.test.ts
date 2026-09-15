import { describe, expect, it } from 'vitest';
import { makeReviewSession, parseReviewSession } from '../src/session.js';
import { sampleResult } from './fixtures/analysis-result.js';
import { reviewKey } from '../src/review.js';

const options = { citationStyle: 'apa' as const, documentType: 'assignment' as const,
  checkUrls: true, checkDoi: true, checkInText: true, screenshotUrls: false,
  semanticScholarApiKey: 'private-key', openAlexApiKey: 'private-openalex-key', contactEmail: 'private@example.edu',
};
describe('portable review sessions', () => {
  it('preserves review decisions and source paths without document text or credentials', () => {
    const result = sampleResult('suspicious');
    result.reviews = { [reviewKey(result, 'ref:0')]: { decision: 'citation_error', reviewedAt: '2026-09-14T00:00:00Z' } };
    const session = makeReviewSession([{ path: '/papers/essay.txt', status: 'complete', result, options }], options);
    const json = JSON.stringify(session);
    expect(json).not.toContain('private-key'); expect(json).not.toContain('private@example.edu');
    expect(json).not.toContain('private-openalex-key');
    expect(json).not.toContain('Private assignment text.');
    const reopened = parseReviewSession(JSON.parse(json));
    expect(reopened.files[0].path).toBe('/papers/essay.txt');
    expect(reopened.files[0].result?.reviews).toEqual(result.reviews);
    expect(result.extractedText).toBe('Private assignment text.');
  });
  it('restores interrupted files as waiting and retains errors for retries', () => {
    const session = makeReviewSession([{ path: '/one.txt', status: 'processing' }, { path: '/two.pdf', status: 'failed', error: 'No text' }], options);
    expect(parseReviewSession(session).files.map((file) => file.status)).toEqual(['waiting', 'failed']);
  });
  it('rejects incompatible sessions and malformed result data', () => {
    expect(() => parseReviewSession({ format: 'something-else', version: 1 })).toThrow(/not a supported/);
    const session = makeReviewSession([{ path: '/one.txt', status: 'complete', result: sampleResult() }], options);
    (session.files[0].result!.references.verifications[0].reference as unknown as { title: unknown }).title = { invalid: true };
    expect(() => parseReviewSession(session)).toThrow(/Document 1/);
  });
  it('rejects malformed publication notices before rendering an imported session', () => {
    const result = sampleResult('verified');
    const session = makeReviewSession([{ path: '/one.txt', status: 'complete', result }], options);
    Object.assign(session.files[0].result!.references.verifications[0], { publicationCheck: { status: 'checked', updates: 'not an array' } });
    expect(() => parseReviewSession(session)).toThrow(/Document 1/);
  });
});
