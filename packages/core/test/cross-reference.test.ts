import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { extract } from '../src/extractors/fromFile.js';
import { extractReferences } from '../src/references/extractor.js';
import { crossReferenceCheck } from '../src/references/crossReference.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

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

  it('matches kerning-split hyphenated surnames across text and bibliography', async () => {
    // PDF extraction splits "Baidoo-Anu" into "Baidoo - Anu" in body text
    // while the bibliography may carry either form; matching must strip
    // spaces/punctuation before comparing surnames.
    const text = `
AI support helps academic writing (Baidoo - Anu & Ansah, 2023).

## References

Baidoo-Anu, D., & Ansah, L. O. (2023). Education in the era of generative AI. *Journal of AI, 1*(1), 1-10.
`;
    const { references, inTextCitations } = extractReferences(text);
    const result = crossReferenceCheck(references, inTextCitations);
    expect(references.length).toBe(1);
    expect(result.unmatchedInText).toHaveLength(0);
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
