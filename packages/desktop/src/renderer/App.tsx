import { useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { ProcessingOptions } from './components/ProcessingOptions';
import { ProcessingProgress } from './components/ProcessingProgress';
import { ResultsDashboard } from './components/ResultsDashboard';
import { useStore } from './store';
import './App.css';

export function App() {
  const {
    filePaths,
    options,
    isProcessing,
    progress,
    results,
    error,
    setProcessing,
    setProgress,
    setResults,
    setError,
    reset,
  } = useStore();

  // Register progress listener once on mount
  useEffect(() => {
    window.citeSight.onProgress((update) => {
      setProgress(update);
    });
  }, [setProgress]);

  const handleAnalyze = async () => {
    if (filePaths.length === 0) {
      setError('Please select at least one file to analyze.');
      return;
    }

    setProcessing(true);

    try {
      // Analyze the first file; multi-file support can batch here
      const result = await window.citeSight.analyzeFile(filePaths[0], options);
      setResults(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during analysis.');
    }
  };

  const handleReset = () => {
    reset();
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>CiteSight</h1>
          <p>Academic Integrity &amp; Citation Checker</p>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          {!results ? (
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
                        {isProcessing ? 'Processing...' : 'Analyze Document'}
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
                <h2>Analysis Results: {results.fileName}</h2>
                <button onClick={handleReset} className="new-analysis-btn">
                  New Analysis
                </button>
              </div>

              {error && (
                <div className="error-message">
                  <span>&#9888; {error}</span>
                  <button onClick={() => setError(null)} className="dismiss-btn">
                    &#10005;
                  </button>
                </div>
              )}

              <ResultsDashboard results={results} />
            </>
          )}
        </div>
      </main>

      {isProcessing && progress && (
        <ProcessingProgress progress={progress} />
      )}
    </div>
  );
}
