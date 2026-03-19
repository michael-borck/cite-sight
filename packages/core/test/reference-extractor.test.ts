import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractReferences } from '../src/references/extractor.js';
import { extract } from '../src/extractors/index.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

// Expected bibliography entries in sample-paper.md
const EXPECTED_AUTHORS = [
  'Borck',
  'Frontiers',  // "Frontiers in Psychology" as author
  'Kasneci',
  'Laurillard',
  'Mollick',
  'National',   // "National Health and Medical Research Council"
  'Stojanov',
  'Thaler',
  'Vygotsky',
];

describe('reference extraction from markdown', () => {
  it('finds the reference section despite markdown ## heading', async () => {
    const doc = await extract(resolve(FIXTURES, 'sample-paper.md'));
    const { references } = extractReferences(doc.text);
    expect(references.length).toBeGreaterThanOrEqual(8);
  });

  it('parses all expected bibliography entries', async () => {
    const doc = await extract(resolve(FIXTURES, 'sample-paper.md'));
    const { references } = extractReferences(doc.text);

    const firstAuthors = references.map(r => r.authors[0]?.split(/[,\s]+/)[0] ?? '');
    for (const surname of EXPECTED_AUTHORS) {
      expect(firstAuthors, `should find a reference starting with "${surname}"`).toEqual(
        expect.arrayContaining([expect.stringContaining(surname)])
      );
    }
  });

  it('extracts DOIs where present', async () => {
    const doc = await extract(resolve(FIXTURES, 'sample-paper.md'));
    const { references } = extractReferences(doc.text);

    const kasneci = references.find(r => r.raw.includes('Kasneci'));
    expect(kasneci?.doi).toContain('10.1016/j.lindif.2023.102274');
  });

  it('extracts URLs where present', async () => {
    const doc = await extract(resolve(FIXTURES, 'sample-paper.md'));
    const { references } = extractReferences(doc.text);

    const stojanov = references.find(r => r.raw.includes('Stojanov'));
    expect(stojanov?.url).toContain('arxiv.org');
  });

  it('extracts years correctly', async () => {
    const doc = await extract(resolve(FIXTURES, 'sample-paper.md'));
    const { references } = extractReferences(doc.text);

    const vygotsky = references.find(r => r.raw.includes('Vygotsky'));
    expect(vygotsky?.year).toBe(1978);

    const thaler = references.find(r => r.raw.includes('Thaler'));
    expect(thaler?.year).toBe(2008);
  });

  it('extracts in-text citations', async () => {
    const doc = await extract(resolve(FIXTURES, 'sample-paper.md'));
    const { inTextCitations } = extractReferences(doc.text);

    expect(inTextCitations.length).toBeGreaterThanOrEqual(6);

    const authors = inTextCitations.flatMap(c => c.authors.map(a => a.toLowerCase()));
    expect(authors).toEqual(expect.arrayContaining(['vygotsky']));
    // "Kasneci et al." is parsed as a single author string including "et al."
    expect(authors.some(a => a.includes('kasneci'))).toBe(true);
  });

  it('does not include post-references content (e.g. checklists) as references', async () => {
    // The sample-paper.md has no post-references content, but the original
    // grant document has "## Applicant Checklist" after References.
    // This test ensures the section boundary logic works.
    const textWithTrailer = `
# Intro

Some text (Smith, 2020).

## References

Smith, J. (2020). A study. *Journal, 1,* 1-10.

---

## Appendix

This should not be parsed as a reference.

Jones, K. (2021). Another study. *Journal, 2,* 11-20.
`;
    const { references } = extractReferences(textWithTrailer);
    expect(references).toHaveLength(1);
    expect(references[0].raw).toContain('Smith');
  });
});

describe('reference extraction across formats', () => {
  it('extracts same number of references from .md, .txt, .docx', async () => {
    const md = await extract(resolve(FIXTURES, 'sample-paper.md'));
    const txt = await extract(resolve(FIXTURES, 'sample-paper.txt'));
    const docx = await extract(resolve(FIXTURES, 'sample-paper.docx'));

    const mdRefs = extractReferences(md.text);
    const txtRefs = extractReferences(txt.text);
    const docxRefs = extractReferences(docx.text);

    // All three should find the same set of references
    expect(mdRefs.references.length).toBeGreaterThanOrEqual(8);
    expect(txtRefs.references.length).toBe(mdRefs.references.length);
    expect(docxRefs.references.length).toBe(mdRefs.references.length);
  });

  it('extracts references from PDF', async () => {
    const pdf = await extract(resolve(FIXTURES, 'sample-paper.pdf'));
    const { references } = extractReferences(pdf.text);

    // PDF extraction produces continuous text, so the splitter may miss some
    // references. We expect at least 5 of the 9 to be found.
    expect(references.length).toBeGreaterThanOrEqual(5);
  });
});
