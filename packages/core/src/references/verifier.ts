import type {
  ParsedReference,
  CitationStyle,
  ReferenceVerification,
  VerificationStatus,
  AcademicWork,
  FormatIssue,
} from '../types.js';
import { validateFormat } from './formatValidator.js';
import { resolveDoi } from './doiResolver.js';
import { searchCrossref } from './crossref.js';
import { searchSemanticScholar } from './semanticScholar.js';
import { searchOpenAlex } from './openAlex.js';
import { checkUrl } from './urlChecker.js';

// ============================================================
// Title similarity (Jaccard on word sets)
// ============================================================

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute Jaccard similarity between two title strings.
 * Returns a value in [0, 1].
 */
export function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const setB = new Set(normalizeTitle(b).split(' ').filter(Boolean));

  if (setA.size === 0 || setB.size === 0) return 0;

  const intersection = new Set([...setA].filter((w) => setB.has(w)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

// ============================================================
// Flag helpers
// ============================================================

const CURRENT_YEAR = new Date().getFullYear();

function computeFlags(
  ref: ParsedReference,
  matched: AcademicWork | undefined,
  similarity: number,
  hasFormatIssues: boolean,
): string[] {
  const flags: string[] = [];

  if (ref.year && ref.year > CURRENT_YEAR) flags.push('future_date');
  if (!ref.doi) flags.push('no_doi');
  if (hasFormatIssues) flags.push('format_issues');

  if (matched) {
    if (similarity < 0.5 && similarity > 0) flags.push('metadata_mismatch');
    if (matched.year && ref.year && Math.abs(matched.year - ref.year) > 1) {
      flags.push('year_mismatch');
    }
  }

  return flags;
}

function computeStatus(
  matched: AcademicWork | undefined,
  similarity: number,
  confidenceScore: number,
): VerificationStatus {
  if (!matched) return 'not_found';
  if (confidenceScore >= 0.9) return 'verified';
  if (confidenceScore >= 0.7) return 'likely_valid';
  if (similarity < 0.3) return 'suspicious';
  return 'likely_valid';
}

function computeConfidence(
  matched: AcademicWork | undefined,
  similarity: number,
  doiResolved: boolean,
): number {
  if (!matched) return 0.0;
  if (doiResolved && similarity >= 0.8) return 1.0;
  if (doiResolved) return 0.85;
  if (similarity >= 0.8) return 0.8;
  if (similarity >= 0.5) return 0.5;
  return 0.2;
}

// ============================================================
// Polite delay between API calls
// ============================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const INTER_REF_DELAY_MS = 400;

// ============================================================
// Single-reference verification
// ============================================================

async function verifySingleReference(
  ref: ParsedReference,
  options: { mailto?: string; citationStyle: CitationStyle },
): Promise<ReferenceVerification> {
  const effectiveStyle: CitationStyle =
    options.citationStyle === ('auto' as CitationStyle)
      ? ref.detectedStyle
      : options.citationStyle;

  // --- Step 1: Format validation ---
  const formatIssues: FormatIssue[] = validateFormat(ref, effectiveStyle);

  let matched: AcademicWork | undefined;
  let doiResolved = false;
  let similarity = 0;

  // --- Step 2: DOI resolution ---
  if (ref.doi) {
    const resolved = await resolveDoi(ref.doi, options.mailto);
    if (resolved) {
      matched = resolved;
      doiResolved = true;
      similarity = resolved.title ? titleSimilarity(ref.title, resolved.title) : 0;
    }
  }

  // --- Step 3: Search Crossref ---
  if (!matched) {
    const searchQuery = [ref.authors[0], ref.title].filter(Boolean).join(' ');
    if (searchQuery.length > 3) {
      const crossrefResults = await searchCrossref(searchQuery, options.mailto);
      for (const work of crossrefResults) {
        const sim = titleSimilarity(ref.title, work.title);
        if (sim > similarity) {
          similarity = sim;
          matched = work;
        }
      }
      // Only keep Crossref match if similarity is meaningful
      if (similarity < 0.3) matched = undefined;
    }
  }

  // --- Step 4: Semantic Scholar fallback ---
  if (!matched) {
    const searchQuery = [ref.authors[0], ref.title].filter(Boolean).join(' ');
    if (searchQuery.length > 3) {
      const s2Results = await searchSemanticScholar(searchQuery);
      for (const work of s2Results) {
        const sim = titleSimilarity(ref.title, work.title);
        if (sim > similarity) {
          similarity = sim;
          matched = work;
        }
      }
      if (similarity < 0.3) matched = undefined;
    }
  }

  // --- Step 5: OpenAlex fallback ---
  if (!matched) {
    const searchQuery = [ref.authors[0], ref.title].filter(Boolean).join(' ');
    if (searchQuery.length > 3) {
      const oaResults = await searchOpenAlex(searchQuery, options.mailto);
      for (const work of oaResults) {
        const sim = titleSimilarity(ref.title, work.title);
        if (sim > similarity) {
          similarity = sim;
          matched = work;
        }
      }
      if (similarity < 0.3) matched = undefined;
    }
  }

  // --- Step 6: URL check ---
  let urlCheck = undefined;
  if (ref.url) {
    urlCheck = await checkUrl(ref.url);
  }

  // --- Step 7: Confidence score ---
  const confidenceScore = computeConfidence(matched, similarity, doiResolved);

  // --- Step 8: Flags ---
  const hasFormatIssues = formatIssues.length > 0;

  // Add broken_url flag if applicable
  let flags = computeFlags(ref, matched, similarity, hasFormatIssues);
  if (urlCheck && (urlCheck.status === 'dead' || urlCheck.status === 'timeout' || urlCheck.status === 'error')) {
    flags = [...flags, 'broken_url'];
  }

  const status = computeStatus(matched, similarity, confidenceScore);

  return {
    reference: ref,
    status,
    formatIssues,
    matchedWork: matched,
    urlCheck,
    confidenceScore,
    flags,
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Verify an array of parsed references against external academic databases.
 *
 * Runs the full cascade for each reference:
 *  1. Format validation
 *  2. DOI resolution via Crossref
 *  3. Search Crossref
 *  4. Search Semantic Scholar
 *  5. Search OpenAlex
 *  6. URL check (if URL present)
 *
 * A small delay is inserted between references to respect API rate limits.
 */
export async function verifyReferences(
  refs: ParsedReference[],
  options: { mailto?: string; citationStyle: CitationStyle },
): Promise<ReferenceVerification[]> {
  const results: ReferenceVerification[] = [];

  for (let i = 0; i < refs.length; i++) {
    if (i > 0) await delay(INTER_REF_DELAY_MS);

    const verification = await verifySingleReference(refs[i], options);
    results.push(verification);
  }

  return results;
}
