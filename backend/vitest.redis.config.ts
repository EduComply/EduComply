import { defineConfig } from 'vitest/config';

// LIVE Redis tests against REDIS_URL. Start Redis first: docker compose up -d redis
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/redis/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
  },
});
