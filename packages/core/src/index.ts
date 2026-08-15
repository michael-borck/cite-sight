// Core library entry point (Node).
//
// This barrel reaches node:fs — via `extract` and `analyzePipeline`, both of
// which take paths. Bundled hosts (browser, webview) must import
// '@michaelborck/cite-sight-core/browser' instead; see ./browser.ts.
export { analyzePipeline } from './pipelineFromFile.js';
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
export { setFetch, httpFetch } from './httpClient.js';
export type { FetchLike } from './httpClient.js';
export { extractReferences } from './references/extractor.js';
export { validateFormat } from './references/formatValidator.js';
export { searchCrossref, lookupDoi } from './references/crossref.js';
export { searchSemanticScholar } from './references/semanticScholar.js';
export { searchOpenAlex } from './references/openAlex.js';
export { resolveDoi } from './references/doiResolver.js';
export { checkUrl } from './references/urlChecker.js';
export { verifyReferences } from './references/verifier.js';
export { exportLookupCache, hydrateLookupCache } from './references/lookupCache.js';
export { exportBibtex } from './references/bibtexExport.js';
export type { PersistedLookupCache } from './references/lookupCache.js';
export { explainVerification } from './references/explain.js';
export type { FlagExplanation } from './references/explain.js';
export { clearLookupCache } from './references/lookupCache.js';
export { setMinRequestInterval } from './references/rateLimiter.js';
export { isPrivateUrl } from './references/ssrf.js';

// Re-export all types
export type * from './types.js';

// Dashboard module — pure functions + types for the new Overview UI
export * from './dashboard/index.js';
