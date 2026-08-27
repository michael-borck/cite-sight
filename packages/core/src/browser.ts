// Browser / webview entry point — `@michaelborck/cite-sight-core/browser`.
//
// Everything the main entry point offers EXCEPT the two filesystem-bound
// helpers (`extract` and `analyzePipeline`, which take paths). Import this from
// a bundled host and nothing will drag node:* into the bundle.
//
// Hosts using this must supply the pdfjs worker URL their bundler emitted:
//
//   import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
//   setPdfWorkerSrc(workerUrl);
//
// A webview host that routes HTTP through a native layer installs it with
// setFetch() rather than overwriting globalThis.fetch — see ./httpClient.ts for
// why that distinction matters.
export { analyzeDocument } from './pipeline.js';
export { MANIFEST } from './manifest.js';
export {
  DISCLAIMER,
  DISCLAIMER_SHORT,
  STANDALONE_LIMITS_NOTICE,
  STANDALONE_LIMITS_SHORT,
} from './disclaimer.js';
export {
  extractFromBytes,
  extractPdf,
  extractDocx,
  extractText,
  TEXT_EXTENSIONS,
  setPdfWorkerSrc,
} from './extractors/index.js';
export { extractReferences } from './references/extractor.js';
export { exportBibtex } from './references/bibtexExport.js';
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
export { setFetch, httpFetch } from './httpClient.js';
export type { FetchLike } from './httpClient.js';

// Re-export all types
export type * from './types.js';

// Dashboard module — pure functions + types for the new Overview UI
export * from './dashboard/index.js';
