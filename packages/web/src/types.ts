// ============================================================
// CiteSight Web Types
// Copied from @michaelborck/cite-sight-core for browser use
// (Node.js package cannot be imported in the browser)
// ============================================================

// --- Processing Options (web version — no screenshotUrls) ---

export interface ProcessingOptions {
  citationStyle: 'auto' | 'apa' | 'mla' | 'chicago';
  checkUrls: boolean;
  checkDoi: boolean;
  checkInText: boolean;
  contactEmail?: string; // for Crossref polite pool
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
  source: 'crossref' | 'semantic_scholar' | 'openalex';
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

export interface ReferenceVerification {
  reference: ParsedReference;
  status: VerificationStatus;
  formatIssues: FormatIssue[];
  matchedWork?: AcademicWork;
  urlCheck?: UrlCheckResult;
  confidenceScore: number; // 0-1
  flags: string[];
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
