import { defineConfig } from 'vitest/config';

// Development-environment tooling tests. Mocks and private ephemeral ports only:
// they never touch ports 5173/3000/6379/8080 or other applications.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tools/dev/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
