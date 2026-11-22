import { defineConfig } from 'vitest/config';

// End-to-end tests of the kiosk and the ticket page in Chromium, against the API on a real
// PostgreSQL (the API's test server). Build the web application first.
export default defineConfig({
  test: {
    include: ['e2e/**/*.test.ts'],
    globalSetup: ['../api/test/postgres.ts'],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
