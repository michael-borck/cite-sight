/**
 * Engine client — delegates analysis to the cite-analyser engine over HTTP
 * using the lens family contract, with the bundled TypeScript engine as a
 * transition fallback.
 *
 * Configuration (environment):
 *   CITE_ANALYSER_URL         e.g. http://cite-analyser:8006 (unset = local only)
 *   CITE_ANALYSIS_ENGINE      auto (default) | analyser | local
 *   CITE_ANALYSER_TIMEOUT_MS  per-request deadline (default 600000)
 *
 * The analyser's /analyse response mirrors `ReferenceAnalysisResult`
 * field-for-field, so the adapter here is a straight mapping (see
 * MIGRATION.md in the cite-sight repo).
 *
 * This package deliberately has no runtime dependency on the bundled engine:
 * the caller injects it as `fallback`, so this client outlives the archive of
 * packages/core.
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type {
  AnalysisResult,
  ProcessingOptions,
  ProgressCallback,
  ReferenceAnalysisResult,
  ReferenceVerification,
} from '@michaelborck/cite-sight-core';

// Read lazily so tests and long-lived processes can adjust configuration.
const analyserUrl = (): string => (process.env.CITE_ANALYSER_URL ?? '').replace(/\/+$/, '');
const engineMode = (): string => (process.env.CITE_ANALYSIS_ENGINE ?? 'auto').toLowerCase();
const analyserTimeoutMs = (): number => Number(process.env.CITE_ANALYSER_TIMEOUT_MS ?? 600_000);

export type ReferenceCallback = (
  verification: ReferenceVerification,
  index: number,
  total: number,
) => void;

export type FallbackEngine = (
  filePath: string,
  options: ProcessingOptions,
  onProgress?: ProgressCallback,
  onReference?: ReferenceCallback,
) => Promise<AnalysisResult>;

export interface AnalyseOptions {
  filePath: string;
  fileName: string;
  options: ProcessingOptions;
  /** The bundled engine, used in `local` mode and as `auto`-mode fallback. */
  fallback: FallbackEngine;
  onProgress?: ProgressCallback;
  onReference?: ReferenceCallback;
}

interface AnalyserResponse {
  fileName: string;
  extractedText: string;
  references: ReferenceAnalysisResult['references'];
  inTextCitations: ReferenceAnalysisResult['inTextCitations'];
  verifications: ReferenceVerification[];
  crossReference: ReferenceAnalysisResult['crossReference'];
  detectedStyle: ReferenceAnalysisResult['detectedStyle'];
  totalReferences: number;
  verifiedCount: number;
  suspiciousCount: number;
  notFoundCount: number;
  unverifiedCount: number;
  brokenUrlCount: number;
  sourceListLikely: boolean;
  inTextCheckSkipped: boolean;
}

/** True when requests should attempt the analyser for the current mode. */
export function analyserConfigured(): boolean {
  return engineMode() !== 'local' && analyserUrl().length > 0;
}

async function viaAnalyser(
  { filePath, fileName, options, onProgress, onReference }: AnalyseOptions,
): Promise<AnalysisResult> {
  const started = Date.now();
  onProgress?.({
    stage: 'extracting',
    progress: 10,
    message: 'Sending document to the analysis engine...',
  });

  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), basename(fileName) || 'document');
  form.append('verify', 'true');
  form.append('citationStyle', options.citationStyle);
  form.append('checkUrls', String(options.checkUrls ?? true));
  form.append('checkDoi', String(options.checkDoi ?? true));
  form.append('checkInText', String(options.checkInText ?? true));
  if (options.documentType) form.append('documentType', options.documentType);
  if (options.semanticScholarApiKey) form.append('semanticScholarApiKey', options.semanticScholarApiKey);
  if (options.openAlexApiKey) form.append('openAlexApiKey', options.openAlexApiKey);

  const res = await fetch(`${analyserUrl()}/analyse`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(analyserTimeoutMs()),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`cite-analyser HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
  const body = (await res.json()) as AnalyserResponse;

  onProgress?.({
    stage: 'verifying_references',
    progress: 90,
    message: `Analysed ${body.totalReferences} references`,
  });
  body.verifications.forEach((verification, index, all) =>
    onReference?.(verification, index, all.length),
  );

  return {
    offline: false,
    fileName: body.fileName || fileName,
    extractedText: body.extractedText,
    processingTime: Date.now() - started,
    references: {
      inTextCheckSkipped: body.inTextCheckSkipped,
      references: body.references,
      inTextCitations: body.inTextCitations,
      verifications: body.verifications,
      crossReference: body.crossReference,
      detectedStyle: body.detectedStyle,
      totalReferences: body.totalReferences,
      verifiedCount: body.verifiedCount,
      suspiciousCount: body.suspiciousCount,
      notFoundCount: body.notFoundCount,
      unverifiedCount: body.unverifiedCount,
      brokenUrlCount: body.brokenUrlCount,
      sourceListLikely: body.sourceListLikely,
    },
  };
}

/**
 * Analyse a document using the configured engine: the HTTP analyser when
 * configured (subject to CITE_ANALYSIS_ENGINE), else the injected fallback.
 */
export async function analyseDocument(input: AnalyseOptions): Promise<AnalysisResult> {
  // Offline runs must never touch the network — the analyser always verifies.
  if (input.options.offline) {
    return input.fallback(input.filePath, input.options, input.onProgress, input.onReference);
  }
  if (analyserConfigured()) {
    try {
      return await viaAnalyser(input);
    } catch (err) {
      if (engineMode() === 'analyser') throw err;
      console.warn(
        '[engine] cite-analyser unavailable, falling back to the bundled engine:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return input.fallback(input.filePath, input.options, input.onProgress, input.onReference);
}
