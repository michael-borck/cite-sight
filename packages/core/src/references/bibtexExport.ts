import type { AcademicWork, ReferenceVerification } from '../types.js';

// ============================================================
// BibTeX export of VERIFIED matches.
//
// The lookup cache is the wrong source for this — it is query-shaped and
// holds candidate lists, wrong candidates included. The right source is a
// document's verification results: each verified reference's matchedWork is
// a registry-confirmed record, usually carrying the DOI the original
// citation lacked. Scanning a paper thus yields a clean bibliography as a
// by-product of checking it.
// ============================================================

/** Statuses whose matched work is trustworthy enough to export. */
const EXPORTABLE = new Set(['verified', 'likely_valid']);

const STOPWORDS = new Set([
  'a', 'an', 'the', 'on', 'of', 'for', 'and', 'or', 'in', 'to', 'with',
  'is', 'are', 'at', 'by', 'from', 'as', 'its', 'do', 'does', 'not',
]);

/** Surname of the first author, lowercased ASCII-ish. */
function firstSurname(work: AcademicWork): string {
  const a = work.authors[0] ?? '';
  const surname = a.includes(',') ? a.split(',')[0] : (a.split(/\s+/).pop() ?? '');
  const cleaned = surname.toLowerCase().replace(/[^a-z]/g, '');
  return cleaned || 'anon';
}

/** First substantive title word, lowercased. */
function firstTitleWord(work: AcademicWork): string {
  for (const w of work.title.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w && !STOPWORDS.has(w) && !/^\d+$/.test(w)) return w;
  }
  return 'work';
}

/**
 * Citekey in author+year+titleword form (e.g. gentner1983structure) — the
 * common convention, deduplicated with letter suffixes within one export.
 */
export function citekeyFor(work: AcademicWork, taken: Set<string>): string {
  const base = `${firstSurname(work)}${work.year ?? 'nd'}${firstTitleWord(work)}`;
  let key = base;
  let suffix = 0;
  while (taken.has(key)) {
    suffix += 1;
    key = `${base}${String.fromCharCode(96 + suffix)}`; // a, b, c…
  }
  taken.add(key);
  return key;
}

/** Escape the characters BibTeX treats specially inside field values. */
function esc(s: string): string {
  return s.replace(/([\\{}%&$#_])/g, '\\$1');
}

/** "Family, Given" passthrough; join multiple authors with " and ". */
function bibAuthors(work: AcademicWork): string {
  return work.authors.map((a) => esc(a.trim())).filter(Boolean).join(' and ');
}

function entryFor(work: AcademicWork, key: string): string {
  const isArxiv = work.source === 'arxiv';
  const type = work.journal && !isArxiv ? 'article' : 'misc';
  const lines: string[] = [`@${type}{${key},`];
  const field = (name: string, value: string | undefined | null) => {
    if (value) lines.push(`  ${name.padEnd(9)}= {${value}},`);
  };
  field('author', bibAuthors(work));
  // Double-brace the title so BibTeX styles preserve its casing.
  if (work.title) lines.push(`  title    = {{${esc(work.title)}}},`);
  if (!isArxiv) field('journal', work.journal ? esc(work.journal) : undefined);
  field('volume', work.volume);
  field('number', work.issue);
  field('pages', work.pages);
  field('year', work.year ? String(work.year) : undefined);
  field('doi', work.doi);
  if (isArxiv) {
    const id = work.doi?.replace(/^10\.48550\/arXiv\./i, '');
    field('eprint', id);
    field('archivePrefix', id ? 'arXiv' : undefined);
  }
  if (!work.doi) field('url', work.url);
  // Trim the trailing comma on the last field line.
  const last = lines.length - 1;
  lines[last] = lines[last].replace(/,$/, '');
  lines.push('}');
  return lines.join('\n');
}

/**
 * Render the verified matches of a verification run as a BibTeX file.
 * Skips unverified/suspicious/not-found rows (their matches are exactly the
 * records NOT to trust) and web-source matches with no bibliographic shape.
 */
export function exportBibtex(verifications: ReferenceVerification[]): string {
  const taken = new Set<string>();
  const entries: string[] = [];
  for (const v of verifications) {
    const w = v.matchedWork;
    if (!w || !EXPORTABLE.has(v.status)) continue;
    if (!w.title || w.authors.length === 0) continue;
    if (w.source === 'youtube' || w.source === 'vimeo' || w.source === 'web_metadata') continue;
    entries.push(entryFor(w, citekeyFor(w, taken)));
  }
  const header =
    `% ${entries.length} verified reference${entries.length === 1 ? '' : 's'} exported by CiteSight.\n` +
    '% Records are registry matches (Crossref/OpenAlex/Semantic Scholar/arXiv/DataCite)\n' +
    '% for citations that verified — review before relying on them; unverified and\n' +
    '% suspicious rows are deliberately not exported.\n\n';
  return header + entries.join('\n\n') + '\n';
}
