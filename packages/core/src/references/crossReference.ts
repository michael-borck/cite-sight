import type { ParsedReference, InTextCitation, CrossReferenceResult } from '../types.js';

function authorKey(author: string): string {
  return author.replace(/\s+et\s+al\.?$/i, '').replace(/['’]s$/i, '').normalize('NFC')
    .toLowerCase().replace(/[^\p{L}]/gu, '');
}

/** Exact author-date identification. Also used by claim mapping. */
export function referenceMatchesCitation(ref: ParsedReference, cite: InTextCitation): boolean {
  // Author-date and MLA citations identify the work by its first author.
  // Preserve multi-word corporate names and kerning-split hyphenated surnames.
  const refAuthor = authorKey((ref.authors[0] ?? '').split(',')[0]);
  const citeAuthor = authorKey(cite.authors[0] ?? '');
  if (!refAuthor || !citeAuthor || refAuthor !== citeAuthor) return false;
  if (cite.year !== null && ref.year !== cite.year) return false;
  if (cite.year !== null && (ref.yearSuffix ?? '') !== (cite.yearSuffix ?? '')) return false;
  return true;
}

/** Bounded Levenshtein distance — true when a and b differ by at most `max`
 *  edits. Early-exits as soon as the bound is provably exceeded. */
export function withinEditDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > max) return false;
    previous = row;
  }
  return previous[b.length] <= max;
}

/**
 * A near match is a citation that ALMOST identifies a bibliography entry —
 * same year, surname within two edits ("Smth" → "Smith"). Hand-typed
 * references (common where EndNote is unavailable) make these spelling
 * slips routine, so they are surfaced as suggestions rather than orphans.
 */
export function nearMatches(ref: ParsedReference, cite: InTextCitation): boolean {
  if (referenceMatchesCitation(ref, cite)) return false;
  if (cite.year !== null && ref.year !== cite.year) return false;
  if (cite.year !== null && (ref.yearSuffix ?? '') !== (cite.yearSuffix ?? '')) return false;
  const refAuthor = authorKey((ref.authors[0] ?? '').split(',')[0]);
  const citeAuthor = authorKey(cite.authors[0] ?? '');
  if (refAuthor.length < 3 || citeAuthor.length < 3) return false;
  // One edit covers dropped/doubled/changed letters ("Smth" -> "Smith").
  // An adjacent-letter transposition ("Teh" -> "The") counts as one slip too.
  // Two plain edits stay a mismatch: "Williams"/"Williamson" are different people.
  if (withinEditDistance(refAuthor, citeAuthor, 1)) return true;
  if (refAuthor.length === citeAuthor.length) {
    const differing = [...refAuthor].flatMap((ch, i) => ch === citeAuthor[i] ? [] : [i]);
    return differing.length === 2 && differing[1] === differing[0] + 1 &&
      refAuthor[differing[0]] === citeAuthor[differing[1]] &&
      refAuthor[differing[1]] === citeAuthor[differing[0]];
  }
  return false;
}

export function crossReferenceCheck(
  references: ParsedReference[],
  inTextCitations: InTextCitation[],
): CrossReferenceResult {
  const pairs = inTextCitations.flatMap((cite) => {
    const reference = references.find((ref) => referenceMatchesCitation(ref, cite));
    if (reference) return [];
    const guessed = references.find((ref) => nearMatches(ref, cite));
    return guessed ? [{ cite, reference: guessed }] : [];
  });
  return {
    // Near matches are cited-with-a-typos, not orphans: keep them out of both
    // unmatched lists and report them as suggestions alongside.
    unmatchedBibliography: references.filter((ref) =>
      !inTextCitations.some((cite) => referenceMatchesCitation(ref, cite) || nearMatches(ref, cite))),
    unmatchedInText: inTextCitations.filter((cite) =>
      !references.some((ref) => referenceMatchesCitation(ref, cite) || nearMatches(ref, cite))),
    nearMatches: pairs.length ? pairs : undefined,
  };
}
