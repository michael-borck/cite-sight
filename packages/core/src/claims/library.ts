import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { authorKey } from '../references/crossReference.js';
import { normalizeTitle } from '../references/matching.js';
import { extractFromBytes } from '../extractors/fromBytes.js';
import { MAX_INPUT_BYTES } from '../extractors/limits.js';
import { withinEditDistance } from '../references/crossReference.js';
import type { ParsedReference } from '../types.js';
import { sourcePassages, type Passage } from './evidence.js';

export interface LibraryEntry {
  path: string;
  fileName: string;
  sha256: string;
  passages: Passage[];
  /** Distinctive words and surnames for matching (opening pages only). */
  matchTokens: Set<string>;
  years: Set<number>;
}

const SUPPORTED = /\.(pdf|docx|txt|md|qmd)$/i;
const MAX_LIBRARY_FILES = 80;
const MATCH_PREFIX_CHARS = 4000;

/** Index the coordinator's unit source folder. Content-based matching, so
 *  filenames don't matter. Bounded: at most 80 files, and stops once the
 *  extracted-text budget is exhausted. */
export async function buildLibraryIndex(libraryPath: string, textBudget = 32 * 1024 * 1024): Promise<LibraryEntry[]> {
  const names = (await readdir(libraryPath, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && SUPPORTED.test(entry.name))
    .slice(0, MAX_LIBRARY_FILES);
  const entries: LibraryEntry[] = [];
  for (const name of names) {
    const path = join(libraryPath, name.name);
    if ((await stat(path)).size > MAX_INPUT_BYTES) continue;
    let bytes: Buffer;
    let doc;
    try {
      bytes = await readFile(path);
      doc = await extractFromBytes(bytes, name.name);
    } catch {
      continue; // Corrupt or mislabelled file (e.g. text saved as .docx) — skip, never fail the run.
    }
    textBudget -= doc.text.length;
    if (textBudget < 0) break;
    const prefix = doc.text.slice(0, MATCH_PREFIX_CHARS);
    entries.push({
      path, fileName: doc.fileName,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      passages: sourcePassages(doc),
      matchTokens: matchTokens(prefix),
      years: new Set([...prefix.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => Number(match[0]))),
    });
  }
  return entries;
}

function matchTokens(text: string): Set<string> {
  const tokens = normalizeTitle(text).split(' ').filter((word) => word.length >= 5);
  // Shorter surnames still count ("Wu", "Ng").
  for (const word of text.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/u)) {
    const key = authorKey(word);
    if (key.length >= 2 && key.length <= 4) tokens.push(key);
  }
  return new Set(tokens.filter(Boolean));
}

/** Score one library file against one bibliography entry. A match needs the
 *  entry's surname plus at least two distinctive title words in the file's
 *  opening pages; year adds a point. Exported for tests. */
export function scoreLibraryFile(file: LibraryEntry, reference: ParsedReference): number {
  const surname = authorKey((reference.authors[0] ?? '').split(',')[0]);
  let score = 0;
  if (surname.length >= 2) {
    for (const token of file.matchTokens) {
      if (token === surname || (surname.length >= 5 && withinEditDistance(token, surname, 1))) { score += 2; break; }
    }
  }
  let matchedTitleWords = 0;
  for (const word of normalizeTitle(reference.title).split(' ').filter((w) => w.length >= 5)) {
    if (file.matchTokens.has(word)) matchedTitleWords++;
  }
  score += Math.min(3, matchedTitleWords) * 2;
  if (reference.year && file.years.has(reference.year)) score += 1;
  return score;
}

/** Pick the best library entry for a reference, or undefined. Ties resolve
 *  to the first file (stable, deterministic). */
export function matchLibraryEntry(library: LibraryEntry[], reference: ParsedReference): LibraryEntry | undefined {
  let best: LibraryEntry | undefined;
  let bestScore = 5; // surname(2) + 2 title words(4) is 6; year-only(1..3) never matches
  for (const file of library) {
    const score = scoreLibraryFile(file, reference);
    if (score > bestScore) { best = file; bestScore = score; }
  }
  return best;
}
