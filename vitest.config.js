import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // environment: 'jsdom', // Do not enforce globally, rely on per-file @vitest-environment
    setupFiles: ['./tests/setup.js'],
  },
});
