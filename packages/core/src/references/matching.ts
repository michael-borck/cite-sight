import type { AcademicWork, ParsedReference } from '../types.js';

/** Preserve every script; compare accent-folded forms without changing display text. */
export function normalizeTitle(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function surnameOf(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^\p{L},'\-\s]/gu, '').trim().toLowerCase();
  if (cleaned.includes(',')) return cleaned.split(',')[0].trim();
  return cleaned.split(/\s+/).pop() ?? '';
}

export type Corroboration = 'match' | 'mismatch' | 'unknown';

export function authorCorroboration(refAuthors: string[], workAuthors: string[]): Corroboration {
  const surnames = (authors: string[]) => authors.filter((a) => !/^et\s+al\.?$/i.test(a.trim()))
    .map(surnameOf).filter(Boolean);
  const cited = surnames(refAuthors);
  const recorded = new Set(surnames(workAuthors));
  if (!cited.length || !recorded.size) return 'unknown';
  // One coincidentally shared surname must not excuse other conflicting authors.
  if (!cited.every((name) => recorded.has(name))) return 'mismatch';
  const initial = (name: string) => {
    const words = normalizeTitle(name).split(' ');
    const given = name.includes(',') ? normalizeTitle(name.split(',').slice(1).join(' ')) : words.length > 1 ? words[0] : '';
    return [...given][0] ?? '';
  };
  for (const author of refAuthors.filter((a) => !/^et\s+al\.?$/i.test(a.trim()))) {
    const known = initial(author);
    const matches = workAuthors.filter((a) => surnameOf(a) === surnameOf(author));
    if (known && matches.every((a) => initial(a) && initial(a) !== known)) return 'mismatch';
  }
  return 'match';
}

export function subtitleVariant(a: string, b: string): boolean {
  const main = (value: string) => normalizeTitle(value.split(/[:：]/)[0]);
  return (main(a) !== normalizeTitle(a) && main(a) === normalizeTitle(b)) ||
    (main(b) !== normalizeTitle(b) && main(b) === normalizeTitle(a));
}

export function yearCorroboration(a: number | null, b: number | null | undefined): Corroboration {
  if (!a || !b) return 'unknown';
  return Math.abs(a - b) <= 1 ? 'match' : 'mismatch';
}

/** Critical token changes must not disappear inside an otherwise high fuzzy score. */
export function titleTokenConflict(a: string, b: string): boolean {
  const critical = (title: string) => normalizeTitle(title).split(' ')
    .filter((word) => /^(not|no|without|non|never|retraction|retracted|correction|erratum|corrigendum|review)$/.test(word) || /\d/.test(word)).sort().join(' ');
  return critical(a) !== critical(b);
}

export function bibliographicConflicts(ref: ParsedReference, work: AcademicWork): string[] {
  const flags: string[] = [];
  const doi = (value: string) => value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim().toLowerCase();
  if (ref.doi && work.doi && doi(ref.doi) !== doi(work.doi)) flags.push('doi_mismatch');
  for (const field of ['volume', 'issue', 'pages'] as const) {
    if (ref[field] && work[field] && normalizeTitle(ref[field]) !== normalizeTitle(work[field])) {
      flags.push(`${field}_mismatch`);
    }
  }
  // Journal abbreviations vary too much to treat a string inequality as a conflict.
  return flags;
}

/** Bounded edit distance, used only for near-identical titles of similar length. */
export function characterSimilarity(a: string, b: string): number {
  if (!a || !b || Math.max(a.length, b.length) > 1000) return 0;
  if (Math.min(a.length, b.length) / Math.max(a.length, b.length) < 0.9) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}
