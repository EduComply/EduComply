import { defineConfig } from 'vitest/config';

// Unit and HTTP tests (mocked): no PostgreSQL or Redis required.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/db/**', 'tests/redis/**', 'tests/keycloak/**'],
  },
});
