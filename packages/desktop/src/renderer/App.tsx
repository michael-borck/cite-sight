import { useEffect, useMemo, useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { ProcessingOptions } from './components/ProcessingOptions';
import { DataPrivacyPanel } from './components/DataPrivacyPanel';
import { ProcessingProgress } from './components/ProcessingProgress';
import { BatchList } from './components/BatchList';
import { ClaimSetup } from './components/ClaimSetup';
import { LocalClaimSettings } from './components/LocalClaimSettings';
import { BatchRuntime, type BatchClock } from './components/BatchRuntime';
import { ResultsDashboard, StreamingResults } from '@michaelborck/cite-sight-ui';
import { UpdateNotification } from './components/UpdateNotification';
import { downloadPdfReport } from './utils/generatePdfReport';
import { downloadCsvReport } from './utils/generateCsvReport';
import { exportBibtex } from '@michaelborck/cite-sight-core/browser';
import { DISCLAIMER } from '@michaelborck/cite-sight-core/disclaimer';
import { useStore } from './store';
import { runBatch } from './batch';
import { makeReviewSession } from '@michaelborck/cite-sight-core/session';
import './App.css';

export function App() {
  const state = useStore();
  const { batch, filePaths, options, isProcessing, cancelRequested, selectedPath, activePath, progress, streamingRefs, streamingTotal, error } = state;
  const [version, setVersion] = useState('');
  const [settings, setSettings] = useState(false);
  const [persistedDismissals, setPersistedDismissals] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState<BatchClock>();
  const results = useMemo(() => batch.flatMap((item) => item.result ? [item.result] : []), [batch]);
  const selected = batch.find((item) => item.path === selectedPath);
  const waiting = batch.filter((item) => item.status === 'waiting').map((item) => item.path);
  const failed = batch.filter((item) => item.status === 'failed').map((item) => item.path);
  useEffect(() => {
    const requested = options.offline !== false;
    void window.citeSight?.setLocalOnly?.(requested).catch((error) => {
      const current = useStore.getState();
      if ((current.options.offline !== false) === requested) current.updateOptions({ offline: !requested });
      current.setError(error instanceof Error ? error.message : 'Could not change network mode.');
    });
  }, [options.offline]);
  useEffect(() => {
    window.citeSight?.getVersion().then(setVersion).catch(() => undefined);
    void window.citeSight?.getClaimInstallation?.().then(state.setClaimInstallation).catch(() => undefined);
    window.citeSight?.loadDismissals().then(setPersistedDismissals).catch(() => undefined);
    const stopProgress = window.citeSight?.onProgress((update) => useStore.getState().setProgress(update));
    const stopReferences = window.citeSight?.onReference(({ verification, total }) => useStore.getState().addStreamingRef(verification, total));
    const stopClaims = window.citeSight?.onClaimCheckpoint?.(({ path, result }) => useStore.getState().saveClaimProgress(path, result));
    return () => { stopProgress?.(); stopReferences?.(); stopClaims?.(); };
  }, []);
  useEffect(() => {
    if (!activePath) { setElapsed(0); return; }
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(timer);
  }, [activePath]);

  async function checkpoint() {
    const latest = useStore.getState();
    if (!latest.batch.length) return;
    try { await window.citeSight.saveBatchCheckpoint?.(makeReviewSession(withSourceMappings(latest), latest.options, latest.selectedPath)); }
    catch { latest.setError('Could not save the batch checkpoint. Export your results before closing the app.'); }
  }
  function withSourceMappings(latest: ReturnType<typeof useStore.getState>) {
    return latest.batch.map((file) => ({ ...file, claimSources: file.result?.references.references.flatMap((reference, index) => latest.claimSources[reference.raw]
      ? [{ reference: index + 1, path: latest.claimSources[reference.raw], referenceText: reference.raw }] : []) ?? file.claimSources }));
  }
  async function estimate(paths: string[], claims = false) {
    const latest = useStore.getState();
    if (!paths.length) return;
    const previous = latest.batch.flatMap((item) => item.result?.claims?.timing?.inferenceCount && item.result.claims.provenance?.modelId === latest.claimInstallation?.modelId
      ? [item.result.claims.timing.inferenceMs / item.result.claims.timing.inferenceCount] : []);
    const plan = await window.citeSight.planBatch(paths, { offline: claims || latest.options.offline !== false, claims,
      observedMs: claims ? previous.at(-1) ?? latest.claimInstallation?.sampleMsPerClaim : undefined });
    latest.setPlan(plan);
  }
  async function preview(claims: boolean) {
    if (state.isProcessing) return;
    state.setProcessing(true); setClock(undefined);
    try { await estimate(filePaths, claims); }
    catch (error) { state.setError(String(error)); }
    finally { state.setProcessing(false); }
  }
  async function check(paths: string[], explicitPhase?: 'claims') {
    const store = useStore.getState();
    if (store.isProcessing || !paths.length) return;
    setNotice('');
    store.setProcessing(true);
    const runOptions = { ...store.options };
    try {
      if (explicitPhase === 'claims') store.queueClaims(paths);
      const phaseOf = (path: string) => explicitPhase ?? useStore.getState().batch.find((item) => item.path === path)?.phase ?? 'references';
      const claimsOnly = paths.every((path) => phaseOf(path) === 'claims');
      if (claimsOnly) { store.updateOptions({ offline: true }); await window.citeSight.setLocalOnly?.(true); }
      await estimate(paths, claimsOnly);
      setClock({ started: Date.now(), finished: [] });
      await checkpoint();
      await runBatch(paths, {
        stopped: () => useStore.getState().cancelRequested,
        started: (path) => { const phase = phaseOf(path); useStore.getState().setPhase(phase); useStore.getState().startFile(path, phase === 'claims' ? { ...runOptions, offline: true } : runOptions, phase); },
        analyze: (path) => {
          if (!window.citeSight) throw new Error('The desktop bridge is unavailable. Restart CiteSight and try again.');
          if (phaseOf(path) === 'claims') {
            const item = useStore.getState().batch.find((item) => item.path === path);
            return window.citeSight.checkClaims(path, { sources: item?.claimSources ?? [], expectedDocumentHash: item?.result?.inputSha256,
              maxClaims: item?.claimLimit ?? 50 }, { ...runOptions, ...item?.options, offline: true });
          }
          return window.citeSight.analyzeFile(path, runOptions);
        },
        completed: async (path, result) => { const latest = useStore.getState(); latest.completeFile(path, { ...result, reviews: latest.batch.find((file) => file.path === path)?.result?.reviews }); setClock((clock) => clock ? { ...clock, finished: [...clock.finished, path] } : clock); await checkpoint(); },
        failed: async (path, message) => { useStore.getState().failFile(path, message); setClock((clock) => clock ? { ...clock, finished: [...clock.finished, path] } : clock); await checkpoint(); },
      });
      if (useStore.getState().cancelRequested) setNotice('Stopped after the current document. Waiting documents can be checked later.');
    } catch (error) { store.setError(error instanceof Error ? error.message : String(error)); }
    finally { setClock((clock) => clock ? { ...clock, ended: Date.now() } : clock); await checkpoint(); useStore.getState().setProcessing(false); }
  }

  async function addDocuments() {
    try { state.addFiles(await window.citeSight.selectFiles()); }
    catch (err) { state.setError(err instanceof Error ? err.message : 'Could not select documents.'); }
  }

  async function saveReview() {
    try {
      const latest = useStore.getState();
      if (!latest.batch.length) return;
      const path = await window.citeSight.saveSession(makeReviewSession(withSourceMappings(latest), latest.options, latest.selectedPath));
      if (path) setNotice(`Review session saved to ${path}`);
    } catch (err) { state.setError(err instanceof Error ? err.message : 'Could not save this session.'); }
  }

  async function openReview() {
    if (useStore.getState().isProcessing) return;
    try {
      const session = await window.citeSight.openSession();
      if (session) { state.restoreSession(session); setNotice('Review session opened. Waiting documents can be checked when you are ready.'); }
    } catch (err) { state.setError(err instanceof Error ? err.message : 'Could not open this session.'); }
  }

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void saveReview(); }
      if (event.key.toLowerCase() === 'o') { event.preventDefault(); void openReview(); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  return <div className="app">
    <header className="app-header"><div className="header-inner">
      <div className="header-brand"><h1>CiteSight<span className="dot" /></h1>
        <button type="button" className="version version-check" disabled={isProcessing || options.offline !== false} onClick={async () => {
          const update = await window.citeSight?.checkForUpdates();
          setNotice(update?.error ? 'Could not check for updates.' : update?.updateAvailable ? 'An update is available.' : 'CiteSight is up to date.');
        }}>v{version}</button>
      </div>
      <div className="batch-toolbar">
        <button type="button" className="btn btn-secondary" disabled={isProcessing} onClick={() => void openReview()}>Open review session</button>
        <button type="button" className="btn btn-secondary" disabled={isProcessing} onClick={async () => {
          try { const saved = await window.citeSight.loadBatchCheckpoint(); if (saved) { state.restoreSession(saved); setClock(undefined); setNotice('Batch restored. Reference verification runs online by default; tick Local-only mode first if this batch must stay offline.'); } else setNotice('No saved batch checkpoint was found.'); }
          catch (error) { state.setError(String(error)); }
        }}>Restore last batch</button>
        <button type="button" className="btn btn-secondary" disabled={!batch.length} onClick={() => void saveReview()}>Save review session</button>
        <button type="button" className="btn btn-secondary" aria-expanded={settings} onClick={() => setSettings(!settings)}>Settings</button>
      </div>
    </div></header>
    <main className="app-main"><div className="container">
      {settings && <section className="desktop-settings"><h2>Settings</h2><p>Check settings are remembered on this device.</p>
        <p>Saved sessions contain citation results, review decisions, file paths and any checked claim excerpts and source quotations. Full document text and API keys are excluded.</p>
        <LocalClaimSettings /><ProcessingOptions /><DataPrivacyPanel onDismissalsCleared={() => setPersistedDismissals([])} />
        <p>Batch recovery stores completed documents and individual claim results, source paths and review excerpts locally. Clearing recovery also removes saved per-claim checkpoints.</p>
        <button type="button" disabled={isProcessing} onClick={async () => {
          try { await window.citeSight.clearBatchCheckpoint(); setNotice('Saved batch checkpoint removed. The open batch remains in memory.'); }
          catch (error) { state.setError(String(error)); }
        }}>Clear saved batch checkpoint</button>
      </section>}
      {notice && <p role="status">{notice}</p>}
      {isProcessing && !activePath && filePaths.length > 0 && <p role="status">{progress?.message ?? 'Preparing the batch locally...'}</p>}
      {error && <p role="alert" className="error-message">{error}<button onClick={() => state.setError(null)} aria-label="Dismiss error">×</button></p>}
      {filePaths.length > 0 && <div className="batch-toolbar">
        <button type="button" disabled={isProcessing} onClick={() => void preview(false)}>Estimate reference runtime</button>
        <button type="button" disabled={isProcessing} onClick={() => void preview(true)}>Estimate CPU claim runtime</button>
        {state.claimInstallation?.ready && <button type="button" disabled={isProcessing || !batch.some((item) => item.result?.references.references.some((ref) => state.claimSources[ref.raw]))}
          onClick={() => void check(batch.filter((item) => item.result?.references.references.some((ref) => state.claimSources[ref.raw])).map((item) => item.path), 'claims')}>Review claim evidence for mapped documents</button>}
      </div>}
      <BatchRuntime clock={clock} />
      {!state.hasStarted ? <section className="upload-section">
        <FileUpload />
        {filePaths.length > 0 && <><ProcessingOptions /><div className="action-buttons">
          <button className="btn btn-primary" disabled={isProcessing} onClick={() => void check(waiting)}>Check {filePaths.length === 1 ? 'citations' : `${filePaths.length} documents`}</button>
          <button className="btn btn-secondary" disabled={isProcessing} onClick={state.reset}>Clear documents</button>
        </div></>}
        <p className="upload-disclaimer">{DISCLAIMER}</p>
      </section> : <>
        <div className="batch-toolbar">
          <button className="btn btn-secondary" onClick={() => void addDocuments()} disabled={isProcessing}>Add documents</button>
          {waiting.length > 0 && <button className="btn btn-primary" disabled={isProcessing} onClick={() => void check(waiting)}>Check {waiting.length} waiting documents</button>}
          {failed.length > 0 && <button className="btn btn-secondary" disabled={isProcessing} onClick={() => void check(failed)}>Retry {failed.length} failed documents</button>}
          {isProcessing && <button className="btn btn-secondary" disabled={cancelRequested} onClick={state.requestCancel}>{cancelRequested ? 'Stopping after this document…' : 'Stop after this document'}</button>}
          <button className="btn btn-secondary" disabled={isProcessing} onClick={state.reset}>New batch</button>
          {results.length > 0 && <>
            <button className="btn btn-secondary" onClick={() => void downloadPdfReport(results, new Set(persistedDismissals))}>Export PDF</button>
            <button className="btn btn-secondary" onClick={() => downloadCsvReport(results, new Set(persistedDismissals))}>Export CSV</button>
            <button className="btn btn-secondary" onClick={() => {
              const url = URL.createObjectURL(new Blob([exportBibtex(results.flatMap((result) => result.references.verifications))], { type: 'text/plain' }));
              const link = document.createElement('a'); link.href = url; link.download = 'verified-references.bib'; link.click(); URL.revokeObjectURL(url);
            }}>Export .bib</button>
          </>}
        </div>
        <div className="batch-layout"><BatchList onRetry={(paths) => void check(paths)} /><div className="batch-detail">
          {selected?.status === 'processing' ? <>
            <ProcessingProgress progress={progress ?? { stage: 'extracting', progress: 0, message: 'Reading document…' }} batchIndex={batch.findIndex((item) => item.path === activePath)} batchTotal={batch.length} currentFileName={activePath.split(/[\\/]/).pop() ?? activePath} onCancel={state.requestCancel} stopping={cancelRequested} />
            <StreamingResults verifications={streamingRefs} total={streamingTotal} stage={progress?.stage ?? 'extracting'} elapsedMs={elapsed} fileName={selected.path} />
          </> : selected?.result ? <><ClaimSetup key={`claims:${state.sessionId}:${selected.path}:${selected.result.inputSha256 ?? ''}`} path={selected.path} result={selected.result} onOpenSettings={() => setSettings(true)} /><ResultsDashboard
            key={`${state.sessionId}:${selected.path}`} results={selected.result}
            onResultsChange={(result) => { state.updateResult(selected.path, result); void checkpoint(); }}
            readScreenshot={(path) => window.citeSight.readScreenshot(path)}
            reverify={isProcessing ? undefined : (reference) => window.citeSight.reverifyReference(reference, { ...options, ...selected.options })}
            persistedDismissals={persistedDismissals}
            onDismissalChange={(key, dismissed) => {
              setPersistedDismissals((previous) => dismissed ? [...new Set([...previous, key])] : previous.filter((value) => value !== key));
              void window.citeSight.setDismissal(key, dismissed);
            }}
          /></> : <div className="batch-empty">
            <h2>{selected?.status === 'failed' ? 'Could not check this document' : 'Waiting to check'}</h2>
            <p>{selected?.error ?? 'Select a completed document to review it, or check the waiting documents.'}</p>
            {selected?.status === 'failed' && <button className="btn btn-primary" disabled={isProcessing} onClick={() => void check([selected.path])}>Retry this document</button>}
          </div>}
        </div></div>
      </>}
    </div></main><UpdateNotification />
  </div>;
}
