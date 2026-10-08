// ============================================================
// References module — barrel export
// ============================================================

export { extractReferences } from './extractor.js';
export { validateFormat } from './formatValidator.js';
export { searchCrossref, lookupDoi } from './crossref.js';
export { searchSemanticScholar } from './semanticScholar.js';
export { searchOpenAlex } from './openAlex.js';
export { resolveDoi } from './doiResolver.js';
export { lookupDoiDataCite } from './datacite.js';
export { checkUrl } from './urlChecker.js';
export { verifyReferences, titleSimilarity } from './verifier.js';
export { explainVerification, STATUS_LABELS, STATUS_HINTS } from './explain.js';
export type { FlagExplanation } from './explain.js';
export { verifyWebSource } from './webSourceVerifier.js';
export { isPrivateUrl } from './ssrf.js';
