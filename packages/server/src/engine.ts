/**
 * Server engine seam — delegates to the shared engine client
 * (@michaelborck/cite-sight-engine-client), injecting the bundled engine as
 * the transition fallback. Configuration: CITE_ANALYSER_URL,
 * CITE_ANALYSIS_ENGINE (auto|analyser|local), CITE_ANALYSER_TIMEOUT_MS.
 */
import {
  analyseDocument as analyse,
  analyserConfigured,
  type FallbackEngine,
} from '@michaelborck/cite-sight-engine-client';
import {
  analyzePipeline,
  type AnalysisResult,
  type ProcessingOptions,
  type ProgressCallback,
  type ReferenceVerification,
} from '@michaelborck/cite-sight-core';

export { analyserConfigured };

export async function analyseDocument(
  filePath: string,
  fileName: string,
  options: ProcessingOptions,
  onProgress?: ProgressCallback,
  onReference?: (verification: ReferenceVerification, index: number, total: number) => void,
): Promise<AnalysisResult> {
  return analyse({
    filePath,
    fileName,
    options,
    fallback: analyzePipeline as FallbackEngine,
    onProgress,
    onReference,
  });
}
