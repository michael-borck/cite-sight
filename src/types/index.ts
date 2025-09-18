// Core TypeScript interfaces for CiteSight application

export interface ProcessingOptions {
  citationStyle: 'auto' | 'apa' | 'mla' | 'chicago';
  checkUrls: boolean;
  checkDoi: boolean;
  checkWayback: boolean;
  checkPlagiarism: boolean;
  checkInText: boolean;
  processingMode: 'server' | 'local';
}

export interface AnalysisOptions {
  citationStyle: 'auto' | 'apa' | 'mla' | 'chicago';
  checkUrls: boolean;
  checkDoi: boolean;
  checkWayback: boolean;
  checkPlagiarism: boolean;
  checkInText: boolean;
  processingMode: 'server' | 'local';
}

export interface Pattern {
  type: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  location?: string;
}

export interface Issue {
  type: string;
  message: string;
  severity?: 'high' | 'medium' | 'low';
  suggestion?: string;
}

export interface WordFrequency {
  word: string;
  count: number;
  size?: number;
}

export interface PhraseCount {
  phrase: string;
  count: number;
}

export interface DocumentComparison {
  name: string;
  wordCount: number;
  readability: number;
  references: number;
  issues: number;
}

export interface SuspiciousPatterns {
  patterns: Pattern[];
  risk_score: number;
}

export interface ReferenceResults {
  total: number;
  brokenUrls: number;
  unresolvedDois: number;
  missingInText: number;
  orphanedInText: number;
  issues: Issue[];
  // Snake case aliases for backend compatibility
  broken_urls: number;
  unresolved_dois: number;
  missing_in_text: number;
}

export interface DocumentAnalysis {
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  paragraphCount: number;
  fleschScore: number;
  fleschKincaidGrade: number;
  // Snake case aliases for backend compatibility
  word_count: number;
  sentence_count: number;
  avg_words_per_sentence: number;
  paragraph_count: number;
  flesch_score: number;
  flesch_kincaid_grade: number;
}

export interface WritingQuality {
  passive_voice_percentage: number;
  sentence_variety_score: number;
  transition_words: number;
  hedging_phrases: number;
  academic_tone_score: number;
  complex_sentences: number;
}

export interface WordAnalysis {
  unique_words: number;
  vocabulary_richness: number;
  top_words: WordFrequency[];
  bigrams: PhraseCount[];
  trigrams: PhraseCount[];
  uniqueWords?: number;
  vocabularyRichness?: number;
  topWords?: WordFrequency[];
}

export interface AnalysisResults {
  references: ReferenceResults;
  suspiciousPatterns: SuspiciousPatterns;
  documentAnalysis: DocumentAnalysis;
  writingQuality: WritingQuality;
  wordAnalysis: WordAnalysis;
  comparison?: DocumentComparison[];
  processing_time: number;
  file_count: number;
  // Snake case aliases for backend compatibility
  suspicious_patterns: SuspiciousPatterns;
  document_analysis: DocumentAnalysis;
  writing_quality: WritingQuality;
  word_analysis: WordAnalysis;
}

export interface FileUpload {
  file: File;
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
}

export interface ProcessingProgress {
  stage: 'upload' | 'extraction' | 'analysis' | 'verification' | 'complete';
  progress: number;
  message: string;
  currentFile?: string;
}

export interface AppState {
  // File management
  uploadedFiles: FileUpload[];
  
  // Processing state
  isProcessing: boolean;
  processingProgress: ProcessingProgress;
  
  // Analysis options
  analysisOptions: AnalysisOptions;
  
  // Results
  analysisResults: AnalysisResults | null;
  
  // UI state
  activeTab: string;
  errors: string[];
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  status: 'success' | 'error';
  message?: string;
}

export interface AnalysisRequest {
  files: File[];
  options: AnalysisOptions;
}

export interface AnalysisResponse extends AnalysisResults {
  processingTime: number;
  fileCount: number;
}

// Error types
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationError {
  field: string;
  message: string;
}