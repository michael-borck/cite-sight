import { useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { AnalysisSetup, ResultsDashboard, StreamingResults } from '@michaelborck/cite-sight-ui';
import { downloadPdfReport } from '../utils/generatePdfReport';
import { downloadCsvReport } from '../utils/generateCsvReport';
import { ACCEPTED_FILES, ApiError, MAX_PASTE_CHARS, MAX_UPLOAD_BYTES, pollJob, referencesFile, retryReference, uploadDocument, type JobResponse } from '../utils/analysisApi';
import { clearRecovery, readRecovery, writeRecovery, type RecoverySnapshot } from '../utils/recovery';
import type { AnalysisResult, ProcessingOptions, ReferenceVerification } from '../types';
import './ToolPage.css';

type State = 'idle' | 'uploading' | 'streaming' | 'done' | 'error';
interface StreamPayload { verifications: ReferenceVerification[]; total: number; stage: string }
const DEFAULT_OPTIONS: ProcessingOptions = {
  documentType: 'assignment', citationStyle: 'auto', checkUrls: true, checkDoi: true, checkInText: true, screenshotUrls: false,
};

export function ToolPage() {
  const [state, setState] = useState<State>('idle');
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [paste, setPaste] = useState('');
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_OPTIONS);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [streaming, setStreaming] = useState<StreamPayload | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [expiresAt, setExpiresAt] = useState<string>();
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const nameRef = useRef('');
  const esRef = useRef<EventSource | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const jobRef = useRef<string | null>(null);
  const runRef = useRef(0);
  const runOptions = useRef(options);
  const isProcessing = state === 'uploading' || state === 'streaming';

  function stopWatching() {
    runRef.current++;
    controllerRef.current?.abort();
    controllerRef.current = null;
    esRef.current?.close();
    esRef.current = null;
  }
  useEffect(() => () => stopWatching(), []);
  useEffect(() => {
    let recovered;
    try { recovered = readRecovery(sessionStorage); } catch { return; }
    if (recovered.message) setRecoveryNotice(recovered.message);
    const saved = recovered.snapshot;
    if (!saved) return;
    setDisplayName(saved.fileName); nameRef.current = saved.fileName;
    setOptions(saved.options); runOptions.current = saved.options;
    jobRef.current = saved.jobId ?? null;
    if (saved.result) {
      setResult(saved.result); setExpiresAt(saved.expiresAt); setState('done');
      setRecoveryNotice('Restored your report and review decisions from this tab.');
    } else if (saved.jobId) {
      const controller = new AbortController(); controllerRef.current = controller;
      watchJob(saved.jobId, runRef.current, controller.signal);
      setRecoveryNotice('Reconnected to your previous check.');
    }
  }, []);
  useEffect(() => {
    if (!result || !expiresAt) return;
    saveRecovery({ version: 1, jobId: jobRef.current ?? undefined, fileName: displayName || result.fileName,
      options: runOptions.current, result, expiresAt });
    const timer = setTimeout(() => { clearRecovery(); setRecoveryNotice('Refresh recovery has expired. You can still download this page’s report.'); }, Math.max(0, Date.parse(expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [result, expiresAt, displayName]);
  useEffect(() => {
    if (!isProcessing) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(timer);
  }, [isProcessing]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    accept: ACCEPTED_FILES, maxSize: MAX_UPLOAD_BYTES, multiple: false, disabled: isProcessing,
    onDrop: (accepted) => { if (accepted[0]) { setFile(accepted[0]); setError(''); } },
  });

  function saveRecovery(snapshot: RecoverySnapshot) {
    try {
      if (!writeRecovery(sessionStorage, snapshot)) setRecoveryNotice('This browser cannot save refresh recovery. Download the report before leaving this page.');
    } catch { setRecoveryNotice('Refresh recovery is unavailable in this browser.'); }
  }

  function finish(data: JobResponse, token: number) {
    if (token !== runRef.current) return;
    esRef.current?.close(); esRef.current = null;
    setStreaming(null);
    if (data.status === 'failed' || data.error) {
      if (data.status === 'failed') { clearRecovery(); jobRef.current = null; }
      setError(data.error ?? 'Analysis failed.'); setState('error');
    } else if (data.result) {
      setResult({ ...data.result, fileName: nameRef.current || data.result.fileName });
      setExpiresAt(data.expiresAt ?? new Date(Date.now() + 3600_000).toISOString()); setState('done');
    }
  }

  function watchJob(jobId: string, token: number, signal: AbortSignal) {
    setState('streaming'); jobRef.current = jobId;
    saveRecovery({ version: 1, jobId, fileName: nameRef.current, options: runOptions.current });
    setStreaming({ verifications: [], total: 0, stage: 'queued' });
    const source = new EventSource(`/api/stream/${encodeURIComponent(jobId)}`);
    esRef.current = source;
    source.onmessage = (event) => {
      if (token !== runRef.current) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'complete') finish({ status: 'complete', result: message.result, expiresAt: message.expiresAt }, token);
      else if (message.type === 'error') finish({ status: 'failed', error: message.error }, token);
      else if (message.type === 'progress') setStreaming((previous) => previous ? {
        ...previous, stage: message.stage ?? previous.stage,
        total: Number(/(\d+)\s+references/i.exec(message.message ?? '')?.[1]) || previous.total,
      } : previous);
      else if (message.type === 'reference') setStreaming((previous) => previous ? {
        verifications: [...previous.verifications, message.verification], total: message.total, stage: 'verifying_references',
      } : previous);
    };
    source.onerror = () => {
      source.close();
      if (token !== runRef.current || signal.aborted) return;
      void pollJob(jobId, signal).then((data) => finish(data, token)).catch((err) => {
        if (!signal.aborted) finish({ status: err instanceof ApiError && err.status === 404 ? 'failed' : undefined,
          error: err instanceof ApiError && err.status === 404 ? 'This report has expired or is no longer available. Start a new check.' : err instanceof Error ? err.message : 'Connection lost. Please try again.' }, token);
      });
    };
  }

  async function handleAnalyze() {
    let input: File;
    try { input = mode === 'paste' ? referencesFile(paste) : file!; if (!input) throw new Error('Choose a document first.'); }
    catch (err) { setError((err as Error).message); return; }
    stopWatching();
    clearRecovery(); setRecoveryNotice(''); setExpiresAt(undefined);
    const token = runRef.current;
    const controller = new AbortController(); controllerRef.current = controller;
    runOptions.current = { ...options };
    nameRef.current = input.name;
    jobRef.current = null;
    setError(''); setNotice(''); setResult(null); setElapsed(0); setDisplayName(input.name); setState('uploading');
    try {
      const data = await uploadDocument(input, options, controller.signal);
      if (token !== runRef.current) return;
      if (data.result) finish(data, token);
      else if (data.jobId) watchJob(data.jobId, token, controller.signal);
      else throw new Error('The server did not return a result or job ID. Please try again.');
    } catch (err) {
      if (!controller.signal.aborted) finish({ error: err instanceof Error ? err.message : 'Upload failed. Please try again.' }, token);
    }
  }

  async function handleCancel() {
    const job = jobRef.current;
    stopWatching(); jobRef.current = null;
    clearRecovery(); setRecoveryNotice('');
    const token = runRef.current;
    setStreaming(null); setState('idle');
    if (!job) { setNotice('Stopped waiting. If analysis has already started, the server will finish it and delete the upload.'); return; }
    try {
      const response = await fetch(`/api/job/${encodeURIComponent(job)}`, { method: 'DELETE', signal: AbortSignal.timeout(10_000) });
      if (token !== runRef.current) return;
      setNotice(response.ok ? 'Removed from the queue. Your upload has been deleted.' : response.status === 409
        ? 'Analysis had already started. It will finish and delete the upload; the report expires after one hour.'
        : 'Stopped watching this job. It may still be running on the server.');
    } catch { if (token === runRef.current) setNotice('Stopped watching. The server could not confirm cancellation.'); }
  }

  function reset() {
    stopWatching(); jobRef.current = null;
    clearRecovery(); setExpiresAt(undefined); setRecoveryNotice('');
    setFile(null); setPaste(''); setResult(null); setStreaming(null); setError(''); setNotice(''); setState('idle');
  }

  return <div className="tool-page">
    <div className="tool-header"><h2>Check citations online</h2><p className="tool-subtitle">Add a document or paste a reference list.</p></div>
    <p className="privacy-notice">Uploads are deleted after analysis or cancellation while queued. Queued reports exclude full document text and expire after one hour.</p>
    {notice && <p className="cancel-notice" role="status">{notice}</p>}
    {recoveryNotice && <p className="cancel-notice" role="status">{recoveryNotice}</p>}
    {error && <div className="error-message" role="alert">{error}<button className="dismiss-btn" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    {state === 'error' && jobRef.current && <button className="btn btn-secondary" onClick={() => {
      const job = jobRef.current!; stopWatching(); setError(''); const controller = new AbortController(); controllerRef.current = controller;
      watchJob(job, runRef.current, controller.signal);
    }}>Reconnect to check</button>}
    {isProcessing ? <div className="streaming-section">
      <p role="status">{state === 'uploading' ? `Uploading and checking ${displayName}…` : `Checking ${displayName}`}</p>
      {streaming ? <StreamingResults verifications={streaming.verifications} total={streaming.total} stage={streaming.stage} elapsedMs={elapsed} fileName={displayName} /> : <progress aria-label="Uploading and checking document" />}
      <button className="btn btn-secondary" onClick={() => void handleCancel()}>{state === 'uploading' ? 'Stop waiting' : 'Cancel / stop watching'}</button>
    </div> : result ? <div className="results-section">
      {expiresAt && <p>Download to keep this report. Refresh recovery ends at <time dateTime={expiresAt}>{new Date(expiresAt).toLocaleString()}</time>.</p>}
      <div className="results-toolbar"><h3 className="results-file-name">{displayName || result.fileName}</h3><div className="results-toolbar-actions">
        <button className="btn btn-primary" onClick={() => downloadPdfReport(result)}>Download PDF</button>
        <button className="btn btn-secondary" onClick={() => downloadCsvReport(result)}>Download CSV</button>
        <button className="btn btn-secondary" onClick={reset}>Check another document</button>
      </div></div>
      <ResultsDashboard key={runRef.current} results={result} onResultsChange={setResult} reverify={(reference) => retryReference(reference, runOptions.current)} />
    </div> : <section className="upload-section">
      <div className="input-tabs" role="tablist" aria-label="Input method">
        {(['upload', 'paste'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={mode === value} aria-controls={`input-${value}`} id={`tab-${value}`}
          onClick={() => { setMode(value); setError(''); setOptions((previous) => ({ ...previous, documentType: value === 'paste' ? 'reference-list' : 'assignment', checkInText: value !== 'paste' })); }}>
          {value === 'upload' ? 'Upload document' : 'Paste references'}
        </button>)}
      </div>
      {mode === 'upload' ? <div id="input-upload" role="tabpanel" aria-labelledby="tab-upload">
        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'dropzone-active' : ''}`}><input {...getInputProps()} />
          <p>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : 'Drop a document here or click to browse'}</p>
          <p className="dropzone-hint">PDF, DOCX, TXT, MD, QMD or JSON · Maximum 10 MB</p>
        </div>
        {fileRejections.map(({ file: rejected, errors }) => <p role="alert" className="error-message" key={rejected.name}>{rejected.name}: {errors.map((issue) => issue.code === 'file-too-large'
          ? `This file is ${(rejected.size / 1024 / 1024).toFixed(1)} MB; the limit is 10 MB.`
          : issue.code === 'too-many-files' ? 'Choose one document at a time.' : 'Choose a PDF, DOCX, TXT, MD, QMD or JSON file.').join(' ')}</p>)}
      </div> : <div id="input-paste" role="tabpanel" aria-labelledby="tab-paste">
        <label htmlFor="references-text">Paste your references, with one entry per paragraph</label>
        <textarea id="references-text" className="paste-references" value={paste} onChange={(event) => setPaste(event.target.value)} rows={10} placeholder={'Smith, J. (2020). Article title. Journal, 1, 1–10.\n\nJones, A. (2021). Book title. Publisher.'} aria-describedby="paste-limit" />
        <p id="paste-limit">{paste.length.toLocaleString()} / {MAX_PASTE_CHARS.toLocaleString()} characters</p>
        {paste.length > MAX_PASTE_CHARS && <p role="alert">Please shorten the reference list before checking.</p>}
      </div>}
      <AnalysisSetup options={options} onChange={(patch) => setOptions((previous) => ({ ...previous, ...patch }))} />
      <div className="action-buttons"><button className="btn btn-primary" onClick={() => void handleAnalyze()} disabled={mode === 'upload' ? !file : !paste.trim() || paste.length > MAX_PASTE_CHARS}>Check citations</button></div>
    </section>}
  </div>;
}
