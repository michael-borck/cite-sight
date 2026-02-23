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
  contactEmail?: string; // for Crossref polite pool
}

// --- File Extraction ---

export interface ExtractedDocument {
  text: string;
  fileName: string;
  fileType: string;
  pageCount?: number;
}

// --- Readability & Document Analysis ---

export interface ReadabilityResult {
  wordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  syllableCount: number;
  avgWordsPerSentence: number;
  avgSyllablesPerWord: number;
  fleschReadingEase: number;
  fleschKincaidGrade: number;
  colemanLiauIndex: number;
  automatedReadabilityIndex: number;
}

// --- Writing Quality ---

export interface WritingQualityResult {
  passiveVoicePercentage: number;
  passiveVoiceSentences: string[];
  hedgingPhraseCount: number;
  hedgingPhrases: Array<{ phrase: string; count: number }>;
  transitionWordCount: number;
  academicToneScore: number;
  sentenceVarietyScore: number;
  avgSentenceLength: number;
  complexSentenceRatio: number;
}

// --- Word Analysis ---

export interface WordFrequency {
  word: string;
  count: number;
}

export interface PhraseFrequency {
  phrase: string;
  count: number;
}

export interface WordAnalysisResult {
  uniqueWords: number;
  totalWords: number;
  vocabularyRichness: number; // type-token ratio
  topWords: WordFrequency[];
  bigrams: PhraseFrequency[];
  trigrams: PhraseFrequency[];
}

// --- Integrity ---

export interface IntegrityPattern {
  type: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  evidence?: string;
}

export interface IntegrityResult {
  patterns: IntegrityPattern[];
  riskScore: number; // 0-100
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

export type UrlStatus = 'live' | 'dead' | 'redirect' | 'timeout' | 'error' | 'no_url';

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
  | 'not_found'       // Could not find in any database
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
  brokenUrlCount: number;
}

// --- Full Pipeline Result ---

export interface AnalysisResult {
  fileName: string;
  extractedText: string;
  readability: ReadabilityResult;
  writingQuality: WritingQualityResult;
  wordAnalysis: WordAnalysisResult;
  integrity: IntegrityResult;
  references: ReferenceAnalysisResult;
  processingTime: number;
}

// --- Progress Reporting ---

export type AnalysisStage =
  | 'extracting'
  | 'analyzing_readability'
  | 'analyzing_writing'
  | 'analyzing_words'
  | 'analyzing_integrity'
  | 'extracting_references'
  | 'verifying_references'
  | 'checking_urls'
  | 'complete';

export interface ProgressUpdate {
  stage: AnalysisStage;
  progress: number; // 0-100
  message: string;
}

export type ProgressCallback = (update: ProgressUpdate) => void;
