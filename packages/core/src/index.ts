// Core library entry point (Node).
//
// This barrel reaches node:fs — via `extract` and `analyzePipeline`, both of
// which take paths. Bundled hosts (browser, webview) must import
// '@michaelborck/cite-sight-core/browser' instead; see ./browser.ts.
import { setDefaultFetch } from './httpClient.js';
import { nodeFetch } from './nodeHttp.js';

setDefaultFetch(nodeFetch);

export { analyzePipeline } from './pipelineFromFile.js';
export { analyzeClaimsFile, readClaimSources } from './claims/checkClaims.js';
export { readClaimCheckpoint } from './claims/checkpoint.js';
export { planFiles } from './claims/planning.js';
export { findDuplicateReferences } from './references/duplicates.js';
export { unitSourceList, claimOverlap, claimOverlapFromResults, type UnitSourceEntry, type ClaimOverlapPair } from './claims/unitSources.js';
export { buildLibraryIndex, matchLibraryEntry, scoreLibraryFile, type LibraryEntry } from './claims/library.js';
export { unitEstimate, remainingEstimate, durationRange } from './claims/timing.js';
export { claimReportLines, claimCsv, claimSuggestionLabel } from './claims/report.js';
export { CLAIM_MODELS, CLAIM_RUNTIME_VERSION, CLAIM_PROMPT_VERSION } from './claims/modelCatalog.js';
export { hashFile, downloadArtifact } from './claims/artifacts.js';
export { probeRuntimeVersion } from './claims/localRunner.js';
export { benchmarkClaims } from './claims/benchmark.js';
export { analyzeDocument } from './pipeline.js';
export { MANIFEST } from './manifest.js';
export { DISCLAIMER, ATTRIBUTION, PACING_NOTE, DISCLAIMER_SHORT, HOSTED_LIMITS_NOTICE, HOSTED_LIMITS_SHORT } from './disclaimer.js';
export { extract } from './extractors/fromFile.js';
export {
  extractFromBytes,
  extractPdf,
  extractDocx,
  extractText,
  TEXT_EXTENSIONS,
  setPdfWorkerSrc,
} from './extractors/index.js';
export { setFetch, httpFetch, withoutExternalRequests } from './httpClient.js';
export type { FetchLike } from './httpClient.js';
export { extractReferences } from './references/extractor.js';
export { validateFormat } from './references/formatValidator.js';
export { searchCrossref, lookupDoi } from './references/crossref.js';
export { searchSemanticScholar } from './references/semanticScholar.js';
export { searchOpenAlex } from './references/openAlex.js';
export { searchDataCite, lookupDoiDataCite } from './references/datacite.js';
export { searchEuropePmc } from './references/europePmc.js';
export { resolveDoi } from './references/doiResolver.js';
export { checkUrl } from './references/urlChecker.js';
export { verifyReferences } from './references/verifier.js';
export { exportLookupCache, hydrateLookupCache } from './references/lookupCache.js';
export { exportBibtex } from './references/bibtexExport.js';
export type { PersistedLookupCache } from './references/lookupCache.js';
export { explainVerification, hasReviewFlags } from './references/explain.js';
export type { FlagExplanation } from './references/explain.js';
export { clearLookupCache } from './references/lookupCache.js';
export { setMinRequestInterval } from './references/rateLimiter.js';
export { isPrivateUrl } from './references/ssrf.js';

// Re-export all types
export type * from './types.js';
export type { ReviewSession, SessionFile } from './session.js';
export { REVIEW_LABELS, withVerifications, reviewKey, reviewCount, isReviewed } from './review.js';

// Dashboard module — pure functions + types for the new Overview UI
export * from './dashboard/index.js';
