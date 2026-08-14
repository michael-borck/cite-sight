import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // macOS writes AppleDouble companions (._foo.test.ts) on non-native
    // filesystems (exFAT external drives); they are resource forks, not code.
    exclude: ['**/._*'],
    testTimeout: 30_000,
  },
});
