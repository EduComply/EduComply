import { defineConfig } from 'vitest/config';

// LIVE OIDC tests against local Keycloak + Redis. Start them first:
//   npm run redis:up && npm run keycloak:up
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/keycloak/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
