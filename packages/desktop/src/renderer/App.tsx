import { useEffect, useMemo, useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { ProcessingOptions } from './components/ProcessingOptions';
import { DataPrivacyPanel } from './components/DataPrivacyPanel';
import { ProcessingProgress } from './components/ProcessingProgress';
import { BatchList } from './components/BatchList';
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
  const results = useMemo(() => batch.flatMap((item) => item.result ? [item.result] : []), [batch]);
  const selected = batch.find((item) => item.path === selectedPath);
  const waiting = batch.filter((item) => item.status === 'waiting').map((item) => item.path);
  const failed = batch.filter((item) => item.status === 'failed').map((item) => item.path);

  useEffect(() => {
    window.citeSight?.getVersion().then(setVersion).catch(() => undefined);
    window.citeSight?.loadDismissals().then(setPersistedDismissals).catch(() => undefined);
    const stopProgress = window.citeSight?.onProgress((update) => useStore.getState().setProgress(update));
    const stopReferences = window.citeSight?.onReference(({ verification, total }) => useStore.getState().addStreamingRef(verification, total));
    return () => { stopProgress?.(); stopReferences?.(); };
  }, []);
  useEffect(() => {
    if (!activePath) { setElapsed(0); return; }
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(timer);
  }, [activePath]);

  async function check(paths: string[]) {
    const store = useStore.getState();
    if (store.isProcessing || !paths.length) return;
    setNotice('');
    store.setProcessing(true);
    const runOptions = { ...store.options };
    try {
      await runBatch(paths, {
        stopped: () => useStore.getState().cancelRequested,
        started: (path) => useStore.getState().startFile(path, runOptions),
        analyze: (path) => {
          if (!window.citeSight) throw new Error('The desktop bridge is unavailable. Restart CiteSight and try again.');
          return window.citeSight.analyzeFile(path, runOptions);
        },
        completed: (path, result) => useStore.getState().completeFile(path, result),
        failed: (path, message) => useStore.getState().failFile(path, message),
      });
      if (useStore.getState().cancelRequested) setNotice('Stopped after the current document. Waiting documents can be checked later.');
    } finally { useStore.getState().setProcessing(false); }
  }

  async function addDocuments() {
    try { state.addFiles(await window.citeSight.selectFiles()); }
    catch (err) { state.setError(err instanceof Error ? err.message : 'Could not select documents.'); }
  }

  async function saveReview() {
    try {
      const latest = useStore.getState();
      if (!latest.batch.length) return;
      const path = await window.citeSight.saveSession(makeReviewSession(latest.batch, latest.options, latest.selectedPath));
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
        <button type="button" className="version version-check" onClick={async () => {
          const update = await window.citeSight?.checkForUpdates();
          setNotice(update?.error ? 'Could not check for updates.' : update?.updateAvailable ? 'An update is available.' : 'CiteSight is up to date.');
        }}>v{version}</button>
      </div>
      <div className="batch-toolbar">
        <button type="button" className="btn btn-secondary" disabled={isProcessing} onClick={() => void openReview()}>Open review session</button>
        <button type="button" className="btn btn-secondary" disabled={!batch.length} onClick={() => void saveReview()}>Save review session</button>
        <button type="button" className="btn btn-secondary" aria-expanded={settings} onClick={() => setSettings(!settings)}>Settings</button>
      </div>
    </div></header>
    <main className="app-main"><div className="container">
      {settings && <section className="desktop-settings"><h2>Settings</h2><p>Check settings are remembered on this device.</p>
        <p>Saved review sessions contain citation results, review decisions and file paths. Full document text and API keys are excluded.</p>
        <ProcessingOptions /><DataPrivacyPanel onDismissalsCleared={() => setPersistedDismissals([])} />
      </section>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" className="error-message">{error}<button onClick={() => state.setError(null)} aria-label="Dismiss error">×</button></p>}
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
          </> : selected?.result ? <ResultsDashboard
            key={`${state.sessionId}:${selected.path}`} results={selected.result}
            onResultsChange={(result) => state.updateResult(selected.path, result)}
            readScreenshot={(path) => window.citeSight.readScreenshot(path)}
            reverify={isProcessing ? undefined : (reference) => window.citeSight.reverifyReference(reference, { ...options, ...selected.options })}
            persistedDismissals={persistedDismissals}
            onDismissalChange={(key, dismissed) => {
              setPersistedDismissals((previous) => dismissed ? [...new Set([...previous, key])] : previous.filter((value) => value !== key));
              void window.citeSight.setDismissal(key, dismissed);
            }}
          /> : <div className="batch-empty">
            <h2>{selected?.status === 'failed' ? 'Could not check this document' : 'Waiting to check'}</h2>
            <p>{selected?.error ?? 'Select a completed document to review it, or check the waiting documents.'}</p>
            {selected?.status === 'failed' && <button className="btn btn-primary" disabled={isProcessing} onClick={() => void check([selected.path])}>Retry this document</button>}
          </div>}
        </div></div>
      </>}
    </div></main><UpdateNotification />
  </div>;
}
