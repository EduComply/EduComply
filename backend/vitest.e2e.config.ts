import { defineConfig } from 'vitest/config';

// LIVE full-stack tests: Neon (via DATABASE_TRANSPORT), Redis and Keycloak must be reachable.
//   npm run dev:deps && npm run test:e2e
// All database writes are rolled back; the temporary Keycloak user is deleted.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
