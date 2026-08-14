// ============================================================
// CiteSight Core Types
// ============================================================

// --- Processing Options ---

export interface ProcessingOptions {
  citationStyle: 'auto' | 'apa' | 'mla' | 'chicago';
  checkUrls: boolean;
  checkDoi: boolean;
  checkInText: boolean;
  screenshotUrls: boolean;
  contactEmail?: string; // for Crossref / OpenAlex polite pool
  semanticScholarApiKey?: string; // lifts keyless rate-limiting on Semantic Scholar
}

// --- File Extraction ---

export interface ExtractedDocument {
  text: string;
  fileName: string;
  fileType: string;
  pageCount?: number;
}

// --- References ---

export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'unknown';

export interface ParsedReference {
  raw: string;
  authors: string[];
  title: string;
  year: number | null;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  detectedStyle: CitationStyle;
}

export interface InTextCitation {
  raw: string;
  authors: string[];
  year: number | null;
  pageNumbers?: string;
  position: number; // character offset in text
}

export interface FormatIssue {
  field: string;
  message: string;
  expected?: string;
  actual?: string;
}

export interface AcademicWork {
  title: string;
  authors: string[];
  year: number | null;
  doi?: string;
  journal?: string;
  source: 'crossref' | 'datacite' | 'semantic_scholar' | 'openalex' | 'arxiv' | 'youtube' | 'vimeo' | 'open_library' | 'web_metadata';
  url?: string;
  citationCount?: number;
}

export type UrlStatus = 'live' | 'dead' | 'blocked' | 'redirect' | 'timeout' | 'error' | 'no_url';

export interface UrlCheckResult {
  url: string;
  status: UrlStatus;
  statusCode?: number;
  finalUrl?: string;
  screenshotPath?: string;
  error?: string;
}

export type VerificationStatus =
  | 'verified'        // Found in academic database, metadata matches
  | 'likely_valid'    // Found but metadata partially matches
  | 'not_found'       // Searched cleanly but found in no database
  | 'unverified'      // Lookup failed (rate-limit/timeout) — existence unchecked
  | 'suspicious'      // Found but metadata doesn't match
  | 'format_only';    // Only format was checked (no API lookup)

/**
 * What KIND of match situation a verification represents — orthogonal to
 * `status` (the severity axis). Status says how worried to be; the category
 * says what actually happened, so presentation can phrase each case
 * accurately instead of collapsing everything into "suspect":
 *  - exact:                the cited record itself was matched
 *  - variant_record:       a different registration of the same work
 *                          (edition/reissue, preprint vs published)
 *  - metadata_drift:       right work, but a cited field disagrees
 *  - match_dubious:        the best candidate is probably a DIFFERENT work
 *                          (no author overlap) — the citation itself is
 *                          unmatched; suspicion attaches to the match
 *  - conflict:             the citation's own identifiers disagree (e.g. its
 *                          DOI resolves to a different-titled work)
 *  - not_indexed_expected: grey literature — absence from scholarly indexes
 *                          is the expected state for this source type
 *  - none:                 no candidate at all
 */
export type MatchCategory =
  | 'exact'
  | 'variant_record'
  | 'metadata_drift'
  | 'match_dubious'
  | 'conflict'
  | 'not_indexed_expected'
  | 'none';

export interface ReferenceVerification {
  reference: ParsedReference;
  status: VerificationStatus;
  matchCategory: MatchCategory;
  formatIssues: FormatIssue[];
  matchedWork?: AcademicWork;
  urlCheck?: UrlCheckResult;
  confidenceScore: number; // 0-1
  flags: string[];
  // Set only when status is 'unverified': which service failed and why, so the
  // report can say "rate-limited on Semantic Scholar" rather than "not found".
  unavailable?: {
    service: string;
    reason: 'rate_limited' | 'timeout' | 'server_error' | 'network' | 'unknown';
  };
}

export interface CrossReferenceResult {
  unmatchedBibliography: ParsedReference[]; // in bibliography but no in-text citation
  unmatchedInText: InTextCitation[];         // in-text but no bibliography entry
}

export interface ReferenceAnalysisResult {
  references: ParsedReference[];
  inTextCitations: InTextCitation[];
  verifications: ReferenceVerification[];
  crossReference: CrossReferenceResult;
  detectedStyle: CitationStyle;
  totalReferences: number;
  verifiedCount: number;
  suspiciousCount: number;
  notFoundCount: number;
  unverifiedCount: number;
  brokenUrlCount: number;
  // True when the document looks like a bare source list / annotated
  // bibliography rather than a manuscript (no reference is cited in the body),
  // so the in-text cross-reference check was suppressed as meaningless.
  sourceListLikely: boolean;
}

// --- Full Pipeline Result ---

export interface AnalysisResult {
  fileName: string;
  extractedText: string;
  references: ReferenceAnalysisResult;
  processingTime: number;
}

// --- Progress Reporting ---

export type AnalysisStage =
  | 'extracting'
  | 'extracting_references'
  | 'verifying_references'
  | 'cross_referencing'
  | 'complete';

export interface ProgressUpdate {
  stage: AnalysisStage;
  progress: number; // 0-100
  message: string;
}

export type ProgressCallback = (update: ProgressUpdate) => void;
