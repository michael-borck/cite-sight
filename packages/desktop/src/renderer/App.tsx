import { useEffect, useRef, useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { ProcessingOptions } from './components/ProcessingOptions';
import { ProcessingProgress } from './components/ProcessingProgress';
import { ResultsDashboard } from './components/ResultsDashboard';
import { UpdateNotification } from './components/UpdateNotification';
import { downloadPdfReport } from './utils/generatePdfReport';
import { downloadCsvReport } from './utils/generateCsvReport';
import { useStore } from './store';
import './App.css';

export function App() {
  const {
    filePaths,
    options,
    isProcessing,
    cancelRequested,
    progress,
    batchIndex,
    batchTotal,
    results,
    currentResultIndex,
    error,
    setProcessing,
    requestCancel,
    clearCancel,
    setProgress,
    setBatch,
    addResult,
    setCurrentResultIndex,
    setError,
    reset,
  } = useStore();

  const [version, setVersion] = useState('');
  const cancelRef = useRef(false);

  // Keep ref in sync with store so the async loop can read it
  cancelRef.current = cancelRequested;

  // Fetch app version on mount
  useEffect(() => {
    window.citeSight?.getVersion().then(v => setVersion(v));
  }, []);

  // Register progress listener once on mount
  useEffect(() => {
    window.citeSight?.onProgress((update) => {
      setProgress(update);
    });
  }, [setProgress]);

  const handleAnalyze = async () => {
    if (filePaths.length === 0) {
      setError('Please select at least one file to analyze.');
      return;
    }

    setProcessing(true);
    clearCancel();

    try {
      if (!window.citeSight) {
        throw new Error('CiteSight API not available. Are you running inside Electron?');
      }

      const total = filePaths.length;
      for (let i = 0; i < total; i++) {
        // Check cancel between files
        if (cancelRef.current) {
          clearCancel();
          break;
        }

        setBatch(i, total);
        const result = await window.citeSight.analyzeFile(filePaths[i], options);
        addResult(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during analysis.');
      return;
    }

    setProcessing(false);
  };

  const handleCancel = () => {
    requestCancel();
    // Processing will stop after the current file completes
  };

  const handleReset = () => {
    reset();
  };

  const currentResult = results.length > 0 ? results[currentResultIndex] : null;

  const getFileName = (path: string): string => {
    return path.split(/[\\/]/).pop() ?? path;
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <div className="header-title-group">
              <h1>CiteSight</h1>
              {version && <span className="header-version">v{version}</span>}
            </div>
            <p>Academic Integrity &amp; Citation Checker</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          {results.length === 0 ? (
            <>
              <section className="upload-section">
                <FileUpload />

                {filePaths.length > 0 && (
                  <>
                    <ProcessingOptions />

                    <div className="action-buttons">
                      <button
                        onClick={() => void handleAnalyze()}
                        disabled={isProcessing}
                        className="analyze-btn"
                      >
                        {isProcessing
                          ? 'Processing...'
                          : filePaths.length === 1
                            ? 'Analyse Document'
                            : `Analyse ${filePaths.length} Documents`}
                      </button>

                      <button
                        onClick={handleReset}
                        disabled={isProcessing}
                        className="reset-btn"
                      >
                        Reset
                      </button>
                    </div>
                  </>
                )}
              </section>

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
                            {getFileName(filePaths[i] ?? r.fileName)} ({i + 1}/{results.length})
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
                  <button
                    className="export-btn export-pdf"
                    onClick={() => void downloadPdfReport(results)}
                  >
                    Export PDF
                  </button>
                  <button
                    className="export-btn export-csv"
                    onClick={() => downloadCsvReport(results)}
                  >
                    Export CSV
                  </button>
                  <button onClick={handleReset} className="new-analysis-btn">
                    New Analysis
                  </button>
                </div>
              </div>

              {error && (
                <div className="error-message">
                  <span>&#9888; {error}</span>
                  <button onClick={() => setError(null)} className="dismiss-btn">
                    &#10005;
                  </button>
                </div>
              )}

              {currentResult && <ResultsDashboard results={currentResult} />}
            </>
          )}
        </div>
      </main>

      {isProcessing && progress && (
        <ProcessingProgress
          progress={progress}
          batchIndex={batchIndex}
          batchTotal={batchTotal}
          currentFileName={getFileName(filePaths[batchIndex] ?? '')}
          onCancel={handleCancel}
        />
      )}

      <UpdateNotification />
    </div>
  );
}
