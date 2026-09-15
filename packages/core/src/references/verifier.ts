import type {
  ParsedReference,
  CitationStyle,
  ReferenceVerification,
  VerificationStatus,
  MatchCategory,
  AcademicWork,
  FormatIssue,
} from '../types.js';
import { validateFormat } from './formatValidator.js';
import { resolveDoi } from './doiResolver.js';
import { searchCrossref } from './crossref.js';
import { searchSemanticScholar } from './semanticScholar.js';
import { searchOpenAlex } from './openAlex.js';
import { searchDataCite } from './datacite.js';
import { searchEuropePmc } from './europePmc.js';
import { checkPublicationUpdates } from './publicationUpdates.js';
import { extractArxivId, lookupArxivId, searchArxiv } from './arxiv.js';
import { checkUrl } from './urlChecker.js';
import { verifyWebSource } from './webSourceVerifier.js';
import { LookupError, type LookupFailureReason } from './lookupError.js';
import { normalizeTitle, authorCorroboration, yearCorroboration, titleTokenConflict, bibliographicConflicts, characterSimilarity, subtitleVariant, repairedTitleQuery } from './matching.js';

// ============================================================
// Title similarity (Jaccard on word sets)
// ============================================================

/**
 * Word overlap with a bounded edit-distance rescue for nearly identical titles.
 * This heuristic score is in [0, 1], not a calibrated probability.
 */
export function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const setB = new Set(normalizeTitle(b).split(' ').filter(Boolean));

  if (setA.size === 0 || setB.size === 0) return 0;

  const intersection = new Set([...setA].filter((w) => setB.has(w)));
  const union = new Set([...setA, ...setB]);

  const overlap = intersection.size / union.size;
  const characters = characterSimilarity(normalizeTitle(a), normalizeTitle(b));
  return !titleTokenConflict(a, b) && characters >= 0.94 ? Math.max(overlap, characters) : overlap;
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

// Title-similarity bands.
const TITLE_FLOOR = 0.3; // below this, the match is discarded (→ not_found)
const TITLE_STRONG = 0.9;
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
  const flags: string[] = bibliographicConflicts(ref, work);
  if (author === 'mismatch') flags.push('author_mismatch');
  if (year === 'mismatch') flags.push('year_mismatch');
  if (ref.title && work.title && titleTokenConflict(ref.title, work.title)) flags.push('title_token_mismatch');
  if (doiHadMetadata || !doiResolved) {
    if (flags.includes('title_token_mismatch') || author === 'mismatch') {
      if (doiResolved && titleSim < 0.7) flags.push('doi_title_mismatch');
      return { status: 'suspicious', confidence: 0.35, flags };
    }
  }

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
    if (titleSim >= TITLE_MODERATE || subtitleVariant(ref.title, work.title)) {
      if (titleSim < TITLE_STRONG) flags.push('title_variant');
      return { status: flags.length || author !== 'match' ? 'likely_valid' : 'verified', confidence: flags.length ? 0.7 : 0.97, flags };
    }
    // DOI resolves to a genuinely DIFFERENT-titled work: a real DOI grafted
    // onto a mismatched (often fabricated) citation.
    flags.push('doi_title_mismatch');
    return { status: 'suspicious', confidence: 0.35, flags };
  }

  // --- Search-match path (no resolving DOI) ---

  // Explicit subtitle differences can explain low overlap, but need review.
  if (author === 'match' && titleSim < TITLE_STRONG && subtitleVariant(ref.title, work.title)) {
    flags.push('title_variant');
    return { status: 'likely_valid', confidence: 0.7, flags };
  }

  if (titleSim >= TITLE_STRONG) {
    const corroborated = author === 'match' && flags.length === 0;
    return corroborated
      ? { status: 'verified', confidence: 0.92, flags }
      : { status: 'likely_valid', confidence: 0.8, flags };
  }

  if (titleSim >= TITLE_MODERATE) {
    // Partial title match: trust it only when the author corroborates and the
    // year doesn't contradict.
    if (author === 'match' && year !== 'mismatch') {
      flags.push('title_variant');
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
// Grey literature
// ============================================================

/**
 * Grey-literature shape: venue-less references by organisational authors —
 * industry blogs, standards bodies, government and NGO reports. Academic
 * indexes do not carry these, so their absence from Crossref/OpenAlex/S2 is
 * the *expected* state, not evidence of fabrication; what can be checked is
 * whether the source lives where the citation says it does (its URL).
 * Detection is conservative: no DOI/journal/volume/pages, and either an
 * explicit URL or a single corporate-shaped author (no "Surname, Initial"
 * comma pattern — "Thoughtworks", "OECD", "World Health Organization").
 */
export function looksGreyLiterature(ref: ParsedReference): boolean {
  if (ref.doi || ref.journal || ref.volume || ref.pages) return false;
  if (ref.url) return true;
  if (ref.authors.length === 1) {
    const a = ref.authors[0].trim();
    const personShaped = /,\s*[A-Z]/.test(a);
    return !personShaped && a.length >= 3;
  }
  return false;
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
// Match categorisation
// ============================================================

/**
 * Derive the machine-readable match category from the decided status and
 * flags. Kept as a pure function of the verdict's outputs so it cannot drift
 * from the decision logic above.
 */
function categorize(
  status: VerificationStatus,
  flags: string[],
  matched: AcademicWork | undefined,
): MatchCategory {
  if (flags.includes('grey_literature')) return 'not_indexed_expected';
  if (!matched) return 'none';
  if (flags.includes('doi_title_mismatch') || flags.includes('doi_mismatch')) return 'conflict';
  if (flags.includes('ambiguous_match')) return 'match_dubious';
  if (status === 'suspicious') {
    // A matched-but-suspicious verdict with no author overlap means the best
    // candidate is probably a different work; the citation itself is
    // unmatched, and manual checking should start from that framing.
    return flags.includes('author_mismatch') || flags.includes('weak_match')
      ? 'match_dubious'
      : 'metadata_drift';
  }
  if (flags.includes('edition_difference')) return 'variant_record';
  if (flags.some((flag) => flag.endsWith('_mismatch')) || flags.includes('title_variant')) return 'metadata_drift';
  return 'exact';
}

// ============================================================
// Single-reference verification
// ============================================================

export interface VerifyOptions {
  offline?: boolean;
  mailto?: string;
  citationStyle: CitationStyle;
  semanticScholarApiKey?: string;
  openAlexApiKey?: string;
  /**
   * Whether to HTTP-check referenced URLs (step 7). Defaults to true. Browser
   * hosts pass false: cross-origin probes from a web page are blocked by CORS
   * for nearly every publisher, so every check would come back 'error'.
   */
  checkUrls?: boolean;
  checkDoi?: boolean;
}

async function verifySingleReference(
  ref: ParsedReference,
  options: VerifyOptions,
): Promise<ReferenceVerification> {
  const effectiveStyle: CitationStyle =
    options.citationStyle === ('auto' as CitationStyle)
      ? ref.detectedStyle
      : options.citationStyle;

  // --- Step 1: Format validation ---
  const formatIssues: FormatIssue[] = validateFormat(ref, effectiveStyle);
  if (options.offline) return {
    reference: ref, status: 'format_only', matchCategory: 'none', formatIssues,
    confidenceScore: 0, flags: ['offline'], evidence: { existence: 'unknown', metadata: 'unknown' },
  };

  let matched: AcademicWork | undefined;
  let doiResolved = false;
  let doiHadMetadata = false;
  let similarity = 0;
  let apiErrored = false; // a lookup threw — distinct from "no results"
  let isWebSource = false;

  // Capture *why* a lookup failed so the verdict can name it (e.g. "rate-limited
  // on Semantic Scholar"). A rate-limit reason is preferred over others because
  // it is the most actionable — it means "try again", not "this may be fake".
  let failure: { service: string; reason: LookupFailureReason } | undefined;
  const noteFailure = (err: unknown): void => {
    apiErrored = true;
    if (err instanceof LookupError) {
      if (!failure || (err.reason === 'rate_limited' && failure.reason !== 'rate_limited')) {
        failure = { service: err.service, reason: err.reason };
      }
    }
  };

  const searchQuery = [ref.authors[0], ref.title].filter(Boolean).join(' ');

  // Pick the best candidate from a result set by a JOINT score, not title
  // similarity alone. Title-only ranking picks the wrong record whenever a
  // similar-titled different work outranks the cited one — a book review over
  // the book, a "Design Science Research in IS" chapter over the "Design
  // Science in IS Research" article — and the wrong pick then reads as a
  // metadata mismatch blamed on the citation. Author overlap dominates the
  // tie-break; a corroborating year separates editions/reprints of the same
  // title. `similarity` still records the winner's plain title similarity,
  // which the verdict logic downstream interprets.
  let bestScore = 0;
  let matchedCorroborated = false;
  const candidates = new Map<string, { work: AcademicWork; score: number }>();
  const ambiguous = (): boolean => {
    const scores = [...candidates.values()].sort((a, b) => b.score - a.score);
    return scores.length > 1 && scores[0].score - scores[1].score < 0.08;
  };
  const strongMatch = (): boolean => Boolean(matched && similarity >= 0.9 && matchedCorroborated &&
    yearCorroboration(ref.year, matched.year) !== 'mismatch' &&
    !titleTokenConflict(ref.title, matched.title) && !bibliographicConflicts(ref, matched).length && !ambiguous());
  const considerResults = (results: AcademicWork[]): void => {
    for (const work of results) {
      const sim = titleSimilarity(ref.title, work.title);
      if (sim < TITLE_FLOOR) continue;
      const author = authorCorroboration(ref.authors, work.authors);
      const year = yearCorroboration(ref.year, work.year);
      const score =
        sim +
        (author === 'match' ? 0.25 : author === 'mismatch' ? -0.2 : 0) +
        (year === 'match' ? 0.1 : year === 'mismatch' ? -0.15 : 0) -
        bibliographicConflicts(ref, work).length * 0.1 +
        (ref.journal && work.journal && normalizeTitle(ref.journal) === normalizeTitle(work.journal) ? 0.1 : 0);
      const id = work.doi?.toLowerCase() ?? [normalizeTitle(work.title), work.authors.map(normalizeTitle).sort().join('|'), work.year].join(':');
      if (!candidates.has(id) || candidates.get(id)!.score < score) candidates.set(id, { work, score });
      if (score > bestScore) {
        bestScore = score;
        similarity = sim;
        matched = work;
        matchedCorroborated = author === 'match';
      }
    }
  };

  // --- Step 2: DOI resolution ---
  if (ref.doi && options.checkDoi !== false) {
    try {
      const resolved = await resolveDoi(ref.doi, options.mailto);
      if (resolved) {
        matched = resolved;
        doiResolved = true;
        doiHadMetadata = Boolean(resolved.title);
        similarity = resolved.title ? titleSimilarity(ref.title, resolved.title) : 0;
      }
    } catch (err) {
      noteFailure(err);
    }
  }

  // Resolve an explicit, checksum-valid ISBN before general academic searches.
  if (!matched && ref.raw) {
    try {
      const book = await verifyWebSource(ref, true);
      if (book && authorCorroboration(ref.authors, book.authors) === 'match' && titleSimilarity(ref.title, book.title) >= TITLE_MODERATE) {
        matched = book;
        similarity = titleSimilarity(ref.title, book.title);
        isWebSource = true;
      }
    } catch (err) { noteFailure(err); }
  }
  // A reference that names its arXiv ID identifies the preprint as
  // authoritatively as a DOI identifies a published work — and preprints are
  // exactly what the Crossref-first cascade cannot see (arXiv registers with
  // DataCite), so without this step they fuzzy-match the nearest-titled
  // unrelated record instead.
  if (!matched && ref.raw) {
    const arxivId = extractArxivId(ref.raw);
    if (arxivId) {
      try {
        const work = await lookupArxivId(arxivId);
        if (work) {
          const sim = titleSimilarity(ref.title, work.title);
          if (sim >= TITLE_FLOOR) {
            considerResults([work]);
          }
        }
      } catch (err) {
        noteFailure(err);
      }
    }
  }

  // Continue past partial or ambiguous candidates. Stop only at a strong title
  // with corroborating authors and no known metadata conflicts.
  if (!doiResolved && !isWebSource && !strongMatch() && searchQuery.length > 3) {
    for (const search of [
      () => searchCrossref(searchQuery, options.mailto),
      () => searchOpenAlex(searchQuery, options.mailto, options.openAlexApiKey),
      () => searchSemanticScholar(searchQuery, options.semanticScholarApiKey),
      // Last resort: preprint-only works (ICLR/NeurIPS papers cited by venue,
      // arXiv-only reports) reach here when the big indexes offered nothing
      // corroborated; a title search on arXiv is what finally finds them.
      () => searchArxiv(ref.title),
      () => searchDataCite(ref.title, options.mailto),
      () => searchEuropePmc(ref.title),
    ]) {
      if (strongMatch()) break;
      try {
        considerResults(await search());
      } catch (err) {
        noteFailure(err);
      }
    }
    // A parsing error in the author block must not make the title undiscoverable.
    if (!strongMatch() && ref.title && searchQuery !== ref.title) {
      try { considerResults(await searchCrossref(ref.title, options.mailto)); }
      catch (err) { noteFailure(err); }
    }
    // A typo in a distinctive word can zero out a full-title search. Retry the
    // two most reliable fuzzy providers with a stripped query (longest words
    // only) and let their relevance ranking do the rest.
    if (!strongMatch() && ref.title) {
      const repaired = repairedTitleQuery(ref.title);
      if (repaired && repaired !== normalizeTitle(ref.title)) {
        for (const search of [
          () => searchCrossref(repaired, options.mailto),
          () => searchOpenAlex(repaired, options.mailto, options.openAlexApiKey),
        ]) {
          if (strongMatch()) break;
          try { considerResults(await search()); }
          catch (err) { noteFailure(err); }
        }
      }
    }
  }

  // --- Step 6: Web source verification (non-academic fallback) ---
  if (!doiResolved && !strongMatch() && (ref.url || ref.raw)) {
    try {
      const webResult = await verifyWebSource(ref);
      if (webResult) {
        const sim = ref.title ? titleSimilarity(ref.title, webResult.title) : 0;
        // Word-overlap alone misses the common book case: a library stores only
        // the *main* title ("Hooked") while the citation carries title+subtitle
        // ("Hooked: How to build habit-forming products"), so Jaccard is low
        // even though one title is wholly contained in the other. Accept such a
        // containment match only when the author also corroborates — that pair
        // is decisive where a bare 1–2 word containment would not be.
        const { containment, smallerSize } = titleContainment(ref.title, webResult.title);
        const authorOk = authorCorroboration(ref.authors, webResult.authors) === 'match';
        const containmentMatch = authorOk && smallerSize >= 1 && containment >= 0.8;
        if ((sim >= TITLE_FLOOR || containmentMatch || !ref.title) &&
            (!matched || (authorOk && Math.max(sim, containmentMatch ? 0.6 : 0) > similarity))) {
          matched = webResult;
          // A containment+author match is as trustworthy as a moderate word
          // overlap for a structured source; floor the similarity so the verdict
          // below treats it as a solid (not borderline) match.
          similarity = containmentMatch ? Math.max(sim, 0.6) : sim;
          isWebSource = true;
        }
      }
    } catch (err) {
      noteFailure(err);
    }
  }

  // --- Step 7: URL check ---
  let urlCheck = undefined;
  if (ref.url && options.checkUrls !== false) {
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
    const author = authorCorroboration(ref.authors, matched.authors);
    if (author === 'mismatch') flags.push('author_mismatch');
    if (titleTokenConflict(ref.title, matched.title)) flags.push('title_token_mismatch');
    if (author === 'mismatch' || flags.includes('title_token_mismatch') || similarity < TITLE_MODERATE) {
      status = 'suspicious';
      confidenceScore = 0.35;
    }
  } else if (matched) {
    const assessment = assessAcademicMatch(ref, matched, similarity, doiResolved, doiHadMetadata);
    status = assessment.status;
    confidenceScore = assessment.confidence;
    flags.push(...assessment.flags);
    // Degraded evidence: if part of the cascade FAILED (rate-limit/timeout)
    // and the surviving candidate is uncorroborated, the "suspicious" verdict
    // may be an artefact of the good source being down — the right record was
    // never seen. An accusation must not rest on a partial lookup; report it
    // as unverified (retry) instead. A corroborated match, or one reached via
    // DOI, stands on its own regardless of other sources failing.
    if (
      status === 'suspicious' &&
      apiErrored &&
      !doiResolved &&
      !matchedCorroborated
    ) {
      status = 'unverified';
      confidenceScore = 0;
      flags.push('verification_unavailable', 'degraded_lookup');
      if (failure) flags.push(`${failure.reason}:${failure.service}`);
    }
  } else if (apiErrored) {
    // Nothing matched, but a lookup failed (rate-limit / timeout / network).
    // This is NOT a confident "not found" — the reference may well exist; we
    // simply could not check. Report it as its own verdict so a transient
    // outage is never mistaken for a missing or fabricated reference.
    status = 'unverified';
    confidenceScore = 0;
    flags.push('verification_unavailable');
    if (failure) {
      // Compact token carries the reason into raw flag lists (e.g. CSV export);
      // the structured field below drives the friendly "rate-limited on …" text.
      flags.push(`${failure.reason}:${failure.service}`);
    }
  } else if (looksGreyLiterature(ref)) {
    // Index coverage is incomplete for grey literature. URL liveness alone
    // cannot establish that a page contains the cited document.
    flags.push('grey_literature');
    status = 'not_found';
    confidenceScore = 0;
    if (urlCheck && (urlCheck.status === 'live' || urlCheck.status === 'redirect')) flags.push('url_only');
  } else {
    // Nothing matched and every lookup answered cleanly — a genuine miss.
    status = 'not_found';
    confidenceScore = 0;
  }

  if (urlCheck?.status === 'dead') {
    flags = [...flags, 'broken_url'];
  }

  if (!doiResolved && !isWebSource && ambiguous()) {
    flags.push('ambiguous_match');
    if (status === 'verified') status = 'likely_valid';
    confidenceScore = Math.min(confidenceScore, 0.65);
  }

  const publicationCheck = matched && !isWebSource ? await checkPublicationUpdates(matched, options.mailto, options.checkDoi !== false) : undefined;
  if (publicationCheck?.status === 'unavailable') flags.push('publication_check_unavailable');
  for (const update of publicationCheck?.updates ?? []) {
    if (update.type === 'retraction') flags.push('retraction_notice');
    else if (update.type === 'correction' || update.type === 'erratum') flags.push('correction_notice');
    else if (update.type === 'expression-of-concern') flags.push('expression_of_concern');
    else flags.push('publication_update');
  }

  return {
    reference: ref,
    status,
    matchCategory: categorize(status, flags, matched),
    formatIssues,
    matchedWork: matched,
    urlCheck,
    confidenceScore,
    flags: [...new Set(flags)],
    publicationCheck,
    evidence: {
      existence: matched ? 'found' : apiErrored ? 'unknown' : 'not_found',
      metadata: !matched || !matched.title ? 'unknown' : flags.some((f) => f.endsWith('_mismatch')) ? 'conflict' : status === 'verified' ? 'match' : 'partial',
    },
    // Only report a lookup failure when it actually decided the verdict. If an
    // earlier service was rate-limited but a later one still matched the work,
    // the reference is verified — the failure is irrelevant and must not leak.
    unavailable: status === 'unverified' ? failure : undefined,
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
 *  2. DOI / ISBN / arXiv identifier resolution
 *  3. Crossref, OpenAlex, Semantic Scholar, arXiv, DataCite, Europe PMC search
 *  4. Web and book metadata fallback
 *  5. URL liveness and publication notices
 *
 * Lookups are processed one reference at a time, and every external request is
 * paced by the shared rate limiter, so the request rate stays polite even
 * across a whole folder of documents. Results are cached per run, so a work
 * cited in many papers is looked up only once.
 */
export async function verifyReferences(
  refs: ParsedReference[],
  options: VerifyOptions,
  onVerified?: (verification: ReferenceVerification, index: number, total: number) => void,
): Promise<ReferenceVerification[]> {
  const results: ReferenceVerification[] = [];

  for (let i = 0; i < refs.length; i++) {
    const verification = await verifySingleReference(refs[i], options);
    results.push(verification);
    // Stream each verdict as it lands so callers (web SSE, desktop UI) can
    // render references incrementally instead of waiting for the whole batch.
    onVerified?.(verification, i, refs.length);
  }

  return results;
}
