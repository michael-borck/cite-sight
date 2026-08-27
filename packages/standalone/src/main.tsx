import { createRoot } from 'react-dom/client';
import workerSource from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?raw';
import { analyzeDocument, setPdfWorkerSrc } from '@michaelborck/cite-sight-core/browser';
import { App } from './App';
import './index.css';

// The single-file build can't emit the pdfjs worker as a separate asset, so
// its source ships as a string in the bundle and pdfjs is pointed at a blob
// URL. If a browser refuses to spawn a module worker from a blob (older
// Safari), pdfjs falls back to its main-thread "fake worker" — slower, same
// results.
setPdfWorkerSrc(URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' })));

// Console/testing handle: lets a power user (or an automated smoke test of
// this exact artifact) run the pipeline from DevTools without the UI.
window.citeSightStandalone = { analyzeDocument, version: __APP_VERSION__ };

createRoot(document.getElementById('root')!).render(<App />);
