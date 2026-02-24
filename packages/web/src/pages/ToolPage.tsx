import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ResultsDashboard } from '../components/ResultsDashboard';
import type { AnalysisResult, ProcessingOptions } from '../types';
import './ToolPage.css';

type AppState = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface JobResponse {
  jobId?: string;
  result?: AnalysisResult;
  status?: 'pending' | 'running' | 'complete' | 'error';
  error?: string;
}

const DEFAULT_OPTIONS: ProcessingOptions = {
  citationStyle: 'auto',
  checkUrls: true,
  checkDoi: true,
  checkInText: true,
};

async function pollJob(jobId: string, onProgress?: (msg: string) => void): Promise<AnalysisResult> {
  while (true) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`/api/job/${jobId}`);
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
    const data: JobResponse = await res.json();
    if (data.status === 'complete' && data.result) return data.result;
    if (data.status === 'error') throw new Error(data.error ?? 'Analysis failed');
    if (onProgress) onProgress(data.status ?? 'running');
  }
}

export function ToolPage() {
  const [state, setState] = useState<AppState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_OPTIONS);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string>('');
  const [progressMsg, setProgressMsg] = useState<string>('');

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
    disabled: state === 'uploading' || state === 'processing',
  });

  async function handleAnalyze() {
    if (!file) return;
    setError('');
    setResult(null);
    setState('uploading');
    setProgressMsg('Uploading file...');

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
        setResult(data.result);
        setState('done');
      } else if (data.jobId) {
        setState('processing');
        setProgressMsg('Analyzing document...');
        const finalResult = await pollJob(data.jobId, (msg) => setProgressMsg(`Processing: ${msg}...`));
        setResult(finalResult);
        setState('done');
      } else {
        throw new Error('Unexpected server response');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }

  function handleReset() {
    setFile(null);
    setResult(null);
    setError('');
    setState('idle');
    setProgressMsg('');
  }

  const isProcessing = state === 'uploading' || state === 'processing';

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

      {!result && (
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

          <div className="options-section">
            <h3>Analysis Options</h3>
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
          </div>

          {isProcessing && (
            <div className="progress-indicator">
              <div className="progress-spinner" />
              <span className="progress-text">{progressMsg}</span>
            </div>
          )}

          {state === 'error' && error && (
            <div className="error-message">
              <span>⚠ {error}</span>
              <button className="dismiss-btn" onClick={() => { setError(''); setState('idle'); }}>×</button>
            </div>
          )}

          <div className="action-buttons">
            <button
              className="analyze-btn"
              onClick={handleAnalyze}
              disabled={!file || isProcessing}
            >
              {isProcessing ? 'Analyzing...' : 'Analyze Citations'}
            </button>
            {(file || state === 'error') && (
              <button className="reset-btn" onClick={handleReset} disabled={isProcessing}>
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="results-section">
          <div className="results-toolbar">
            <h3 className="results-file-name">{result.fileName}</h3>
            <button className="reset-btn" onClick={handleReset}>
              Analyze Another File
            </button>
          </div>
          <ResultsDashboard results={result} />
        </div>
      )}
    </div>
  );
}
