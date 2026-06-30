import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { ResultsDashboard, StreamingResults } from '@michaelborck/cite-sight-ui';
import { AnalysisProgress } from '../components/AnalysisProgress';
import { downloadPdfReport } from '../utils/generatePdfReport';
import { downloadCsvReport } from '../utils/generateCsvReport';
import type { AnalysisResult, ProcessingOptions, ReferenceVerification } from '../types';
import './ToolPage.css';

type AppState = 'idle' | 'uploading' | 'streaming' | 'done' | 'error';

interface JobResponse {
  jobId?: string;
  result?: AnalysisResult;
  status?: 'queued' | 'processing' | 'complete' | 'failed';
  error?: string;
}

/** Growing view of the in-flight analysis, fed by the SSE stream. */
interface StreamPayload {
  verifications: ReferenceVerification[];
  total: number;
  stage: string;
}

/** Wire shape of a single server-sent event from GET /api/stream/:id. */
type StreamMessage = {
  type: 'progress' | 'reference' | 'complete' | 'error';
  jobId: string;
  stage?: string;
  message?: string;
  progress?: number;
  index?: number;
  total?: number;
  verification?: ReferenceVerification;
  result?: AnalysisResult;
  error?: string;
};

const DEFAULT_OPTIONS: ProcessingOptions = {
  citationStyle: 'auto',
  checkUrls: true,
  checkDoi: true,
  checkInText: true,
};

const sleep = (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
};

async function pollJob(jobId: string): Promise<AnalysisResult> {
  while (true) {
    await sleep(2000);
    const res = await fetch(`/api/job/${jobId}`);
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
    const data: JobResponse = await res.json();
    if (data.status === 'complete' && data.result) return data.result;
    if (data.status === 'failed') throw new Error(data.error ?? 'Analysis failed');
  }
}

export function ToolPage() {
  const [state, setState] = useState<AppState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_OPTIONS);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string>('');
  const [showDesktopTip, setShowDesktopTip] = useState(true);
  const [streaming, setStreaming] = useState<StreamPayload | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) {
      setFile(accepted[0]);
      setResult(null);
      setError('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    multiple: false,
    disabled: state === 'uploading' || state === 'streaming',
  });

  function closeStream() {
    esRef.current?.close();
    esRef.current = null;
  }

  // Elapsed timer for the streaming view.
  useEffect(() => {
    if (state !== 'streaming') {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(id);
  }, [state]);

  // Never leave an EventSource open after unmount.
  useEffect(() => () => closeStream(), []);

  /**
   * Stream per-reference verdicts for a queued job over SSE, rendering each
   * reference as it lands. If the stream drops (proxy timeout, etc.) we fall
   * back to polling so the final result is never lost.
   */
  function runStream(jobId: string) {
    setState('streaming');
    setStreaming({ verifications: [], total: 0, stage: 'queued' });
    let settled = false;

    const finish = (finalResult: AnalysisResult | null, err?: string) => {
      if (settled) return;
      settled = true;
      closeStream();
      setStreaming(null);
      if (err) {
        setError(err);
        setState('error');
      } else if (finalResult) {
        setResult(finalResult);
        setState('done');
      }
    };

    const es = new EventSource(`/api/stream/${encodeURIComponent(jobId)}`);
    esRef.current = es;

    es.onmessage = (ev) => {
      let msg: StreamMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'progress':
          setStreaming((s) => {
            if (!s) return s;
            // "Verifying N references..." — surface N early so the bar can move.
            const m = msg.message && /(\d+)\s+references/i.exec(msg.message);
            const total = m ? parseInt(m[1], 10) : s.total;
            return { ...s, stage: msg.stage ?? s.stage, total };
          });
          break;
        case 'reference':
          setStreaming((s) => {
            if (!s || !msg.verification) return s;
            return {
              verifications: [...s.verifications, msg.verification],
              total: msg.total ?? s.total,
              stage: 'verifying_references',
            };
          });
          break;
        case 'complete':
          finish(msg.result ?? null);
          break;
        case 'error':
          finish(null, msg.error ?? 'Analysis failed');
          break;
      }
    };

    es.onerror = () => {
      if (settled) return;
      closeStream();
      pollJob(jobId)
        .then((r) => finish(r))
        .catch((e) => finish(null, e instanceof Error ? e.message : String(e)));
    };
  }

  async function handleAnalyze() {
    if (!file) return;
    setError('');
    setResult(null);
    setStreaming(null);
    closeStream();
    setState('uploading');

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('citationStyle', options.citationStyle);
      fd.append('checkUrls', String(options.checkUrls));
      fd.append('checkDoi', String(options.checkDoi));
      fd.append('checkInText', String(options.checkInText));

      const res = await fetch('/api/analyze', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Server error ${res.status}`);
      }

      const data: JobResponse = await res.json();

      if (data.result) {
        // Synchronous path (no queue): whole result at once.
        setResult(data.result);
        setState('done');
      } else if (data.jobId) {
        // Queue path: stream references as they're verified.
        runStream(data.jobId);
      } else {
        throw new Error('Unexpected server response');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }

  function handleReset() {
    closeStream();
    setFile(null);
    setResult(null);
    setStreaming(null);
    setError('');
    setState('idle');
  }

  const isProcessing = state === 'uploading' || state === 'streaming';

  const trustScore =
    result && result.references.totalReferences > 0
      ? Math.round((result.references.verifiedCount / result.references.totalReferences) * 100)
      : null;
  const scoreTier =
    trustScore === null ? null : trustScore >= 80 ? 'high' : trustScore >= 50 ? 'mid' : 'low';

  return (
    <div className="tool-page">
      <div className="tool-header">
        <h2>Check Citations Online</h2>
        <p className="tool-subtitle">Upload your document and CiteSight will verify every reference automatically.</p>
      </div>

      <div className="privacy-notice">
        <span className="privacy-icon">🔒</span>
        Your files are processed and immediately deleted. No data is stored on our servers.
      </div>

      {state === 'streaming' && streaming ? (
        <div className="streaming-section">
          <StreamingResults
            verifications={streaming.verifications}
            total={streaming.total}
            stage={streaming.stage}
            elapsedMs={elapsed}
            fileName={file?.name ?? 'Document'}
          />
          <div className="action-buttons">
            <button className="btn btn-secondary" onClick={handleReset}>Cancel</button>
          </div>
        </div>
      ) : !result ? (
        <div className="upload-section">
          <div
            {...getRootProps()}
            className={`dropzone ${isDragActive ? 'dropzone-active' : ''} ${file ? 'dropzone-has-file' : ''} ${isProcessing ? 'dropzone-disabled' : ''}`}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className="file-info">
                <span className="file-icon">📄</span>
                <span className="file-name">{file.name}</span>
                <span className="file-size">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            ) : isDragActive ? (
              <p className="dropzone-text">Drop the file here...</p>
            ) : (
              <div className="dropzone-empty">
                <div className="dropzone-icon">⬆</div>
                <p className="dropzone-text">Drag &amp; drop a file here, or click to browse</p>
                <p className="dropzone-hint">Supports PDF, DOCX, and TXT</p>
              </div>
            )}
          </div>

          <details className="options-panel" open>
            <summary>Analysis Options</summary>
            <div className="options-grid">
              <div className="option-row">
                <label htmlFor="citationStyle">Citation Style</label>
                <select
                  id="citationStyle"
                  value={options.citationStyle}
                  onChange={(e) => setOptions({ ...options, citationStyle: e.target.value as ProcessingOptions['citationStyle'] })}
                  disabled={isProcessing}
                >
                  <option value="auto">Auto-detect</option>
                  <option value="apa">APA</option>
                  <option value="mla">MLA</option>
                  <option value="chicago">Chicago</option>
                </select>
              </div>

              <div className="option-row">
                <label>
                  <input
                    type="checkbox"
                    checked={options.checkUrls}
                    onChange={(e) => setOptions({ ...options, checkUrls: e.target.checked })}
                    disabled={isProcessing}
                  />
                  Check URLs
                </label>
              </div>

              <div className="option-row">
                <label>
                  <input
                    type="checkbox"
                    checked={options.checkDoi}
                    onChange={(e) => setOptions({ ...options, checkDoi: e.target.checked })}
                    disabled={isProcessing}
                  />
                  Verify DOIs
                </label>
              </div>

              <div className="option-row">
                <label>
                  <input
                    type="checkbox"
                    checked={options.checkInText}
                    onChange={(e) => setOptions({ ...options, checkInText: e.target.checked })}
                    disabled={isProcessing}
                  />
                  Check In-Text Citations
                </label>
              </div>
            </div>
          </details>

          {state === 'uploading' && <AnalysisProgress phase="uploading" />}

          {state === 'error' && error && (
            <div className="error-message">
              <span>⚠ {error}</span>
              <button className="dismiss-btn" onClick={() => { setError(''); setState('idle'); }}>×</button>
            </div>
          )}

          <div className="action-buttons">
            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={!file || isProcessing}
            >
              {isProcessing ? 'Analysing...' : 'Analyse Citations'}
            </button>
            {(file || state === 'error') && (
              <button className="btn btn-secondary" onClick={handleReset} disabled={isProcessing}>
                Reset
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="results-section">
          <div className="results-toolbar">
            <div className="results-toolbar-title">
              <h3 className="results-file-name">{result.fileName}</h3>
              {trustScore !== null && scoreTier && (
                <span className={`trust-score trust-score--${scoreTier}`}>{trustScore}% verified</span>
              )}
            </div>
            <div className="results-toolbar-actions">
              <button className="btn btn-primary" onClick={() => downloadPdfReport(result)}>
                Download PDF Report
              </button>
              <button className="btn btn-secondary" onClick={() => downloadCsvReport(result)}>
                Download CSV
              </button>
              <button className="btn btn-secondary" onClick={handleReset}>
                Analyse Another File
              </button>
            </div>
          </div>
          <ResultsDashboard results={result} />
          {showDesktopTip && (
            <div className="desktop-tip">
              <span>
                Want offline analysis and screenshot verification?{' '}
                <a href="https://github.com/michael-borck/cite-sight/releases/latest" target="_blank" rel="noopener noreferrer">
                  Try the desktop app
                </a>.
              </span>
              <button className="desktop-tip-dismiss" onClick={() => setShowDesktopTip(false)} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
