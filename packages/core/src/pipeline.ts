// Platform-neutral: no node:* imports may appear in this module or anything it
// reaches. The Node-only, path-taking wrapper lives in ./pipelineFromFile.js.
import { extractFromBytes } from './extractors/fromBytes.js';
import { extractReferences } from './references/extractor.js';
import { verifyReferences } from './references/verifier.js';
import { crossReferenceCheck } from './references/crossReference.js';
import { findDuplicateReferences } from './references/duplicates.js';
import { withoutExternalRequests } from './httpClient.js';
import type {
  AnalysisResult,
  ProcessingOptions,
  ProgressCallback,
  ReferenceAnalysisResult,
  ReferenceVerification,
  CitationStyle,
  ParsedReference,
} from './types.js';

/**
 * Analyse a document supplied as raw bytes.
 *
 * The platform-neutral entry point: identical behaviour in Node, a browser, and
 * a webview. Everything downstream of extraction is already platform-neutral,
 * so this is the whole of the analysis pipeline minus the disk read.
 *
 * @param bytes    The document's raw bytes.
 * @param fileName File name (not a path) — used for type detection and metadata.
 */
export async function analyzeDocument(
  bytes: Uint8Array,
  fileName: string,
  options: ProcessingOptions,
  onProgress?: ProgressCallback,
  onReference?: (verification: ReferenceVerification, index: number, total: number) => void,
): Promise<AnalysisResult> {
  return options.offline
    ? withoutExternalRequests(() => analyzeDocumentInner(bytes, fileName, options, onProgress, onReference))
    : analyzeDocumentInner(bytes, fileName, options, onProgress, onReference);
}

async function analyzeDocumentInner(
  bytes: Uint8Array, fileName: string, options: ProcessingOptions, onProgress?: ProgressCallback,
  onReference?: (verification: ReferenceVerification, index: number, total: number) => void,
): Promise<AnalysisResult> {
  const startTime = Date.now();

  // Stage 1: Extract text
  onProgress?.({ stage: 'extracting', progress: 5, message: 'Extracting text from document...' });
  const doc = await extractFromBytes(bytes, fileName);

  if (!doc.text.trim()) {
    throw new Error('No text could be extracted from the document.');
  }

  // Stage 6: Extract references
  onProgress?.({ stage: 'extracting_references', progress: 55, message: 'Extracting references...' });
  const { references, inTextCitations } = extractReferences(doc.text);

  // Determine citation style
  const detectedStyle: CitationStyle = options.citationStyle !== 'auto'
    ? options.citationStyle
    : references.length > 0
      ? detectMajorityStyle(references)
      : 'unknown';

  // Stage 7: Verify references via APIs
  onProgress?.({ stage: 'verifying_references', progress: 65, message: `Verifying ${references.length} references...` });
  const verifications = references.length > 0
    ? await verifyReferences(references, {
        offline: options.offline,
        mailto: options.contactEmail,
        citationStyle: detectedStyle,
        semanticScholarApiKey: options.semanticScholarApiKey,
        openAlexApiKey: options.openAlexApiKey,
        checkUrls: options.checkUrls,
        checkDoi: options.checkDoi,
      }, onReference)
    : [];

  // Stage 8: Cross-reference check
  onProgress?.({ stage: 'cross_referencing', progress: 90, message: 'Cross-referencing citations...' });
  let crossReference = options.checkInText && options.documentType !== 'reference-list'
    ? crossReferenceCheck(references, inTextCitations)
    : { unmatchedBibliography: [], unmatchedInText: [] };

  // A source list has no in-text citations. Failed matches alone are not
  // evidence of one: a manuscript may contain only orphaned citations.
  const sourceListLikely =
    options.checkInText &&
    !options.documentType &&
    references.length >= 3 &&
    inTextCitations.length === 0;
  if (sourceListLikely) {
    crossReference = { unmatchedBibliography: [], unmatchedInText: [] };
  }

  // Bibliography duplicates (same author/year/title as an earlier entry) are
  // an editing artefact worth tidying, not a verification verdict.
  for (const index of findDuplicateReferences(references)) {
    verifications[index]?.flags.push('duplicate_reference');
  }

  const referenceResult: ReferenceAnalysisResult = {
    inTextCheckSkipped: !options.checkInText || options.documentType === 'reference-list' || sourceListLikely,
    references,
    inTextCitations,
    verifications,
    crossReference,
    detectedStyle,
    totalReferences: references.length,
    verifiedCount: verifications.filter(v => v.status === 'verified' || v.status === 'likely_valid').length,
    suspiciousCount: verifications.filter(v => v.status === 'suspicious').length,
    notFoundCount: verifications.filter(v => v.status === 'not_found').length,
    unverifiedCount: verifications.filter(v => v.status === 'unverified').length,
    brokenUrlCount: verifications.filter(v => v.urlCheck?.status === 'dead').length,
    sourceListLikely,
  };

  onProgress?.({ stage: 'complete', progress: 100, message: 'Analysis complete.' });

  return {
    offline: options.offline === true,
    fileName: doc.fileName,
    extractedText: doc.text,
    references: referenceResult,
    processingTime: Date.now() - startTime,
  };
}

function detectMajorityStyle(refs: ParsedReference[]): CitationStyle {
  const counts: Record<CitationStyle, number> = { apa: 0, mla: 0, chicago: 0, unknown: 0 };
  for (const ref of refs) {
    counts[ref.detectedStyle]++;
  }
  let best: CitationStyle = 'unknown';
  let bestCount = 0;
  for (const [style, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = style as CitationStyle;
      bestCount = count;
    }
  }
  return best;
}
