// Core library entry point
export { analyzePipeline } from './pipeline.js';
export { extract, extractPdf, extractDocx } from './extractors/index.js';
export { analyzeReadability } from './analyzers/readability.js';
export { analyzeWritingQuality } from './analyzers/writingQuality.js';
export { analyzeWords } from './analyzers/wordAnalysis.js';
export { analyzeWritingPatterns } from './analyzers/writingPatterns.js';
export { extractReferences } from './references/extractor.js';
export { validateFormat } from './references/formatValidator.js';
export { searchCrossref, lookupDoi } from './references/crossref.js';
export { searchSemanticScholar } from './references/semanticScholar.js';
export { searchOpenAlex } from './references/openAlex.js';
export { resolveDoi } from './references/doiResolver.js';
export { checkUrl } from './references/urlChecker.js';
export { verifyReferences } from './references/verifier.js';

// Re-export all types
export type * from './types.js';
