import { defineConfig } from 'vitest/config';

// End-to-end tests of the built page in Chromium (Playwright). Build the Studio and the CLI first.
export default defineConfig({
  test: {
    include: ['e2e/**/*.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
