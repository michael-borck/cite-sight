import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  analyzeDocument,
  verifyReferences,
  exportBibtex,
  type AnalysisResult,
  type CitationStyle,
  type ParsedReference,
  type ProcessingOptions,
  type ProgressUpdate,
  type ReferenceVerification,
} from '@michaelborck/cite-sight-core/browser';
import { ResultsDashboard, StreamingResults } from '@michaelborck/cite-sight-ui';
import {
  ATTRIBUTION,
  DISCLAIMER,
  STANDALONE_LIMITS_NOTICE,
  STANDALONE_LIMITS_SHORT,
} from '@michaelborck/cite-sight-core/disclaimer';
import { checkLatestVersion, RELEASES_PAGE, type VersionCheck } from './versionCheck';
import { downloadPdfReport } from './utils/generatePdfReport';
import { downloadCsvReport } from './utils/generateCsvReport';
import './App.css';

const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md', '.qmd'],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB — mirrors the desktop limit

// URL liveness checks are OFF in this build and not offered: a web page's
// cross-origin probes are blocked by CORS for nearly every publisher, so the
// column would be a wall of 'error'. The per-row "Open cited URL" / "Open DOI"
// buttons are the manual replacement.
const BASE_OPTIONS = {
  checkUrls: false,
  checkDoi: true,
  screenshotUrls: false,
} as const;

// ─── dismissal persistence (localStorage — the standalone's only store) ──────

const DISMISSALS_KEY = 'cite-sight-dismissals';

function loadDismissals(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSALS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    // file:// pages in some browsers get no usable storage — dismissals then
    // last for the session only, which is a safe degradation.
    return [];
  }
}

function saveDismissals(keys: string[]): void {
  try {
    localStorage.setItem(DISMISSALS_KEY, JSON.stringify(keys));
  } catch {
    /* see loadDismissals */
  }
}

// ─── small helpers ────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? 'txt';
}

// ─── component ────────────────────────────────────────────────────────────────

export function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [citationStyle, setCitationStyle] = useState<ProcessingOptions['citationStyle']>('auto');
  const [contactEmail, setContactEmail] = useState('');
  const [s2Key, setS2Key] = useState('');
  const [checkInText, setCheckInText] = useState(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [batchIndex, setBatchIndex] = useState(0);
  const [streamingRefs, setStreamingRefs] = useState<ReferenceVerification[]>([]);
  const [streamingTotal, setStreamingTotal] = useState(0);
  const [streamElapsed, setStreamElapsed] = useState(0);

  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [persistedDismissals, setPersistedDismissals] = useState<string[]>(loadDismissals);

  const [versionCheck, setVersionCheck] = useState<VersionCheck | null>(null);
  const [versionChecking, setVersionChecking] = useState(false);

  // Cancel is checked BETWEEN files; a single file's analysis runs to completion.
  const cancelRef = useRef(false);
  // The run's options, for re-verify calls after the run completes.
  const runOptionsRef = useRef<{ contactEmail?: string; semanticScholarApiKey?: string }>({});

  // Elapsed timer for the streaming view.
  useEffect(() => {
    if (!isProcessing) {
      setStreamElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setStreamElapsed(Date.now() - start), 250);
    return () => clearInterval(id);
  }, [isProcessing]);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted]);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
    disabled: isProcessing,
  });

  const handleAnalyze = async () => {
    if (files.length === 0) {
      setError('Please select at least one file to analyze.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    cancelRef.current = false;
    runOptionsRef.current = {
      contactEmail: contactEmail || undefined,
      semanticScholarApiKey: s2Key || undefined,
    };

    const options: ProcessingOptions = {
      ...BASE_OPTIONS,
      citationStyle,
      checkInText,
      contactEmail: contactEmail || undefined,
      semanticScholarApiKey: s2Key || undefined,
    };

    try {
      for (let i = 0; i < files.length; i++) {
        if (cancelRef.current) break;

        setBatchIndex(i);
        setStreamingRefs([]);
        setStreamingTotal(0);
        setProgress(null);

        const file = files[i];
        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = await analyzeDocument(
          bytes,
          file.name,
          options,
          (update) => setProgress(update),
          (verification, _index, total) => {
            setStreamingRefs((prev) => [...prev, verification]);
            setStreamingTotal(total);
          },
        );
        setResults((prev) => [...prev, result]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during analysis.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setFiles([]);
    setResults([]);
    setCurrentResultIndex(0);
    setProgress(null);
    setStreamingRefs([]);
    setStreamingTotal(0);
    setError(null);
    setIsProcessing(false);
  };

  const handleVersionCheck = async () => {
    if (versionChecking) return;
    setVersionChecking(true);
    setVersionCheck(await checkLatestVersion(__APP_VERSION__));
    setVersionChecking(false);
  };

  const currentResult = results.length > 0 ? results[currentResultIndex] : null;

  // Re-verify a single reference (recovery for 'unverified' verdicts) — runs
  // the same in-browser cascade, minus the URL probe that can't work here.
  const reverify = async (ref: ParsedReference): Promise<ReferenceVerification | null> => {
    const detectedStyle: CitationStyle = currentResult?.references.detectedStyle ?? 'unknown';
    const [verification] = await verifyReferences([ref], {
      mailto: runOptionsRef.current.contactEmail,
      citationStyle: detectedStyle,
      semanticScholarApiKey: runOptionsRef.current.semanticScholarApiKey,
      checkUrls: false,
    });
    return verification ?? null;
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <h1>CiteSight<span className="dot"></span></h1>
            <button
              type="button"
              className="version version-check"
              title="Check for updates"
              onClick={() => void handleVersionCheck()}
            >
              v{__APP_VERSION__}
              {versionChecking && ' — checking…'}
              {versionCheck?.state === 'up-to-date' && ' — up to date'}
              {versionCheck?.state === 'error' && ' — check failed (offline?)'}
            </button>
            {versionCheck?.state === 'update-available' && (
              <a className="update-pill" href={RELEASES_PAGE} target="_blank" rel="noreferrer">
                v{versionCheck.latest} available — download
              </a>
            )}
          </div>
          <span className="header-tagline">standalone build — runs entirely on this device</span>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          {/* Stay on the progress view for the whole batch: per-file results
              land incrementally, and flipping to the report mid-batch would
              strand the remaining files' progress display. */}
          {results.length === 0 || isProcessing ? (
            <>
              {isProcessing ? (
                <div className="progress-inline">
                  <div className="progress-card">
                    <div className="progress-card-header">
                      <span className="progress-filename">
                        {files.length > 1 ? `File ${batchIndex + 1} of ${files.length} — ` : ''}
                        {files[batchIndex]?.name ?? ''}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary cancel-btn"
                        onClick={() => { cancelRef.current = true; }}
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="progress-stage">{progress?.message ?? 'Reading file…'}</div>
                    <div className="progress-bar-wrapper">
                      <div className="progress-bar-fill" style={{ width: `${progress?.progress ?? 0}%` }} />
                    </div>
                  </div>
                  <StreamingResults
                    verifications={streamingRefs}
                    total={streamingTotal}
                    stage={progress?.stage ?? 'extracting'}
                    elapsedMs={streamElapsed}
                    fileName={files[batchIndex]?.name ?? ''}
                  />
                </div>
              ) : (
                <>
                  <section className="upload-section">
                    <div className="file-upload-container">
                      <div
                        {...getRootProps()}
                        className={`dropzone ${isDragActive ? 'active' : ''} ${files.length > 0 ? 'has-files' : ''}`}
                      >
                        <input {...getInputProps()} />
                        <div className="dropzone-content">
                          <div className="dropzone-icon">&#128196;</div>
                          {isDragActive ? (
                            <p className="dropzone-text">Drop the files here...</p>
                          ) : (
                            <>
                              <p className="dropzone-text">Drag &amp; drop documents here, or click to browse</p>
                              <p className="dropzone-hint">PDF &middot; DOCX &middot; TXT &middot; MD &mdash; max 50 MB</p>
                            </>
                          )}
                        </div>
                      </div>

                      {fileRejections.length > 0 && (
                        <div className="file-errors">
                          {fileRejections.map(({ file, errors }) => (
                            <div key={file.name} className="error-item">
                              <strong>{file.name}</strong>
                              {errors.map((e) => (
                                <span key={e.code}> - {e.message}</span>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {files.length > 0 && (
                        <div className="file-list">
                          <div className="file-list-header">
                            <h3>Selected Files ({files.length})</h3>
                            <button type="button" onClick={() => setFiles([])} className="btn btn-secondary">
                              Clear All
                            </button>
                          </div>
                          <div className="files">
                            {files.map((f, i) => (
                              <div key={`${f.name}-${i}`} className="file-item">
                                <div className="file-info">
                                  <span className={`file-type-badge ${fileExtension(f.name)}`}>{fileExtension(f.name)}</span>
                                  <div className="file-details">
                                    <span className="file-name">{f.name}</span>
                                    <span className="file-size">{formatSize(f.size)}</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                                  className="file-remove"
                                  aria-label={`Remove ${f.name}`}
                                >
                                  &#10005;
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {files.length > 0 && (
                      <>
                        <details className="options-panel" open>
                          <summary>Analysis Options</summary>
                          <div className="options-grid">
                            <div className="option-group">
                              <div className="option-label">Citation Style</div>
                              <select
                                className="option-select"
                                value={citationStyle}
                                onChange={(e) => setCitationStyle(e.target.value as ProcessingOptions['citationStyle'])}
                              >
                                <option value="auto">Auto-detect</option>
                                <option value="apa">APA 7th Edition</option>
                                <option value="mla">MLA 9th Edition</option>
                                <option value="chicago">Chicago 17th Edition</option>
                              </select>
                            </div>
                            <div className="option-group">
                              <div className="option-label">Contact Email (optional)</div>
                              <input
                                className="option-select"
                                type="email"
                                placeholder="your@email.com"
                                value={contactEmail}
                                onChange={(e) => setContactEmail(e.target.value)}
                              />
                            </div>
                            <div className="option-group full">
                              <div className="option-label">Semantic Scholar API key (optional)</div>
                              <input
                                className="option-select"
                                type="password"
                                placeholder="Free key — lifts rate limits, fewer unverified"
                                value={s2Key}
                                onChange={(e) => setS2Key(e.target.value)}
                              />
                              <span className="hint">
                                Get a free key at semanticscholar.org/product/api — large batches verify far more reliably with one.
                                Stored only in this tab's memory.
                              </span>
                            </div>
                          </div>
                          <div className="checkbox-group">
                            <div className="checkbox-row">
                              <input
                                type="checkbox"
                                id="check-intext"
                                checked={checkInText}
                                onChange={(e) => setCheckInText(e.target.checked)}
                              />
                              <label htmlFor="check-intext">Check In-Text Citations</label>
                              <span className="hint">Cross-reference citations with bibliography</span>
                            </div>
                          </div>
                        </details>

                        <div className="action-buttons">
                          <button onClick={() => void handleAnalyze()} className="btn btn-primary">
                            {files.length === 1 ? 'Analyse Document' : `Analyse ${files.length} Documents`}
                          </button>
                          <button onClick={handleReset} className="btn btn-secondary">
                            Reset
                          </button>
                        </div>
                      </>
                    )}

                    <div className="standalone-notice">
                      <strong>Runs offline-first:</strong> {STANDALONE_LIMITS_NOTICE}
                    </div>
                  </section>
                  <p className="upload-disclaimer">{DISCLAIMER}</p>
                </>
              )}
              {error && (
                <div className="error-message">
                  <span>&#9888; {error}</span>
                  <button onClick={() => setError(null)} className="dismiss-btn">
                    &#10005;
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="results-header">
                {results.length === 1 ? (
                  <h2>Analysis Results: {results[0].fileName}</h2>
                ) : (
                  <div className="results-file-nav">
                    <h2>Analysis Results</h2>
                    <div className="file-selector">
                      <button
                        className="nav-arrow"
                        disabled={currentResultIndex === 0}
                        onClick={() => setCurrentResultIndex(currentResultIndex - 1)}
                      >
                        &#9664;
                      </button>
                      <select
                        value={currentResultIndex}
                        onChange={(e) => setCurrentResultIndex(Number(e.target.value))}
                        className="file-select"
                      >
                        {results.map((r, i) => (
                          <option key={i} value={i}>
                            {r.fileName} ({i + 1}/{results.length})
                          </option>
                        ))}
                      </select>
                      <button
                        className="nav-arrow"
                        disabled={currentResultIndex === results.length - 1}
                        onClick={() => setCurrentResultIndex(currentResultIndex + 1)}
                      >
                        &#9654;
                      </button>
                    </div>
                  </div>
                )}
                <div className="results-actions">
                  <button className="btn btn-secondary" onClick={() => void downloadPdfReport(results)}>
                    Export PDF
                  </button>
                  <button className="btn btn-secondary" onClick={() => downloadCsvReport(results)}>
                    Export CSV
                  </button>
                  <button
                    className="btn btn-secondary"
                    title="Verified references only, as registry records (with DOIs)"
                    onClick={() => {
                      const bib = exportBibtex(results.flatMap((r) => r.references.verifications));
                      const blob = new Blob([bib], { type: 'text/plain' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = 'verified-references.bib';
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                  >
                    Export .bib
                  </button>
                  <button onClick={handleReset} className="btn btn-primary">
                    New Analysis
                  </button>
                </div>
              </div>

              <p className="results-standalone-note">{STANDALONE_LIMITS_SHORT}</p>

              {error && (
                <div className="error-message">
                  <span>&#9888; {error}</span>
                  <button onClick={() => setError(null)} className="dismiss-btn">
                    &#10005;
                  </button>
                </div>
              )}

              {currentResult && (
                <ResultsDashboard
                  key={currentResultIndex}
                  results={currentResult}
                  reverify={reverify}
                  persistedDismissals={persistedDismissals}
                  onDismissalChange={(contentKey, dismissed) => {
                    setPersistedDismissals((prev) => {
                      const next = dismissed ? [...new Set([...prev, contentKey])] : prev.filter((k) => k !== contentKey);
                      saveDismissals(next);
                      return next;
                    });
                  }}
                />
              )}
            </>
          )}
        </div>
      </main>

      <footer className="app-footer">
        CiteSight v{__APP_VERSION__} (standalone) &middot;{' '}
        <a href={RELEASES_PAGE} target="_blank" rel="noreferrer">
          releases
        </a>
        <br />
        {ATTRIBUTION}
      </footer>
    </div>
  );
}
