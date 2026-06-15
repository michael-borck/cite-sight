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
import { verifyWebSource } from './webSourceVerifier.js';

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

/**
 * Directional title containment: how much of the *shorter* title's word set is
 * present in the *longer* one, plus the size of that smaller set (so callers can
 * require a minimum length before trusting it). High containment with a low
 * Jaccard is the signature of a main-title / full-title-with-subtitle pair
 * (e.g. registry "To Trust or to Think" vs cited "To trust or to think:
 * Cognitive forcing functions ..."), not a genuine mismatch.
 */
export function titleContainment(a: string, b: string): { containment: number; smallerSize: number } {
  if (!a || !b) return { containment: 0, smallerSize: 0 };
  const setA = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const setB = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return { containment: 0, smallerSize: 0 };
  const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  let inter = 0;
  for (const w of small) if (large.has(w)) inter++;
  return { containment: inter / small.size, smallerSize: small.size };
}

// ============================================================
// Author / year corroboration
//
// Title similarity alone cannot tell a real reference from a fabricated one:
// a hallucinated title often word-overlaps an unrelated real paper, and the
// "real author + fake title" pattern shares the author and year with a genuine
// work. Verdicts therefore corroborate the matched work against the reference's
// *author* and *year*, not just its title.
// ============================================================

/** Reduce an author string ("Vaswani, A." | "Ashish Vaswani") to a surname. */
function surnameOf(name: string): string {
  const cleaned = name.trim().replace(/[^A-Za-z,'\-\s]/g, '');
  if (!cleaned) return '';
  if (cleaned.includes(',')) return cleaned.split(',')[0].trim().toLowerCase();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  return (tokens[tokens.length - 1] ?? '').toLowerCase();
}

type Corroboration = 'match' | 'mismatch' | 'unknown';

/** Does any of the reference's authors appear among the matched work's authors? */
function authorCorroboration(refAuthors: string[], workAuthors: string[]): Corroboration {
  if (refAuthors.length === 0 || workAuthors.length === 0) return 'unknown';
  const refSurnames = refAuthors.map(surnameOf).filter((s) => s.length >= 2);
  const workSurnames = new Set(workAuthors.map(surnameOf).filter((s) => s.length >= 2));
  if (refSurnames.length === 0 || workSurnames.size === 0) return 'unknown';
  return refSurnames.some((s) => workSurnames.has(s)) ? 'match' : 'mismatch';
}

function yearCorroboration(refYear: number | null, workYear: number | null | undefined): Corroboration {
  if (!refYear || !workYear) return 'unknown';
  return Math.abs(refYear - workYear) <= 1 ? 'match' : 'mismatch';
}

// Title-similarity bands.
const TITLE_FLOOR = 0.3; // below this, the match is discarded (→ not_found)
const TITLE_STRONG = 0.8;
const TITLE_MODERATE = 0.6;

interface MatchAssessment {
  status: VerificationStatus;
  confidence: number;
  flags: string[];
}

/**
 * Decide a verdict for a reference that matched an academic-database work.
 * Corroborates the match against author + year so that a high title overlap
 * with the *wrong* work, or a plausible title on the *wrong* author/year, is
 * surfaced as `suspicious` rather than waved through as `likely_valid`.
 */
function assessAcademicMatch(
  ref: ParsedReference,
  work: AcademicWork,
  titleSim: number,
  doiResolved: boolean,
  doiHadMetadata: boolean,
): MatchAssessment {
  const author = authorCorroboration(ref.authors, work.authors);
  const year = yearCorroboration(ref.year, work.year);
  const flags: string[] = [];
  if (author === 'mismatch') flags.push('author_mismatch');

  // --- DOI path: the reference carried a DOI that resolved ---
  if (doiResolved) {
    if (!doiHadMetadata) {
      // The DOI is registered on doi.org but we could not fetch metadata to
      // confirm the claimed title/authors. Registration is moderate evidence
      // the work exists; the citation's accuracy is unconfirmed.
      flags.push('doi_unconfirmed');
      return { status: 'likely_valid', confidence: 0.65, flags };
    }
    // The DOI is authoritative — it already resolved to this specific work.
    // Accept a strong word-overlap match OR a containment match, where one
    // title is (almost) wholly contained in the other. The latter is the
    // common case where a registry stores only the main title and the citation
    // adds a subtitle (or vice versa); a low Jaccard there is not a mismatch.
    const { containment, smallerSize } = titleContainment(ref.title, work.title);
    const subsetMatch =
      (smallerSize >= 4 && containment >= 0.8) || // longer titles: near-full overlap
      (smallerSize >= 2 && containment >= 0.999); // short titles: require full containment
    if (titleSim >= 0.7 || subsetMatch) {
      // Exact-ish title match is strongest; a subset match is slightly weaker.
      const base = titleSim >= 0.7 ? 0.97 : 0.9;
      return { status: 'verified', confidence: author === 'mismatch' ? Math.min(base, 0.85) : base, flags };
    }
    // DOI resolves to a genuinely DIFFERENT-titled work: a real DOI grafted
    // onto a mismatched (often fabricated) citation.
    flags.push('doi_title_mismatch');
    return { status: 'suspicious', confidence: 0.35, flags };
  }

  // --- Search-match path (no resolving DOI) ---
  if (titleSim >= TITLE_STRONG) {
    if (author === 'mismatch' && year === 'mismatch') {
      // Same title but wrong author AND year → a different work, or fabricated.
      return { status: 'suspicious', confidence: 0.4, flags };
    }
    const corroborated = author === 'match' || year === 'match';
    return corroborated
      ? { status: 'verified', confidence: 0.92, flags }
      : { status: 'likely_valid', confidence: 0.8, flags };
  }

  if (titleSim >= TITLE_MODERATE) {
    // Partial title match: trust it only when the author corroborates and the
    // year doesn't contradict.
    if (author === 'match' && year !== 'mismatch') {
      return { status: 'likely_valid', confidence: 0.7, flags };
    }
    return { status: 'suspicious', confidence: 0.4, flags };
  }

  // Weak title match [TITLE_FLOOR, TITLE_MODERATE): we found *a* paper but its
  // title does not really correspond to the claim. This is the signature of a
  // fabricated or badly-garbled reference — even when author/year happen to
  // line up (the "real author, fake title" hallucination).
  flags.push('weak_match');
  return { status: 'suspicious', confidence: 0.3, flags };
}

// ============================================================
// Reference-intrinsic flags (independent of any match)
// ============================================================

const CURRENT_YEAR = new Date().getFullYear();

function computeIntrinsicFlags(
  ref: ParsedReference,
  matched: AcademicWork | undefined,
  hasFormatIssues: boolean,
): string[] {
  const flags: string[] = [];

  if (ref.year && ref.year > CURRENT_YEAR) flags.push('future_date');
  if (!ref.doi) flags.push('no_doi');
  if (hasFormatIssues) flags.push('format_issues');

  if (matched && matched.year && ref.year && Math.abs(matched.year - ref.year) > 1) {
    flags.push('year_mismatch');
  }

  return flags;
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
  let doiHadMetadata = false;
  let similarity = 0;
  let apiErrored = false; // a lookup threw — distinct from "no results"

  const searchQuery = [ref.authors[0], ref.title].filter(Boolean).join(' ');

  // Pick the best candidate (highest title similarity) from a result set,
  // keeping it only if it clears the floor.
  const considerResults = (results: AcademicWork[]): void => {
    for (const work of results) {
      const sim = titleSimilarity(ref.title, work.title);
      if (sim > similarity) {
        similarity = sim;
        matched = work;
      }
    }
    if (similarity < TITLE_FLOOR) matched = undefined;
  };

  // --- Step 2: DOI resolution ---
  if (ref.doi) {
    try {
      const resolved = await resolveDoi(ref.doi, options.mailto);
      if (resolved) {
        matched = resolved;
        doiResolved = true;
        doiHadMetadata = Boolean(resolved.title);
        similarity = resolved.title ? titleSimilarity(ref.title, resolved.title) : 0;
      }
    } catch {
      apiErrored = true;
    }
  }

  // --- Steps 3–5: academic search cascade (Crossref → S2 → OpenAlex) ---
  if (!matched && searchQuery.length > 3) {
    for (const search of [
      () => searchCrossref(searchQuery, options.mailto),
      () => searchSemanticScholar(searchQuery),
      () => searchOpenAlex(searchQuery, options.mailto),
    ]) {
      if (matched) break;
      try {
        considerResults(await search());
      } catch {
        apiErrored = true;
      }
    }
  }

  // --- Step 6: Web source verification (non-academic fallback) ---
  let isWebSource = false;
  if (!matched && (ref.url || ref.raw)) {
    try {
      const webResult = await verifyWebSource(ref);
      if (webResult) {
        const sim = ref.title ? titleSimilarity(ref.title, webResult.title) : 0;
        if (sim >= TITLE_FLOOR || !ref.title) {
          matched = webResult;
          similarity = sim;
          isWebSource = true;
        }
      }
    } catch {
      apiErrored = true;
    }
  }

  // --- Step 7: URL check ---
  let urlCheck = undefined;
  if (ref.url) {
    urlCheck = await checkUrl(ref.url);
  }

  // --- Step 8: Verdict ---
  const hasFormatIssues = formatIssues.length > 0;
  let flags = computeIntrinsicFlags(ref, matched, hasFormatIssues);

  let status: VerificationStatus;
  let confidenceScore: number;

  if (isWebSource && matched) {
    // Non-academic sources get capped confidence — never 'verified'.
    const isStructuredApi =
      matched.source === 'youtube' || matched.source === 'vimeo' || matched.source === 'open_library';
    const maxConfidence = isStructuredApi ? 0.75 : 0.6;
    confidenceScore = similarity >= 0.5 ? maxConfidence : maxConfidence * 0.8;
    status = confidenceScore >= 0.7 ? 'likely_valid' : similarity >= TITLE_FLOOR ? 'likely_valid' : 'suspicious';
    flags = flags.filter((f) => f !== 'no_doi');
    flags.push('web_source');
  } else if (matched) {
    const assessment = assessAcademicMatch(ref, matched, similarity, doiResolved, doiHadMetadata);
    status = assessment.status;
    confidenceScore = assessment.confidence;
    flags.push(...assessment.flags);
  } else {
    // Nothing matched. Distinguish a genuine miss from a lookup that failed:
    // a network/API error must not masquerade as a confident "not found".
    status = 'not_found';
    confidenceScore = 0;
    if (apiErrored) flags.push('verification_unavailable');
  }

  if (urlCheck && (urlCheck.status === 'dead' || urlCheck.status === 'timeout' || urlCheck.status === 'error')) {
    flags = [...flags, 'broken_url'];
  }

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
