import { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { ProcessingOptions } from './components/ProcessingOptions';
import { ProcessingProgress } from './components/ProcessingProgress';
import { ResultsTabs } from './components/ResultsTabs';
import { useStore } from './store';
import { apiService } from './services/api';
import './App.css';

function App() {
  const {
    files,
    options,
    isProcessing,
    processingProgress,
    processingMessage,
    results,
    error,
    setProcessing,
    setResults,
    setError,
    clearFiles,
  } = useStore();

  const [cancelController, setCancelController] = useState<AbortController | null>(null);

  const handleAnalyze = async () => {
    if (files.length === 0) {
      setError('Please select at least one file to analyze');
      return;
    }

    const controller = new AbortController();
    setCancelController(controller);

    try {
      setProcessing(true, 0, 'Starting analysis...');

      const fileObjects = files.map(f => f.file);
      const analysisResults = await apiService.analyzeDocuments(
        fileObjects,
        options,
        (progress, message) => {
          setProcessing(true, progress, message);
        }
      );

      setResults(analysisResults);
      setProcessing(false, 100, 'Analysis complete!');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during analysis');
      }
    } finally {
      setCancelController(null);
    }
  };

  const handleCancel = () => {
    if (cancelController) {
      cancelController.abort();
      setCancelController(null);
      setProcessing(false);
      setError('Analysis cancelled');
    }
  };

  const handleReset = () => {
    clearFiles();
    setError(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🔍 CiteSight</h1>
          <p>Academic Document Analyzer</p>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          {!results ? (
            <>
              <section className="upload-section">
                <FileUpload />
                
                {files.length > 0 && (
                  <>
                    <ProcessingOptions />
                    
                    <div className="action-buttons">
                      <button 
                        onClick={handleAnalyze}
                        disabled={isProcessing}
                        className="analyze-btn"
                      >
                        {isProcessing ? 'Processing...' : 'Analyze Documents'}
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
                  <span className="error-icon">⚠️</span>
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="dismiss-btn">✕</button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="results-header">
                <h2>Analysis Results</h2>
                <button onClick={handleReset} className="new-analysis-btn">
                  New Analysis
                </button>
              </div>
              
              <ResultsTabs />
            </>
          )}

          {isProcessing && (
            <ProcessingProgress
              progress={processingProgress}
              message={processingMessage}
              onCancel={handleCancel}
            />
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>© 2024 CiteSight | Privacy-First Document Analysis</p>
        <p className="footer-note">All processing is done in memory. No data is stored.</p>
      </footer>
    </div>
  );
}

export default App;
