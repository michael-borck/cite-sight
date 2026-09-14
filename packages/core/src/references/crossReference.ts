import type { ParsedReference, InTextCitation, CrossReferenceResult } from '../types.js';

function authorKey(author: string): string {
  return author.replace(/\s+et\s+al\.?$/i, '').replace(/['’]s$/i, '').normalize('NFC')
    .toLowerCase().replace(/[^\p{L}]/gu, '');
}

function matches(ref: ParsedReference, cite: InTextCitation): boolean {
  // Author-date and MLA citations identify the work by its first author.
  // Preserve multi-word corporate names and kerning-split hyphenated surnames.
  const refAuthor = authorKey((ref.authors[0] ?? '').split(',')[0]);
  const citeAuthor = authorKey(cite.authors[0] ?? '');
  if (!refAuthor || !citeAuthor || refAuthor !== citeAuthor) return false;
  if (cite.year !== null && ref.year !== cite.year) return false;
  if (cite.year !== null && (ref.yearSuffix ?? '') !== (cite.yearSuffix ?? '')) return false;
  return true;
}

export function crossReferenceCheck(
  references: ParsedReference[],
  inTextCitations: InTextCitation[],
): CrossReferenceResult {
  return {
    unmatchedBibliography: references.filter((ref) => !inTextCitations.some((cite) => matches(ref, cite))),
    unmatchedInText: inTextCitations.filter((cite) => !references.some((ref) => matches(ref, cite))),
  };
}
