import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // AppleDouble companions (._foo) on exFAT external drives are resource forks, not tests.
    exclude: ['**/._*'],
    testTimeout: 30_000,
  },
});
