/// <reference types="vite/client" />

// Baked in by vite.config.ts at build time (from package.json).
declare const __APP_VERSION__: string;

// Debug/testing handle installed by main.tsx.
interface Window {
  citeSightStandalone: {
    analyzeDocument: typeof import('@michaelborck/cite-sight-core/browser').analyzeDocument;
    version: string;
  };
}
