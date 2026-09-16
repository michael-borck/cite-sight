import type { AnalysisResult, ParsedReference } from '../types.js';
import { referenceContentKey } from '../dashboard/priorityList.js';
import { authorKey } from '../references/crossReference.js';
import { normalizeTitle } from '../references/matching.js';

export interface UnitSourceEntry {
  key: string;
  title: string;
  authors: string[];
  year: number | null;
  /** How many submissions cite this work — the common readings sort first. */
  count: number;
  exampleRaw: string;
  submissions: string[];
}

/** Aggregate bibliography entries across submissions into common vs unique
 *  works. This is the shopping list: the coordinator collects the top items
 *  once, and every marker's claim run reuses them. */
export function unitSourceList(files: { file: string; references: ParsedReference[] }[]): UnitSourceEntry[] {
  const byKey = new Map<string, UnitSourceEntry>();
  for (const { file, references } of files) {
    const seenInFile = new Set<string>();
    for (const ref of references) {
      const key = [
        authorKey((ref.authors[0] ?? ref.raw).split(',')[0]),
        ref.year ?? 'nd',
        normalizeTitle(ref.title || ref.raw).split(' ').slice(0, 10).join(' '),
      ].join('|');
      if (seenInFile.has(key)) continue;
      seenInFile.add(key);
      const entry = byKey.get(key);
      if (entry) {
        entry.count++;
        if (!entry.submissions.includes(file)) entry.submissions.push(file);
      } else {
        byKey.set(key, { key, title: ref.title || ref.raw, authors: ref.authors, year: ref.year, count: 1, exampleRaw: ref.raw, submissions: [file] });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}

export interface ClaimOverlapPair {
  fileA: string;
  fileB: string;
  referenceKey: string;
  referenceExample: string;
  claimA: string;
  claimB: string;
  similarity: number;
}

/** Similar claims made by different submissions against the SAME shared
 *  reference. Informational only: common readings naturally invite similar
 *  statements, and identical wording may be legitimate (a shared quote or
 *  the unit study guide). A signal for the marker, never proof. */
/** Convenience wrapper: extract claim findings from completed results. */
export function claimOverlapFromResults(results: { file: string; result: AnalysisResult }[], threshold = 0.6): ClaimOverlapPair[] {
  const files = results.map(({ file, result }) => ({
    file,
    claims: (result.claims?.findings ?? []).map((finding) => ({
      claim: finding.claim,
      referenceKey: finding.referenceIndex !== undefined && result.references.references[finding.referenceIndex]
        ? referenceContentKey(result.references.references[finding.referenceIndex].raw)
        : `citation:${finding.citation}`,
    })),
  }));
  return claimOverlap(files, threshold);
}

export function claimOverlap(files: { file: string; claims: { claim: string; referenceKey: string }[] }[], threshold = 0.6): ClaimOverlapPair[] {
  const pairs: ClaimOverlapPair[] = [];
  for (let a = 0; a < files.length; a++) {
    for (let b = a + 1; b < files.length; b++) {
      const shared = new Map<string, string>();
      for (const { referenceKey, claim } of files[b].claims) {
        if (!shared.has(referenceKey)) shared.set(referenceKey, claim);
      }
      for (const { referenceKey, claim } of files[a].claims) {
        const other = shared.get(referenceKey);
        if (!other) continue;
        const similarity = claimSimilarity(claim, other);
        if (similarity >= threshold) {
          pairs.push({ fileA: files[a].file, fileB: files[b].file, referenceKey, referenceExample: referenceKey, claimA: claim, claimB: other, similarity });
        }
      }
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}

function claimTokens(text: string): Set<string> {
  // Light stemming: strip a trailing 's' so "adults"/"adult" and
  // "learners"/"learner" count as the same word.
  return new Set(normalizeTitle(text).split(' ')
    .filter((w) => w.length >= 4)
    .map((w) => w.endsWith('s') ? w.slice(0, -1) : w));
}

function claimSimilarity(a: string, b: string): number {
  const tokensA = claimTokens(a);
  const tokensB = claimTokens(b);
  if (!tokensA.size || !tokensB.size) return 0;
  const shared = [...tokensA].filter((t) => tokensB.has(t)).length;
  return shared / new Set([...tokensA, ...tokensB]).size;
}
