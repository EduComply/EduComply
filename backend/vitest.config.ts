import { defineConfig } from 'vitest/config';

// Unit and HTTP tests: no database required.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/db/**'],
  },
});
