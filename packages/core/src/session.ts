import type { AnalysisResult, ClaimSourceBinding, ProcessingOptions } from './types.js';
import { REVIEW_LABELS } from './review.js';
import { isClaimAnalysis } from './claims/validation.js';

export interface SessionFile {
  claimLimit?: number;
  phase?: 'references' | 'claims';
  claimSources?: ClaimSourceBinding[];
  path: string;
  status: 'waiting' | 'processing' | 'complete' | 'failed';
  result?: AnalysisResult;
  error?: string;
  options?: ProcessingOptions;
}
export interface ReviewSession {
  format: 'cite-sight-session';
  version: 1;
  savedAt: string;
  options: ProcessingOptions;
  files: SessionFile[];
  selectedPath?: string;
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === 'string'); }
function publicationUpdates(value: unknown): boolean {
  return Array.isArray(value) && value.every((update) => record(update) && typeof update.type === 'string' && typeof update.source === 'string' &&
    ['doi', 'date'].every((key) => update[key] === undefined || typeof update[key] === 'string'));
}
function validBindings(value: unknown): value is ClaimSourceBinding[] {
  return Array.isArray(value) && value.length <= 100 && value.every((source) => record(source) && Number.isInteger(source.reference) && Number(source.reference) > 0 &&
    typeof source.path === 'string' && source.path.length <= 4096 && (source.referenceText === undefined || typeof source.referenceText === 'string'));
}
function reference(value: unknown): boolean {
  if (!record(value) || typeof value.raw !== 'string' || typeof value.title !== 'string' || !strings(value.authors) ||
      !(value.year === null || Number.isInteger(value.year)) || !['apa', 'mla', 'chicago', 'unknown'].includes(String(value.detectedStyle))) return false;
  return ['doi', 'url', 'journal', 'volume', 'issue', 'pages', 'yearSuffix'].every((key) => value[key] === undefined || typeof value[key] === 'string');
}
function citation(value: unknown): boolean {
  return record(value) && typeof value.raw === 'string' && strings(value.authors) &&
    (value.year === null || Number.isInteger(value.year)) && typeof value.position === 'number' && Number.isFinite(value.position);
}

/** Validate imported reports before they enter a renderer or a retry pipeline. */
export function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!record(value) || typeof value.fileName !== 'string' || typeof value.extractedText !== 'string' || !Number.isFinite(value.processingTime)) return false;
  if (value.offline !== undefined && typeof value.offline !== 'boolean') return false;
  if (value.inputSha256 !== undefined && (typeof value.inputSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.inputSha256))) return false;
  if (value.claims !== undefined && (!isClaimAnalysis(value.claims) || value.offline !== true)) return false;
  const refs = value.references;
  if (!record(refs) || !Array.isArray(refs.references) || !refs.references.every(reference) || !Array.isArray(refs.inTextCitations) || !refs.inTextCitations.every(citation) ||
      !Array.isArray(refs.verifications) || !record(refs.crossReference) ||
      !Array.isArray(refs.crossReference.unmatchedBibliography) || !refs.crossReference.unmatchedBibliography.every(reference) ||
      !Array.isArray(refs.crossReference.unmatchedInText) || !refs.crossReference.unmatchedInText.every(citation)) return false;
  if (!['apa', 'mla', 'chicago', 'unknown'].includes(String(refs.detectedStyle))) return false;
  if (!['totalReferences', 'verifiedCount', 'suspiciousCount', 'notFoundCount', 'unverifiedCount', 'brokenUrlCount'].every((key) => typeof refs[key] === 'number' && Number.isFinite(refs[key]) && Number(refs[key]) >= 0)) return false;
  if (!refs.verifications.every((item) => {
    if (!record(item) || !reference(item.reference) || !['verified', 'likely_valid', 'suspicious', 'not_found', 'unverified', 'format_only'].includes(String(item.status)) ||
        !strings(item.flags) || !Number.isFinite(item.confidenceScore) || !Array.isArray(item.formatIssues)) return false;
    if (!item.formatIssues.every((issue) => record(issue) && typeof issue.field === 'string' && typeof issue.message === 'string' && ['expected', 'actual'].every((key) => issue[key] === undefined || typeof issue[key] === 'string'))) return false;
    if (item.evidence !== undefined && (!record(item.evidence) || !['found', 'not_found', 'unknown'].includes(String(item.evidence.existence)) || !['match', 'partial', 'conflict', 'unknown'].includes(String(item.evidence.metadata)))) return false;
    if (item.publicationCheck !== undefined && (!record(item.publicationCheck) || !['checked', 'unavailable', 'not_available'].includes(String(item.publicationCheck.status)) ||
      !publicationUpdates(item.publicationCheck.updates) || item.publicationCheck.checkedAt !== undefined && typeof item.publicationCheck.checkedAt !== 'string')) return false;
    if (item.matchedWork) {
      if (!record(item.matchedWork) || typeof item.matchedWork.title !== 'string' || !strings(item.matchedWork.authors) ||
          !(item.matchedWork.year === null || Number.isInteger(item.matchedWork.year))) return false;
      if (!['doi', 'url', 'journal', 'volume', 'issue', 'pages', 'source'].every((key) => item.matchedWork && record(item.matchedWork) && (item.matchedWork[key] === undefined || typeof item.matchedWork[key] === 'string'))) return false;
      if (item.matchedWork.publicationUpdates !== undefined && !publicationUpdates(item.matchedWork.publicationUpdates)) return false;
    }
    if (item.urlCheck && (!record(item.urlCheck) || typeof item.urlCheck.url !== 'string' || typeof item.urlCheck.status !== 'string')) return false;
    return true;
  })) return false;
  if (value.reviews !== undefined && (!record(value.reviews) || !Object.values(value.reviews).every((review) => record(review) && typeof review.decision === 'string' && Object.hasOwn(REVIEW_LABELS, review.decision) && typeof review.reviewedAt === 'string'))) return false;
  return true;
}

/** Connection credentials belong to this device, not an exported session. */
export function portableOptions(value: Partial<ProcessingOptions>): ProcessingOptions {
  return {
    offline: value.offline === true,
    documentType: value.documentType === 'reference-list' ? 'reference-list' : 'assignment',
    citationStyle: ['auto', 'apa', 'mla', 'chicago'].includes(value.citationStyle ?? '') ? value.citationStyle! : 'auto',
    checkUrls: value.checkUrls !== false, checkDoi: value.checkDoi !== false,
    checkInText: value.checkInText !== false, screenshotUrls: value.screenshotUrls === true,
  };
}

export function compactResult(result: AnalysisResult): AnalysisResult {
  return { ...result, extractedText: '', references: { ...result.references,
    verifications: result.references.verifications.map((verification) => {
      if (!verification.urlCheck) return verification;
      const { screenshotPath: _path, ...urlCheck } = verification.urlCheck;
      return { ...verification, urlCheck };
    }),
  } };
}

export function makeReviewSession(files: SessionFile[], options: ProcessingOptions, selectedPath?: string): ReviewSession {
  return { format: 'cite-sight-session', version: 1, savedAt: new Date().toISOString(), options: portableOptions(options), selectedPath,
    files: files.map((file) => ({ path: file.path, status: file.status === 'processing' ? 'waiting' : file.status,
      phase: file.phase, claimLimit: file.claimLimit, claimSources: file.claimSources?.map(({ reference, path, referenceText }) => ({ reference, path, referenceText })),
      error: file.error, result: file.result ? compactResult(file.result) : undefined,
      options: file.options ? portableOptions(file.options) : undefined,
    })),
  };
}

export function parseReviewSession(value: unknown): ReviewSession {
  if (!record(value) || value.format !== 'cite-sight-session' || value.version !== 1 || !record(value.options) || !Array.isArray(value.files) || !value.files.length || value.files.length > 10_000) {
    throw new Error('This is not a supported CiteSight review session.');
  }
  const seen = new Set<string>();
  const files: SessionFile[] = value.files.map((file, index) => {
    if (!record(file) || typeof file.path !== 'string' || !file.path || file.path.length > 4096 || seen.has(file.path) ||
        file.claimLimit !== undefined && (!Number.isInteger(file.claimLimit) || Number(file.claimLimit) < 1 || Number(file.claimLimit) > 200) ||
        file.phase !== undefined && !['references', 'claims'].includes(String(file.phase)) || file.claimSources !== undefined && !validBindings(file.claimSources) ||
        !['waiting', 'processing', 'complete', 'failed'].includes(String(file.status)) ||
        file.error !== undefined && typeof file.error !== 'string' ||
        file.result !== undefined && !isAnalysisResult(file.result) || file.status === 'complete' && !file.result) {
      throw new Error(`Document ${index + 1} in this session is invalid.`);
    }
    seen.add(file.path);
    return { path: file.path, status: file.status === 'processing' ? 'waiting' : file.status as SessionFile['status'],
      phase: file.phase as SessionFile['phase'], claimLimit: file.claimLimit as number | undefined, claimSources: file.claimSources as SessionFile['claimSources'],
      result: file.result as AnalysisResult | undefined, error: file.error as string | undefined,
      options: record(file.options) ? portableOptions(file.options) : undefined,
    };
  });
  const session = makeReviewSession(files, portableOptions(value.options), typeof value.selectedPath === 'string' ? value.selectedPath : files[0].path);
  if (typeof value.savedAt === 'string' && Number.isFinite(Date.parse(value.savedAt))) session.savedAt = value.savedAt;
  return session;
}
