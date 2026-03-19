import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { extract } from '../src/extractors/index.js';
import { extractReferences } from '../src/references/extractor.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

describe('APA style detection', () => {
  it('detects APA style references', async () => {
    const doc = await extract(resolve(FIXTURES, 'style-apa.md'));
    const { references } = extractReferences(doc.text);

    expect(references.length).toBe(6);

    const apaCount = references.filter(r => r.detectedStyle === 'apa').length;
    // Most references should be detected as APA
    expect(apaCount).toBeGreaterThanOrEqual(4);
  });

  it('extracts APA in-text citations (Author, Year)', async () => {
    const doc = await extract(resolve(FIXTURES, 'style-apa.md'));
    const { inTextCitations } = extractReferences(doc.text);

    expect(inTextCitations.length).toBeGreaterThanOrEqual(4);

    // APA citations should have years
    const withYears = inTextCitations.filter(c => c.year !== null);
    expect(withYears.length).toBeGreaterThanOrEqual(4);
  });
});

describe('MLA style detection', () => {
  it('finds references under "Works Cited" heading', async () => {
    const doc = await extract(resolve(FIXTURES, 'style-mla.md'));
    const { references } = extractReferences(doc.text);

    expect(references.length).toBe(6);
  });

  it('detects MLA style references', async () => {
    const doc = await extract(resolve(FIXTURES, 'style-mla.md'));
    const { references } = extractReferences(doc.text);

    const mlaCount = references.filter(r => r.detectedStyle === 'mla').length;
    // At least some should be detected as MLA (quoted titles)
    expect(mlaCount).toBeGreaterThanOrEqual(2);
  });

  it('extracts MLA in-text citations (Author Page)', async () => {
    const doc = await extract(resolve(FIXTURES, 'style-mla.md'));
    const { inTextCitations } = extractReferences(doc.text);

    // MLA uses (Author Page) format — some may also match APA narrative pattern
    expect(inTextCitations.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Chicago style detection', () => {
  it('finds references under "Bibliography" heading', async () => {
    const doc = await extract(resolve(FIXTURES, 'style-chicago.md'));
    const { references } = extractReferences(doc.text);

    expect(references.length).toBe(6);
  });

  it('detects Chicago footnote markers', async () => {
    const doc = await extract(resolve(FIXTURES, 'style-chicago.md'));
    const { inTextCitations } = extractReferences(doc.text);

    // Chicago uses [1], [2], etc.
    expect(inTextCitations.length).toBeGreaterThanOrEqual(4);
  });
});

describe('cross-style consistency', () => {
  it('extracts 6 references from each style file', async () => {
    const apa = await extract(resolve(FIXTURES, 'style-apa.md'));
    const mla = await extract(resolve(FIXTURES, 'style-mla.md'));
    const chicago = await extract(resolve(FIXTURES, 'style-chicago.md'));

    const apaRefs = extractReferences(apa.text);
    const mlaRefs = extractReferences(mla.text);
    const chicagoRefs = extractReferences(chicago.text);

    expect(apaRefs.references.length).toBe(6);
    expect(mlaRefs.references.length).toBe(6);
    expect(chicagoRefs.references.length).toBe(6);
  });
});
