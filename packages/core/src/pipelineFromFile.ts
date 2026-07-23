import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { analyzeDocument } from './pipeline.js';
import type {
  AnalysisResult,
  ProcessingOptions,
  ProgressCallback,
  ReferenceVerification,
} from './types.js';

/**
 * Read a document from disk and analyse it.
 *
 * Node-only, because of the disk read — which is the only reason this wrapper
 * exists separately from `analyzeDocument`. Hosts without a filesystem (a
 * browser, or a webview that already holds the bytes) call `analyzeDocument`
 * directly and never load this module.
 *
 * @param filePath    Absolute (or resolvable) path to the file on disk.
 * @param onReference Streamed once per reference as its verification lands.
 */
export async function analyzePipeline(
  filePath: string,
  options: ProcessingOptions,
  onProgress?: ProgressCallback,
  onReference?: (verification: ReferenceVerification, index: number, total: number) => void,
): Promise<AnalysisResult> {
  const bytes = await readFile(filePath);
  return analyzeDocument(bytes, basename(filePath), options, onProgress, onReference);
}
