import type { ParsedReference, InTextCitation, CrossReferenceResult } from '../types.js';

/** Normalised comparison form of one author name. */
export function authorKey(author: string): string {
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
/** All surnames in a citation or reference author list, normalised. Splits
 *  "Surname, F." and "F. Surname, Surname2" sequences so initials never glue
 *  onto a surname ("Wilmot, M." must not become "wilmotm"). */
function citedSurnames(authors: string[]): string[] {
  return authors.flatMap((author) => author.split(/\s*(?:\band\b|&|,|;|\s+)\s*/i))
    .map((token) => authorKey(token))
    .filter((name) => name.length >= 3);
}

/** One hand-typing slip: a single edit, or an adjacent-letter transposition
 *  ("Teh" -> "The"). Two plain edits stay a mismatch ("Williams"/"Williamson"
 *  are different people). */
function surnameSlip(a: string, b: string): boolean {
  if (withinEditDistance(a, b, 1)) return true;
  if (a.length !== b.length) return false;
  const differing = [...a].flatMap((ch, i) => ch === b[i] ? [] : [i]);
  return differing.length === 2 && differing[1] === differing[0] + 1 &&
    a[differing[0]] === b[differing[1]] && a[differing[1]] === b[differing[0]];
}

export function nearMatches(ref: ParsedReference, cite: InTextCitation): boolean {
  if (referenceMatchesCitation(ref, cite)) return false;
  const sameYear = cite.year !== null && ref.year === cite.year &&
    (ref.yearSuffix ?? '') === (cite.yearSuffix ?? '');
  const yearOffByOne = cite.year !== null && ref.year !== null &&
    Math.abs(cite.year - ref.year) === 1;
  const refAuthor = authorKey((ref.authors[0] ?? '').split(',')[0]);
  const citeAuthor = authorKey(cite.authors[0] ?? '');

  // Spelled almost right, same year: "Smth (2020)" for Smith (2020).
  if (sameYear && refAuthor.length >= 3 && citeAuthor.length >= 3) {
    const refSurnames = ref.authors.flatMap((a) => citedSurnames([a]));
    if (surnameSlip(refAuthor, citeAuthor) ||
      refSurnames.some((surname) => surnameSlip(surname, citeAuthor))) {
      return true;
    }
  }
  // A cited surname appears in the entry's author list — students naming a
  // work by its second or third author ("Swailes and Senior (2007)" for
  // Aritzeta, Swailes & Senior).
  if (sameYear && citedSurnames(ref.authors).some((surname) =>
    citedSurnames(cite.authors).includes(surname))) {
    return true;
  }
  // Surname exactly right, year one off: "Wilmot and Ones (2020)" for a 2019
  // paper — the classic hand-typed year slip.
  if (yearOffByOne && refAuthor.length >= 3 && citeAuthor.length >= 3 &&
    citedSurnames(ref.authors).some((surname) =>
      citedSurnames(cite.authors).includes(surname))) {
    return true;
  }
  return false;
}

export function crossReferenceCheck(
  references: ParsedReference[],
  inTextCitations: InTextCitation[],
): CrossReferenceResult {
  // Exact matches claim their citation and entry first; near matching (typo
  // suggestions) only considers what is left, so a year-slip suggestion can
  // never steal a citation that another entry identifies exactly.
  const exactForCite = new Map<InTextCitation, ParsedReference>();
  for (const cite of inTextCitations) {
    const exact = references.find((ref) => referenceMatchesCitation(ref, cite));
    if (exact) exactForCite.set(cite, exact);
  }
  const matchedRefs = new Set(exactForCite.values());

  const pairs: NonNullable<CrossReferenceResult['nearMatches']> = [];
  for (const cite of inTextCitations) {
    if (exactForCite.has(cite)) continue;
    const guessed = references.find((ref) => !matchedRefs.has(ref) && nearMatches(ref, cite));
    if (guessed) {
      matchedRefs.add(guessed);
      pairs.push({ cite, reference: guessed });
    }
  }

  return {
    // Near matches are cited-with-a-typos, not orphans: keep them out of both
    // unmatched lists and report them as suggestions alongside.
    unmatchedBibliography: references.filter((ref) => !matchedRefs.has(ref)),
    unmatchedInText: inTextCitations.filter((cite) =>
      !exactForCite.has(cite) && !pairs.some((pair) => pair.cite === cite)),
    nearMatches: pairs.length ? pairs : undefined,
  };
}
