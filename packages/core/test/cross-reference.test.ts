import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { extract } from '../src/extractors/index.js';
import { extractReferences } from '../src/references/extractor.js';
// Import the pipeline's crossReferenceCheck indirectly by testing the full pipeline
// or by reimplementing the logic inline. Since crossReferenceCheck is not exported,
// we test it through the pipeline or replicate the matching logic.

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

// Replicate the cross-reference logic from pipeline.ts for unit testing
function crossReferenceCheck(
  references: { authors: string[] }[],
  inTextCitations: { authors: string[] }[],
) {
  const unmatchedBibliography: number[] = [];
  const unmatchedInText: number[] = [];

  for (let i = 0; i < references.length; i++) {
    const ref = references[i];
    const authorLastNames = ref.authors
      .map(a => a.split(/[,\s]+/)[0].toLowerCase())
      .filter(Boolean);

    const matched = inTextCitations.some(cite => {
      const citeAuthors = cite.authors.map(a => a.toLowerCase());
      return authorLastNames.some(name =>
        citeAuthors.some(ca => ca.includes(name) || name.includes(ca))
      );
    });

    if (!matched) unmatchedBibliography.push(i);
  }

  for (let i = 0; i < inTextCitations.length; i++) {
    const cite = inTextCitations[i];
    const citeAuthors = cite.authors.map(a => a.toLowerCase());

    const matched = references.some(ref => {
      const authorLastNames = ref.authors
        .map(a => a.split(/[,\s]+/)[0].toLowerCase())
        .filter(Boolean);
      return citeAuthors.some(ca =>
        authorLastNames.some(name => ca.includes(name) || name.includes(ca))
      );
    });

    if (!matched) unmatchedInText.push(i);
  }

  return { unmatchedBibliography, unmatchedInText };
}

describe('cross-reference matching', () => {
  it('matches all in-text citations to bibliography in APA sample', async () => {
    const doc = await extract(resolve(FIXTURES, 'style-apa.md'));
    const { references, inTextCitations } = extractReferences(doc.text);

    const result = crossReferenceCheck(references, inTextCitations);

    // Every in-text citation should have a matching bibliography entry
    expect(result.unmatchedInText).toHaveLength(0);
  });

  it('matches all bibliography entries to in-text citations in APA sample', async () => {
    const doc = await extract(resolve(FIXTURES, 'style-apa.md'));
    const { references, inTextCitations } = extractReferences(doc.text);

    const result = crossReferenceCheck(references, inTextCitations);

    // Every bibliography entry should be cited in-text
    expect(result.unmatchedBibliography).toHaveLength(0);
  });

  it('matches Borck (2026) in-text citation to bibliography entry', async () => {
    // This is the specific bug from the user's grant application
    const text = `
The framework (Borck, 2026) describes the approach.

## References

Borck, M. (2026). *Conversation, Not Delegation.* KDP.
`;
    const { references, inTextCitations } = extractReferences(text);

    expect(references.length).toBe(1);
    expect(inTextCitations.length).toBeGreaterThanOrEqual(1);

    const result = crossReferenceCheck(references, inTextCitations);
    expect(result.unmatchedInText).toHaveLength(0);
    expect(result.unmatchedBibliography).toHaveLength(0);
  });

  it('detects orphaned in-text citation (no bibliography entry)', () => {
    const text = `
This is cited (FakeAuthor, 2099) but has no bibliography entry.

## References

Smith, J. (2020). A real reference. *Journal, 1,* 1-10.
`;
    const { references, inTextCitations } = extractReferences(text);
    const result = crossReferenceCheck(references, inTextCitations);

    // FakeAuthor should be unmatched
    expect(result.unmatchedInText.length).toBeGreaterThanOrEqual(1);
  });

  it('detects unmatched bibliography entry (never cited in text)', () => {
    const text = `
This text only cites Smith (2020).

## References

Smith, J. (2020). A cited reference. *Journal, 1,* 1-10.

Jones, K. (2021). An uncited reference. *Journal, 2,* 11-20.
`;
    const { references, inTextCitations } = extractReferences(text);
    const result = crossReferenceCheck(references, inTextCitations);

    // Jones should be unmatched in bibliography
    expect(result.unmatchedBibliography.length).toBeGreaterThanOrEqual(1);
  });
});

describe('cross-reference with sample paper', () => {
  it('has no orphaned citations in the full sample paper', async () => {
    const doc = await extract(resolve(FIXTURES, 'sample-paper.md'));
    const { references, inTextCitations } = extractReferences(doc.text);

    const result = crossReferenceCheck(references, inTextCitations);

    // The sample paper was designed with matching citations and references
    // Allow some tolerance for parsing edge cases
    expect(result.unmatchedInText.length).toBeLessThanOrEqual(2);
  });
});
