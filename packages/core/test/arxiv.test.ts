import { describe, it, expect } from 'vitest';
import { extractArxivId, parseArxivFeed } from '../src/references/arxiv.js';

describe('extractArxivId', () => {
  it('extracts a prefixed ID anywhere in the string', () => {
    expect(extractArxivId('Chen, Y., et al. 2025. "Reasoning Models," arXiv:2505.05410.')).toBe('2505.05410');
    expect(extractArxivId('arXiv preprint arXiv:2205.11916 (Google DeepMind)')).toBe('2205.11916');
    expect(extractArxivId('https://arxiv.org/abs/2303.11366v3')).toBe('2303.11366');
  });

  it('accepts a bare ID only when the string mentions arXiv', () => {
    expect(extractArxivId('Title, arXiv Preprint, 2410.05229.')).toBe('2410.05229');
    // Same digits without arXiv context: could be a page range or report number.
    expect(extractArxivId('Journal of Things (12:3), pp. 2410.05229.')).toBeNull();
  });

  it('returns null when no ID is present', () => {
    expect(extractArxivId('Gentner, D. 1983. "Structure-Mapping," Cognitive Science (7:2).')).toBeNull();
  });
});

describe('parseArxivFeed', () => {
  const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html">ArXiv Query: search_query=&amp;id_list=2505.05410</title>
  <entry>
    <id>http://arxiv.org/abs/2505.05410v1</id>
    <published>2025-05-08T17:52:22Z</published>
    <title>Reasoning Models Don&#39;t Always Say What They
 Think</title>
    <author><name>Yanda Chen</name></author>
    <author><name>Joe Benton</name></author>
  </entry>
</feed>`;

  it('parses entry title (unwrapping line breaks), authors, year, and ID', () => {
    const [e] = parseArxivFeed(FEED);
    expect(e.title).toBe("Reasoning Models Don't Always Say What They Think");
    expect(e.authors).toEqual(['Yanda Chen', 'Joe Benton']);
    expect(e.year).toBe(2025);
    expect(e.id).toBe('2505.05410');
  });

  it('ignores the feed-level title element', () => {
    expect(parseArxivFeed(FEED)).toHaveLength(1);
  });

  it('returns empty for a no-result feed', () => {
    expect(parseArxivFeed('<feed><title>ArXiv Query</title></feed>')).toEqual([]);
  });
});
