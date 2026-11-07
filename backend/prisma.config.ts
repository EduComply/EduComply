import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

// Prisma CLI does not load .env itself; use the single repository-root .env.
// Existing process variables (e.g. CI secrets) always take precedence.
const rootEnvFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // CLI commands (migrate, studio) use the DIRECT (non-pooled) Neon connection.
    // The running app uses the pooled DATABASE_URL via the pg driver adapter.
    // Empty fallback lets `prisma generate` run without credentials (e.g. in CI).
    url: process.env.DIRECT_URL ?? '',
  },
});
