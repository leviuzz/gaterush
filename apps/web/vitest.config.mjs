import { defineConfig } from 'vitest/config';

// Unit tests of the web application's own logic (the stream reader); the screens are tested in
// Chromium by vitest.e2e.config.mjs.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
