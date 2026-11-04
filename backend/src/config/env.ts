import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Loads the repository-root `.env` (if present) and validates configuration once at startup.
 * Variables already set in the process (CI secrets, test overrides) are never overwritten.
 * Values are never logged; only the names of invalid variables are reported.
 */
const rootEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

/** postgres:// or postgresql:// URL; the value itself never appears in error output. */
const optionalPostgresUrl = optionalString.refine(
  (v) => v === undefined || /^postgres(ql)?:\/\/[^\s]+$/.test(v),
  { message: 'must be a postgresql:// connection string' },
);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_ORIGIN: z.string().url().default('http://localhost:5173'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // Neon PostgreSQL: pooled URL for the app, direct URL for Prisma migrations.
    DATABASE_URL: optionalPostgresUrl,
    DIRECT_URL: optionalPostgresUrl,

    // Declared now, required by later Sprint 1 tasks (Redis, OIDC).
    REDIS_URL: optionalString,
    SESSION_SECRET: optionalString,
    OIDC_ISSUER: optionalString,
    OIDC_CLIENT_ID: optionalString,
    OIDC_CLIENT_SECRET: optionalString,
    OIDC_REDIRECT_URI: optionalString,
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === 'production' && !cfg.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'required in production' });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => i.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${names.join(', ')}`);
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);
