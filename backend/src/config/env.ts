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

    // Comma-separated browser origins allowed by CORS. Defaults to APP_ORIGIN.
    CORS_ORIGINS: optionalString.refine(
      (v) =>
        v === undefined ||
        v
          .split(',')
          .map((o) => o.trim())
          .every((o) => /^https?:\/\/[^/\s]+\/?$/.test(o)),
      { message: 'must be comma-separated origins like https://host[:port] (no paths)' },
    ),

    // Redis: temporary state only (sessions, rate limits, short-lived tokens).
    REDIS_URL: optionalString.refine((v) => v === undefined || /^rediss?:\/\/[^\s]+$/.test(v), {
      message: 'must be a redis:// or rediss:// URL',
    }),
    REDIS_KEY_PREFIX: z
      .string()
      .regex(/^[a-z0-9_-]+:$/, 'lower-case letters, digits, _ or -, ending with ":"')
      .default('educomply:'),

    // Declared now, required by Task 4 (authentication).
    SESSION_SECRET: optionalString,
    OIDC_ISSUER: optionalString,
    OIDC_CLIENT_ID: optionalString,
    OIDC_CLIENT_SECRET: optionalString,
    OIDC_REDIRECT_URI: optionalString,
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === 'production') {
      for (const key of ['DATABASE_URL', 'REDIS_URL'] as const) {
        if (!cfg[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' });
      }
    }
  })
  .transform((cfg) => ({
    ...cfg,
    /** Parsed CORS allow-list (exact origin match). */
    corsOrigins: (cfg.CORS_ORIGINS ?? cfg.APP_ORIGIN)
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
  }));

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
