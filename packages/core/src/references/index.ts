// ============================================================
// References module — barrel export
// ============================================================

export { extractReferences } from './extractor.js';
export { validateFormat } from './formatValidator.js';
export { searchCrossref, lookupDoi } from './crossref.js';
export { searchSemanticScholar } from './semanticScholar.js';
export { searchOpenAlex } from './openAlex.js';
export { resolveDoi } from './doiResolver.js';
export { checkUrl } from './urlChecker.js';
export { verifyReferences, titleSimilarity } from './verifier.js';
export { verifyWebSource } from './webSourceVerifier.js';
