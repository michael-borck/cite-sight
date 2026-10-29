import { afterEach, describe, expect, it } from 'vitest';
import { setFetch } from '../src/httpClient.js';
import { setMinRequestInterval } from '../src/references/rateLimiter.js';
import { verifyWebSource } from '../src/references/webSourceVerifier.js';
import type { ParsedReference } from '../src/types.js';

const page = (meta: string) => new Response(
  `<html><head>${meta}</head><body>An article.</body></html>`,
  { headers: { 'content-type': 'text/html' } },
);

const reference = (over: Partial<ParsedReference> = {}): ParsedReference => ({
  raw: '',
  authors: ['Smith, J.', 'Jones, K.', 'Brown, L.'],
  title: 'A title',
  year: 2025,
  url: 'https://example.com/article',
  detectedStyle: 'apa',
  ...over,
});

afterEach(() => {
  setFetch(undefined);
  setMinRequestInterval(1000);
});

describe('web source verification', () => {
  it('collects every citation_author meta tag', async () => {
    setMinRequestInterval(0);
    setFetch(async () => page(`
      <meta name="citation_title" content="A title">
      <meta name="citation_author" content="Smith, Jane">
      <meta name="citation_author" content="Jones, Kim">
      <meta name="citation_author" content="Brown, Lee">
      <meta name="citation_publication_date" content="2025">
    `));

    const work = await verifyWebSource(reference());

    expect(work?.authors).toEqual(['Smith, Jane', 'Jones, Kim', 'Brown, Lee']);
  });

  it('retries a rate-limited page instead of reporting it unavailable', async () => {
    setMinRequestInterval(0);
    let calls = 0;
    setFetch(async () => {
      calls++;
      if (calls === 1) return new Response(null, { status: 429, headers: { 'retry-after': '0' } });
      return page(`
        <meta name="citation_title" content="A title">
        <meta name="citation_author" content="Smith, Jane">
        <meta name="citation_publication_date" content="2025">
      `);
    });

    const work = await verifyWebSource(reference());

    expect(calls).toBe(2);
    expect(work?.title).toBe('A title');
  });
});
