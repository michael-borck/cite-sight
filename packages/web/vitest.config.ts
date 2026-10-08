import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  // Mirrors vite.config.ts so components reading the build-time constant can be
  // rendered in tests.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: { include: ['test/**/*.test.{ts,tsx}'], exclude: ['**/._*'] },
});