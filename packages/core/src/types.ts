// ============================================================
// CiteSight Core Types
// ============================================================

// --- Processing Options ---

export interface ProcessingOptions {
  offline?: boolean; // Skip all external reference services, including metadata fallbacks.
  documentType?: 'assignment' | 'reference-list';
  citationStyle: 'auto' | 'apa' | 'mla' | 'chicago';
  checkUrls: boolean;
  checkDoi: boolean;
  checkInText: boolean;
  screenshotUrls: boolean;
  contactEmail?: string; // for Crossref / OpenAlex polite pool
  semanticScholarApiKey?: string; // lifts keyless rate-limiting on Semantic Scholar
  openAlexApiKey?: string;
}

// --- File Extraction ---

export interface ExtractedDocument {
  text: string;
  fileName: string;
  fileType: string;
  pageCount?: number;
  pages?: { page: number; text: string }[];
}

// --- References ---

export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'unknown';

export interface ParsedReference {
  raw: string;
  authors: string[];
  title: string;
  year: number | null;
  yearSuffix?: string;
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
  yearSuffix?: string;
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
  volume?: string;
  issue?: string;
  pages?: string;
  source: 'crossref' | 'datacite' | 'semantic_scholar' | 'openalex' | 'europe_pmc' | 'arxiv' | 'youtube' | 'vimeo' | 'open_library' | 'web_metadata';
  url?: string;
  citationCount?: number;
  workType?: string;
  publicationUpdates?: PublicationUpdate[];
  publicationStatusCheckedAt?: string;
}

export interface PublicationUpdate {
  type: string;
  doi?: string;
  source: string;
  date?: string;
}

export interface PublicationCheck {
  status: 'checked' | 'unavailable' | 'not_available';
  updates: PublicationUpdate[];
  checkedAt?: string;
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
  confidenceScore: number; // Heuristic match strength, 0-1; not a probability.
  evidence?: {
    existence: 'found' | 'not_found' | 'unknown';
    metadata: 'match' | 'partial' | 'conflict' | 'unknown';
  };
  flags: string[];
  publicationCheck?: PublicationCheck;
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
  inTextCheckSkipped?: boolean;
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
  offline?: boolean;
  inputSha256?: string;
  claims?: ClaimAnalysis;
  fileName: string;
  extractedText: string;
  references: ReferenceAnalysisResult;
  processingTime: number;
  reviews?: Record<string, { decision: ReviewDecision; reviewedAt: string }>;
}

export type ReviewDecision = 'reviewed' | 'citation_error' | 'acceptable_variation' | 'unresolved' | 'suspected_fabrication' | 'claim_supported' | 'claim_not_supported';

// --- Progress Reporting ---

export type AnalysisStage =
  | 'checking_claims'
  | 'extracting'
  | 'extracting_references'
  | 'verifying_references'
  | 'cross_referencing'
  | 'complete';

export interface ProgressUpdate {
  restored?: number;
  completed?: number;
  total?: number;
  eta?: RuntimeEstimate;
  stage: AnalysisStage;
  progress: number; // 0-100
  message: string;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

export type ClaimStatus = 'supported' | 'partially_supported' | 'contradicted' | 'insufficient_evidence' | 'unavailable';

export interface ClaimEvidence {
  quote: string;
  passageId: string;
  page?: number; // Physical PDF page, one-based; not the printed page label.
  start: number; // Offsets in the extracted page, or document text for non-PDFs.
  end: number;
}

export interface ClaimFinding {
  id: string;
  claim: string;
  position: number;
  citation: string;
  referenceIndex?: number;
  status: ClaimStatus;
  reason: string;
  evidence: ClaimEvidence[];
  source?: { fileName: string; sha256: string };
}

export interface ClaimAnalysis {
  progress?: { state: 'partial' | 'complete'; completed: number; total: number; reused: number };
  timing?: { inferenceMs: number; inferenceCount: number };
  provenance?: ClaimProvenance;
  version: 1;
  mode: 'local-only';
  model: string;
  checkedAt: string;
  findings: ClaimFinding[];
  warnings: string[];
  omittedCount: number;
}

export interface RuntimeEstimate { minMs: number; maxMs: number; basis: 'planning' | 'observed' }
export interface BatchPlan {
  offline: boolean;
  mode: 'references' | 'claims';
  files: { path: string; references: number; claims: number; error?: string }[];
  references: number;
  uniqueReferences: number;
  claims: number;
  scanMs: number;
  estimate: RuntimeEstimate;
}

export interface ClaimProvenance {
  runtimeVersion: string;
  runtimeSha256: string;
  modelSha256: string;
  modelId?: string;
  modelRevision?: string;
  platform: string;
  arch: string;
  promptVersion: string;
  parameters: { temperature: number; seed: number; contextSize: number; maxTokens: number; device: string; reasoning?: 'auto' | 'off' | 'on'; chatTemplate?: 'model-default' | 'chatml' };
}

export interface ClaimSourceBinding {
  reference: number; // One-based bibliography row shown in the UI/CLI.
  path: string;
  referenceText?: string; // Reject a stale mapping if the parsed reference changed.
}

export interface LocalClaimOptions {
  reasoning?: 'off' | 'on';
  chatTemplate?: 'chatml';
  runnerPath: string;
  modelPath: string;
  sources: ClaimSourceBinding[];
  expectedDocumentHash?: string;
  maxClaims?: number;
  timeoutMs?: number;
}
