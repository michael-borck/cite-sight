import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { analyzePipeline } from '../pipelineFromFile.js';
import { extractFromBytes } from '../extractors/fromBytes.js';
import { MAX_INPUT_BYTES, MAX_TEXT_CHARS } from '../extractors/limits.js';
import { withoutExternalRequests } from '../httpClient.js';
import type { AnalysisResult, ClaimFinding, ClaimSourceBinding, LocalClaimOptions, ProcessingOptions, ProgressCallback } from '../types.js';
import { claimPrompt, extractClaims, retrievePassages, sourcePassages, validateClaimResponse, type Passage } from './evidence.js';
import { createLocalRunner, localPath } from './localRunner.js';
import { unitEstimate } from './timing.js';
import { readClaimCheckpoint, writeClaimCheckpoint, type ClaimCheckpoint, type ClaimCheckpointOptions } from './checkpoint.js';

/** JSON manifests are data only. Never load an executable or a model from one. */
export async function readClaimSources(path: string): Promise<ClaimSourceBinding[]> {
  const manifest = localPath(path);
  if ((await stat(manifest)).size > 100_000) throw new Error('Source manifest exceeds 100 KB.');
  const value = JSON.parse(await readFile(manifest, 'utf8'));
  if (value?.version !== 1 || !Array.isArray(value.sources)) throw new Error('Source manifest must have version 1 and a sources array.');
  return validateBindings(value.sources).map((source) => ({ ...source, path: localPath(resolve(dirname(manifest), localPathRelative(source.path))) }));
}

function localPathRelative(path: string): string {
  localPath(path); // Reject URL/UNC syntax before resolving against the manifest.
  return path;
}

function validateBindings(value: unknown): ClaimSourceBinding[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Supply at most 100 local source mappings.');
  const seen = new Set<number>();
  return value.map((entry) => {
    if (!entry || !Number.isInteger(entry.reference) || entry.reference < 1 || typeof entry.path !== 'string' ||
      entry.referenceText !== undefined && typeof entry.referenceText !== 'string' || seen.has(entry.reference)) {
      throw new Error('Each source must have a unique, one-based reference number and a local path.');
    }
    localPath(entry.path);
    seen.add(entry.reference);
    return { reference: entry.reference, path: entry.path, referenceText: entry.referenceText };
  });
}

/** Node-only entry: no cloud backend, endpoint option, downloads or online fallback. */
export async function analyzeClaimsFile(
  filePath: string, options: LocalClaimOptions, processing: ProcessingOptions,
  onProgress?: ProgressCallback, signal?: AbortSignal,
  checkpoint?: ClaimCheckpointOptions,
): Promise<AnalysisResult> {
  return withoutExternalRequests(async () => {
    const started = Date.now();
    signal?.throwIfAborted();
    const bindings = validateBindings(options.sources);
    const maxClaims = options.maxClaims ?? 50;
    if (!Number.isInteger(maxClaims) || maxClaims < 1 || maxClaims > 200) throw new Error('Claim limit must be between 1 and 200.');
    const runner = await createLocalRunner(options);
    if ((await stat(localPath(filePath))).size > MAX_INPUT_BYTES) throw new Error('Submission exceeds the 50 MB input limit.');
    const result = await analyzePipeline(localPath(filePath), { ...processing, offline: true, checkUrls: false, checkDoi: false, screenshotUrls: false },
      (update) => { if (update.stage !== 'complete') onProgress?.(update); });
    signal?.throwIfAborted();
    if (options.expectedDocumentHash && options.expectedDocumentHash !== result.inputSha256) throw new Error('The submission changed. Analyze it again and remap its sources.');
    for (const binding of bindings) {
      const reference = result.references.references[binding.reference - 1];
      if (!reference || binding.referenceText !== undefined && binding.referenceText !== reference.raw) throw new Error(`Source mapping ${binding.reference} no longer matches the bibliography.`);
    }
    const allClaims = extractClaims(result);
    const findings = allClaims.slice(0, maxClaims);
    const warnings = ['Findings compare cited statements with user-supplied files. Source identity and model judgements require human review.'];
    if (!findings.length) warnings.push('No supported cite-bearing sentences were detected. This does not mean the submission has no unsupported claims.');
    if (allClaims.length > maxClaims) warnings.push(`Only the first ${maxClaims} cited statements were checked.`);
    const signature = createHash('sha256').update(JSON.stringify({
      format: 'claim-resume-v1', input: result.inputSha256, provenance: runner.provenance,
      claims: findings.map(({ id, claim, citation, referenceIndex, position }) => ({ id, claim, citation, referenceIndex, position })),
      bindings: bindings.map(({ reference, path }) => ({ reference, path: localPath(path) })).sort((a, b) => a.reference - b.reference),
      processing: { citationStyle: processing.citationStyle, checkInText: processing.checkInText, documentType: processing.documentType ?? 'assignment' },
    })).digest('hex');
    let previous: ClaimCheckpoint | undefined;
    if (checkpoint) {
      checkpoint.path = localPath(checkpoint.path);
      const checkpointTarget = await realpath(checkpoint.path).catch(() => checkpoint.path);
      for (const input of [filePath, options.modelPath, options.runnerPath, ...bindings.map((binding) => binding.path)]) {
        if (checkpointTarget === await realpath(localPath(input)).catch(() => localPath(input))) throw new Error('Checkpoint path must not overwrite an input, model or executable.');
      }
      if (!checkpoint.restart) previous = await readClaimCheckpoint(checkpoint.path);
      if (previous && previous.signature !== signature) throw new Error('Claim checkpoint no longer matches the submission, source mappings, model, runtime or settings. Explicitly restart to run the changed configuration.');
    }
    const checkedAt = previous?.analysis.checkedAt ?? new Date().toISOString();
    let reused = 0;
    let completed = 0;
    const savedFindings = new Map((previous?.analysis.findings ?? []).map((finding) => [finding.id, finding]));
    const loaded = new Map<string, { passages: Passage[]; sha256: string; fileName: string } | string>();
    let textBudget = 32 * 1024 * 1024;
    let inferenceMs = 0;
    let inferenceCount = 0;
    let abstractWarningShown = false;
    const snapshot = (state: 'partial' | 'complete'): AnalysisResult => ({ ...result, extractedText: '', processingTime: Date.now() - started,
      claims: { version: 1, mode: 'local-only', model: runner.name, provenance: runner.provenance,
        timing: { inferenceMs, inferenceCount }, progress: { state, completed, total: findings.length, reused }, checkedAt,
        findings: findings.slice(0, completed).map((finding) => ({ ...finding })), warnings: [...warnings], omittedCount: allClaims.length - findings.length },
    });
    const save = async (state: 'partial' | 'complete') => {
      const partial = snapshot(state);
      if (checkpoint) {
        // Keep the already durable prefix if shutdown happens while replaying it.
        if (completed >= (previous?.analysis.progress?.completed ?? 0)) await writeClaimCheckpoint(checkpoint.path, signature, partial.claims!);
        await checkpoint.onSaved?.(partial);
      }
      return partial;
    };
    // Do not replace a previous checkpoint until its cached prefix is examined.
    if (!previous) await save('partial');
    for (const [index, finding] of findings.entries()) {
      signal?.throwIfAborted();
      const remaining = findings.slice(index).filter((finding) => bindings.some((binding) => binding.reference - 1 === finding.referenceIndex)).length;
      onProgress?.({ stage: 'checking_claims', completed: index, total: findings.length, restored: reused,
        eta: unitEstimate(remaining, 'claims', inferenceCount ? inferenceMs / inferenceCount : undefined),
        progress: Math.round(index / Math.max(1, findings.length) * 100), message: `Reviewing cited statement ${index + 1} of ${findings.length} on CPU (${reused} restored)...` });
      let settled = false;
      try {
        const binding = bindings.find((item) => item.reference - 1 === finding.referenceIndex);
        if (!binding) {
          // No local source mapped, but the online verification may have
          // brought back the publisher abstract. Abstract-level evidence is
          // weaker than full text — labelled as such on the finding.
          const matched = finding.referenceIndex !== undefined
            ? result.references.verifications[finding.referenceIndex]?.matchedWork
            : undefined;
          const abstract = matched?.abstract;
          if (abstract && abstract.trim().length >= 160) {
            const passages = sourcePassages({ text: abstract, fileName: 'publisher-abstract', fileType: 'txt' });
            finding.source = {
              fileName: `Publisher abstract (${matched!.source})`,
              sha256: createHash('sha256').update(abstract).digest('hex'),
            };
            const retrieval = retrievePassages(finding.claim.replace(finding.citation, ''), passages);
            if (!retrieval.length) { finding.reason = 'The abstract does not mention the claim\'s topic. The full text may — it was not supplied.'; settled = true; continue; }
            const inferenceStart = Date.now();
            try { Object.assign(finding, validateClaimResponse(await runner.infer(claimPrompt(finding.claim, retrieval), signal), retrieval)); }
            catch (error) {
              signal?.throwIfAborted();
              finding.status = 'unavailable';
              finding.reason = error instanceof Error ? error.message : 'Local inference failed.';
            }
            finally { inferenceMs += Date.now() - inferenceStart; inferenceCount++; }
            if (!abstractWarningShown) {
              warnings.push('Some findings rest on publisher abstracts only, not full text — the article body may contain qualifying detail. Source entries named "Publisher abstract" indicate these.');
              abstractWarningShown = true;
            }
            settled = true;
            continue;
          }
          settled = true; continue;
        }
        const path = localPath(binding.path);
        if (!loaded.has(path)) {
          try {
            if (!/\.(pdf|docx|txt|md|qmd)$/i.test(path)) throw new Error('Unsupported source format. Supply PDF, DOCX, TXT or Markdown.');
            if ((await stat(path)).size > MAX_INPUT_BYTES) throw new Error('Source exceeds the 50 MB input limit.');
            const bytes = await readFile(path);
            const doc = await extractFromBytes(bytes, basename(path));
            if (!doc.text.trim()) throw new Error('No source text was extracted. Scanned documents need local OCR before checking.');
            textBudget -= doc.text.length;
            if (textBudget < 0) throw new Error('The source text budget was exceeded. Check fewer sources at a time.');
            if (doc.text.length >= MAX_TEXT_CHARS || doc.pageCount && doc.pages && doc.pages.length < doc.pageCount) warnings.push(`${doc.fileName}: source extraction was truncated. Findings cover only the extracted text.`);
            loaded.set(path, { passages: sourcePassages(doc), sha256: createHash('sha256').update(bytes).digest('hex'), fileName: doc.fileName });
          } catch (error) {
            // Filesystem errors contain local paths. Keep those out of portable reports.
            const reason = error instanceof Error && !('code' in error) ? error.message : 'The mapped source file could not be read.';
            loaded.set(path, reason);
          }
        }
        const source = loaded.get(path)!;
        if (typeof source === 'string') { finding.status = 'unavailable'; finding.reason = source; settled = true; continue; }
        finding.source = { fileName: source.fileName, sha256: source.sha256 };
        const cached = savedFindings.get(finding.id);
        if (cached && reusableFinding(cached, finding, source.passages)) {
          Object.assign(finding, cached); reused++; settled = true; continue;
        }
        if (cached?.source && cached.source.sha256 !== source.sha256 && !warnings.includes('A mapped source changed. Its claims were rechecked instead of restored.')) warnings.push('A mapped source changed. Its claims were rechecked instead of restored.');
        if (finding.claim.length > 2000) { finding.reason = 'The cited statement is too long for the local context limit. Review it manually.'; settled = true; continue; }
        const passages = retrievePassages(finding.claim.replace(finding.citation, ''), source.passages);
        if (!passages.length) { finding.reason = 'Local retrieval found no relevant passages. This is not evidence of a contradiction.'; settled = true; continue; }
        const inferenceStart = Date.now();
        try { Object.assign(finding, validateClaimResponse(await runner.infer(claimPrompt(finding.claim, passages), signal), passages)); }
        catch (error) {
          signal?.throwIfAborted();
          finding.status = 'unavailable';
          finding.reason = error instanceof Error ? error.message : 'Local inference failed.';
        }
        finally { inferenceMs += Date.now() - inferenceStart; inferenceCount++; }
        settled = true;
      } finally {
        if (settled) { completed = index + 1; await save('partial'); }
      }
    }
    const finalResult = await save('complete');
    onProgress?.({ stage: 'complete', progress: 100, message: 'Local claim checking complete.' });
    return finalResult;
  });
}

function reusableFinding(saved: ClaimFinding, current: ClaimFinding, passages: Passage[]): boolean {
  if (saved.status === 'unavailable' || saved.claim !== current.claim || saved.citation !== current.citation || saved.position !== current.position ||
    saved.referenceIndex !== current.referenceIndex || !saved.source || saved.source.sha256 !== current.source?.sha256) return false;
  // Revalidate every stored quote against the freshly extracted source, including offsets.
  return saved.evidence.every((quote) => {
    const passage = passages.find((p) => p.id === quote.passageId);
    return passage?.page === quote.page && passage !== undefined && quote.start >= passage.start &&
      passage.text.slice(quote.start - passage.start, quote.end - passage.start) === quote.quote;
  });
}
