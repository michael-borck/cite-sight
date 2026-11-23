/**
 * Analysis engine selection — the migration seam.
 *
 * With `CITE_ANALYSER_URL` set, analysis is delegated to the Python successor
 * (cite-analyser) over HTTP using the lens family contract. The frozen
 * TypeScript engine remains the fallback while the migration is in flight:
 *
 *   CITE_ANALYSIS_ENGINE=auto      (default) use the analyser, fall back to the
 *                                  bundled engine if it is unreachable
 *   CITE_ANALYSIS_ENGINE=analyser  delegate only; fail if the analyser is down
 *   CITE_ANALYSIS_ENGINE=local     always use the bundled engine (pre-migration)
 *
 * The analyser's response mirrors `ReferenceAnalysisResult` field-for-field,
 * so the adapter here is a straight mapping — see MIGRATION.md.
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  analyzePipeline,
  type AnalysisResult,
  type ProcessingOptions,
  type ProgressCallback,
  type ReferenceAnalysisResult,
  type ReferenceVerification,
} from '@michaelborck/cite-sight-core';

// Read lazily so tests (and restarts) can adjust configuration per call.
const analyserUrl = (): string => (process.env.CITE_ANALYSER_URL ?? '').replace(/\/+$/, '');
const engineMode = (): string => (process.env.CITE_ANALYSIS_ENGINE ?? 'auto').toLowerCase();
const analyserTimeoutMs = (): number => Number(process.env.CITE_ANALYSER_TIMEOUT_MS ?? 600_000);

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

/** True when requests should attempt the analyser for this mode. */
export function analyserConfigured(): boolean {
  return engineMode() !== 'local' && analyserUrl().length > 0;
}

async function viaAnalyser(
  filePath: string,
  fileName: string,
  options: ProcessingOptions,
  onProgress?: ProgressCallback,
  onReference?: (verification: ReferenceVerification, index: number, total: number) => void,
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
  if (options.semanticScholarApiKey) {
    form.append('semanticScholarApiKey', options.semanticScholarApiKey);
  }
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
 * Analyse a document using the configured engine (analyser first, bundled
 * engine as fallback). Drop-in replacement for `analyzePipeline`.
 */
export async function analyseDocument(
  filePath: string,
  fileName: string,
  options: ProcessingOptions,
  onProgress?: ProgressCallback,
  onReference?: (verification: ReferenceVerification, index: number, total: number) => void,
): Promise<AnalysisResult> {
  if (analyserConfigured()) {
    try {
      return await viaAnalyser(filePath, fileName, options, onProgress, onReference);
    } catch (err) {
      if (engineMode() === 'analyser') throw err;
      console.warn(
        '[engine] cite-analyser unavailable, falling back to the bundled engine:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return analyzePipeline(filePath, options, onProgress, onReference);
}
