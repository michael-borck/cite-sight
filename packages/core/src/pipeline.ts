import { extract } from './extractors/index.js';
import { extractReferences } from './references/extractor.js';
import { verifyReferences } from './references/verifier.js';
import type {
  AnalysisResult,
  ProcessingOptions,
  ProgressCallback,
  ReferenceAnalysisResult,
  CitationStyle,
  ParsedReference,
  InTextCitation,
  CrossReferenceResult,
} from './types.js';

function crossReferenceCheck(
  references: ParsedReference[],
  inTextCitations: InTextCitation[],
): CrossReferenceResult {
  const unmatchedBibliography: ParsedReference[] = [];
  const unmatchedInText: InTextCitation[] = [];

  for (const ref of references) {
    const authorLastNames = ref.authors.map(a => {
      const parts = a.split(/[,\s]+/);
      return parts[0].toLowerCase();
    }).filter(Boolean);

    const matched = inTextCitations.some(cite => {
      const citeAuthors = cite.authors.map(a => a.toLowerCase());
      return authorLastNames.some(name =>
        citeAuthors.some(ca => ca.includes(name) || name.includes(ca))
      );
    });

    if (!matched) {
      unmatchedBibliography.push(ref);
    }
  }

  for (const cite of inTextCitations) {
    const citeAuthors = cite.authors.map(a => a.toLowerCase());

    const matched = references.some(ref => {
      const authorLastNames = ref.authors.map(a => {
        const parts = a.split(/[,\s]+/);
        return parts[0].toLowerCase();
      }).filter(Boolean);

      return citeAuthors.some(ca =>
        authorLastNames.some(name => ca.includes(name) || name.includes(ca))
      );
    });

    if (!matched) {
      unmatchedInText.push(cite);
    }
  }

  return { unmatchedBibliography, unmatchedInText };
}

export async function analyzePipeline(
  filePath: string,
  options: ProcessingOptions,
  onProgress?: ProgressCallback,
): Promise<AnalysisResult> {
  const startTime = Date.now();

  // Stage 1: Extract text
  onProgress?.({ stage: 'extracting', progress: 5, message: 'Extracting text from document...' });
  const doc = await extract(filePath);

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
        mailto: options.contactEmail,
        citationStyle: detectedStyle,
        semanticScholarApiKey: options.semanticScholarApiKey,
      })
    : [];

  // Stage 8: Cross-reference check
  onProgress?.({ stage: 'checking_urls', progress: 90, message: 'Cross-referencing citations...' });
  let crossReference = options.checkInText
    ? crossReferenceCheck(references, inTextCitations)
    : { unmatchedBibliography: [], unmatchedInText: [] };

  // Source-list detection: if EVERY reference is uncited, the document is a bare
  // source list / annotated bibliography (e.g. a deep-research export), not a
  // manuscript — so the cross-reference check is meaningless and flagging all N
  // entries as "uncited" is pure noise. Suppress it and record why. Requires a
  // few references so a one- or two-entry snippet doesn't trip it.
  const sourceListLikely =
    references.length >= 3 &&
    crossReference.unmatchedBibliography.length === references.length;
  if (sourceListLikely) {
    crossReference = { unmatchedBibliography: [], unmatchedInText: [] };
  }

  const referenceResult: ReferenceAnalysisResult = {
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
