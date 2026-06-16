// Core library entry point
export { analyzePipeline } from './pipeline.js';
export { MANIFEST } from './manifest.js';
export { DISCLAIMER, DISCLAIMER_SHORT } from './disclaimer.js';
export { extract, extractPdf, extractDocx } from './extractors/index.js';
export { extractReferences } from './references/extractor.js';
export { validateFormat } from './references/formatValidator.js';
export { searchCrossref, lookupDoi } from './references/crossref.js';
export { searchSemanticScholar } from './references/semanticScholar.js';
export { searchOpenAlex } from './references/openAlex.js';
export { resolveDoi } from './references/doiResolver.js';
export { checkUrl } from './references/urlChecker.js';
export { verifyReferences } from './references/verifier.js';
export { explainVerification } from './references/explain.js';
export type { FlagExplanation } from './references/explain.js';
export { clearLookupCache } from './references/lookupCache.js';
export { setMinRequestInterval } from './references/rateLimiter.js';
export { isPrivateUrl } from './references/ssrf.js';

// Re-export all types
export type * from './types.js';

// Dashboard module — pure functions + types for the new Overview UI
export * from './dashboard/index.js';
