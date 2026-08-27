import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Everything — JS, CSS, the pdfjs worker source — is inlined into one
// index.html so the result can be downloaded, double-clicked, and run from
// file:// with no server and no install. The version is baked in at build
// time; the in-app "check for updates" button compares it against the latest
// GitHub release.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
