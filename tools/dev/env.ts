import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { ENV_FILE, REPO_ROOT } from './config.js';
import type { CheckResult } from './deps.js';

/** Keys the development stack needs. Values are never printed. */
export const REQUIRED_KEYS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'REDIS_URL',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
  'KEYCLOAK_ADMIN_USERNAME',
  'KEYCLOAK_ADMIN_PASSWORD',
] as const;

export function loadEnv(file = ENV_FILE): boolean {
  if (!existsSync(file)) return false;
  process.loadEnvFile(file);
  return true;
}

export function missingKeys(
  env: NodeJS.ProcessEnv,
  keys: readonly string[] = REQUIRED_KEYS,
): string[] {
  return keys.filter((k) => !env[k]?.trim());
}

/**
 * Validates presence of required keys and then runs the backend's own Zod validation
 * (single source of truth). Both report variable NAMES only.
 */
export async function checkEnv(env: NodeJS.ProcessEnv = process.env): Promise<CheckResult> {
  const missing = missingKeys(env);
  if (missing.length > 0) {
    return {
      name: 'Environment',
      status: 'fail',
      detail: `missing in .env: ${missing.join(', ')}`,
      fix: 'Copy .env.example to .env, fill DATABASE_URL/DIRECT_URL from Neon, then run: npm run auth:init-env',
    };
  }
  try {
    const mod = (await import(
      pathToFileURL(join(REPO_ROOT, 'backend', 'src', 'config', 'env.ts')).href
    )) as { parseEnv: (e: NodeJS.ProcessEnv) => unknown };
    mod.parseEnv(env);
  } catch (err) {
    return {
      name: 'Environment',
      status: 'fail',
      detail: (err as Error).message, // "Invalid environment configuration: NAME, NAME"
      fix: 'Fix the named variables in .env (see .env.example).',
    };
  }
  const sslmode = (() => {
    try {
      return new URL(env.DATABASE_URL!).searchParams.get('sslmode');
    } catch {
      return null;
    }
  })();
  if (sslmode !== 'require' && sslmode !== 'verify-full' && sslmode !== 'verify-ca') {
    return {
      name: 'Environment',
      status: 'warn',
      detail: 'DATABASE_URL has no sslmode=require/verify-full',
      fix: 'Neon requires TLS: keep sslmode=require (pg verifies certificates) or use sslmode=verify-full.',
    };
  }
  return {
    name: 'Environment',
    status: 'ok',
    detail: `${REQUIRED_KEYS.length} required variables present and valid`,
  };
}
