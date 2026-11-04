import { defineConfig } from 'vitest/config';

// Database integration tests against the configured DATABASE_URL.
// Every test runs inside a transaction that is rolled back, so no data persists.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
