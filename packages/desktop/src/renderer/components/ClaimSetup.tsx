import { useState } from 'react';
import type { AnalysisResult } from '@michaelborck/cite-sight-core';
import { makeReviewSession } from '@michaelborck/cite-sight-core/session';
import { durationRange } from '@michaelborck/cite-sight-core/browser';
import { ClaimModelPicker } from './ClaimModelPicker';
import { useStore } from '../store';

export function ClaimSetup({ path, result, onOpenSettings }: { path: string; result: AnalysisResult; onOpenSettings?: () => void }) {
  const { isProcessing, options, progress, setProcessing, updateOptions, updateResult, setError, claimInstallation, claimSources, setClaimSource } = useStore();
  const sources = result.references.references.flatMap((ref, index) => claimSources[ref.raw] ? [{ reference: index + 1, path: claimSources[ref.raw], referenceText: ref.raw }] : []);
  const [running, setRunning] = useState(false);
  const [maxClaims, setMaxClaims] = useState(result.claims?.progress?.total || 50);
  const [restart, setRestart] = useState(false);
  const ready = Boolean(claimInstallation?.ready);

  async function pick(reference: number) {
    try {
      const selected = await window.citeSight.selectClaimFile('source');
      if (!selected) return;
      setClaimSource(result.references.references[reference - 1].raw, selected);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not select the local file.'); }
  }

  async function check() {
    if (isProcessing) return;
    setError(null); setProcessing(true); setRunning(true);
    updateOptions({ offline: true });
    try {
      const state = useStore.getState();
      const files = state.batch.map((file) => file.path === path ? { ...file, phase: 'claims' as const, status: 'waiting' as const,
        claimSources: sources, claimLimit: maxClaims, options: { ...options, offline: true },
      } : file);
      if (files.length) await window.citeSight.saveBatchCheckpoint?.(makeReviewSession(files, { ...options, offline: true }, path));
      const checked = await window.citeSight.checkClaims(path, {
        sources, expectedDocumentHash: result.inputSha256,
        maxClaims, restart,
      }, { ...options, offline: true });
      updateResult(path, { ...checked, reviews: useStore.getState().batch.find((file) => file.path === path)?.result?.reviews ?? result.reviews });
      setRestart(false);
    } catch (error) { setError(error instanceof Error ? error.message : 'Local claim checking failed.'); }
    finally { setRunning(false); setProcessing(false); }
  }

  return <details className="desktop-settings" open={running || undefined}>
    <summary>Claim evidence review <strong>(Experimental)</strong></summary>
    <p><strong>What this is:</strong> the app compares each cited statement in this essay against the source file you choose,
      on this Mac, offline, on the CPU. It <em>suggests</em> a verdict with quoted evidence; <strong>you decide</strong> whether
      the evidence supports the claim. It is a research preview, not a verified judge.</p>
    <ClaimModelPicker disabled={isProcessing} />
    {!ready && <p>After the one-time download, the steps here are: map each reference list entry to its source file, then start the review.</p>}
    {onOpenSettings && <button type="button" onClick={onOpenSettings}>Open local claim settings</button>}
    <p>Scanned PDFs need local OCR first. Only detected cited statements are checked; this is not a check of every claim in the document.</p>
    <fieldset disabled={isProcessing || !ready}>
      <legend>Step 2 — map sources, then review</legend>
      <label>Maximum cited statements <input type="number" min={1} max={200} value={maxClaims} onChange={(event) => setMaxClaims(Number(event.target.value))} /></label>
      <label><input type="checkbox" checked={restart} onChange={(event) => setRestart(event.target.checked)} /> Restart all claims instead of resuming. Use after changing the model or source mappings.</label>
      <ol>{result.references.references.map((reference, index) => <li key={index}>
        <span>{reference.raw}</span>{' '}
        <button type="button" onClick={() => void pick(index + 1)}>Choose source for reference {index + 1}</button>{' '}
        <span>{sources.find((source) => source.reference === index + 1)?.path.split(/[\\/]/).pop() ?? 'No local source'}</span>
        {sources.some((source) => source.reference === index + 1) && <button type="button" onClick={() => setClaimSource(reference.raw)}>Remove source {index + 1}</button>}
      </li>)}</ol>
      <button type="button" className="btn btn-primary" disabled={!ready || !sources.length} onClick={() => void check()}>Review claim evidence locally</button>
      <p>Each completed claim is saved locally, so an interrupted run resumes without repeating finished claims. After it finishes,
        open the <strong>Claims</strong> tab to compare each suggestion with the quoted evidence and record your own assessment.</p>
    </fieldset>
    {running && <div><p role="status">{progress?.message ?? 'Starting local claim checks...'}</p>
      {progress?.eta && <p>Estimated remaining on CPU: {durationRange(progress.eta)}. Basis: {progress.eta.basis}.</p>}
      <button type="button" onClick={() => void window.citeSight.cancelClaims()}>Cancel claim checks</button></div>}
    {result.claims && <p>{result.claims.progress?.state === 'partial' ? 'Partial results saved.' : 'Completed.'} Open the Claims tab below to inspect quotations and export the findings.</p>}
  </details>;
}
