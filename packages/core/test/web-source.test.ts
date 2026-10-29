import { afterEach, describe, expect, it } from 'vitest';
import { setFetch } from '../src/httpClient.js';
import { setMinRequestInterval } from '../src/references/rateLimiter.js';
import { verifyWebSource } from '../src/references/webSourceVerifier.js';
import type { ParsedReference } from '../src/types.js';

const htmlResponse = (head: string, body = 'An article.') => new Response(
  `<html><head>${head}</head><body>${body}</body></html>`,
  { headers: { 'content-type': 'text/html' } },
);

const page = (meta: string) => htmlResponse(meta);

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

  it('falls back to schema.org JSON-LD metadata', async () => {
    setMinRequestInterval(0);
    const data = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Example' },
        {
          '@type': 'NewsArticle',
          headline: 'A title',
          author: [
            { '@type': 'Person', name: 'Jane Smith' },
            { '@type': 'Person', givenName: 'Kim', familyName: 'Jones' },
          ],
          datePublished: '2025-02-01T00:00:00Z',
        },
      ],
    };
    setFetch(async () => htmlResponse(
      `<script type="application/ld+json">${JSON.stringify(data)}</script>`,
    ));

    const work = await verifyWebSource(reference());

    expect(work).toMatchObject({ title: 'A title', authors: ['Jane Smith', 'Kim Jones'], year: 2025 });
  });

  it('falls back to the h1 and a visible byline when metadata is absent', async () => {
    setMinRequestInterval(0);
    setFetch(async () => htmlResponse(
      '',
      '<h1>Hooked: How to build habit-forming products</h1>'
      + '<p class="byline">By Jane Smith and John Doe.</p>',
    ));

    const work = await verifyWebSource(reference({
      authors: ['Smith, Jane', 'Doe, John'],
      title: 'Hooked',
    }));

    expect(work?.title).toBe('Hooked: How to build habit-forming products');
    expect(work?.authors).toEqual(['Jane Smith', 'John Doe']);
  });

  it('ignores malformed JSON-LD and still uses the meta tags', async () => {
    setMinRequestInterval(0);
    setFetch(async () => htmlResponse(
      '<script type="application/ld+json">{not json}</script>'
      + '<meta name="citation_title" content="A title">'
      + '<meta name="citation_author" content="Smith, Jane">',
    ));

    const work = await verifyWebSource(reference());

    expect(work?.title).toBe('A title');
    expect(work?.authors).toEqual(['Smith, Jane']);
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
