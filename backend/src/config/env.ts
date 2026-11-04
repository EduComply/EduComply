import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Loads the repository-root `.env` (if present) and validates configuration once at startup.
 * Values are never logged; only the names of invalid variables are reported.
 */
const rootEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnvFile) && process.env.NODE_ENV !== 'test') {
  process.loadEnvFile(rootEnvFile);
}

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Declared now, required by later Sprint 1 branches (database, Redis, OIDC).
  DATABASE_URL: optionalString,
  DIRECT_URL: optionalString,
  REDIS_URL: optionalString,
  SESSION_SECRET: optionalString,
  OIDC_ISSUER: optionalString,
  OIDC_CLIENT_ID: optionalString,
  OIDC_CLIENT_SECRET: optionalString,
  OIDC_REDIRECT_URI: optionalString,
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
