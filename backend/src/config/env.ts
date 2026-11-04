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

const optionalUrl = optionalString.refine((v) => v === undefined || URL.canParse(v), {
  message: 'must be an absolute URL',
});

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

    // OpenID Connect (backend-for-frontend; Keycloak in development).
    OIDC_ISSUER: optionalUrl,
    OIDC_CLIENT_ID: optionalString,
    OIDC_CLIENT_SECRET: optionalString,
    /** Must exactly match a redirect URI registered at the identity provider. */
    OIDC_REDIRECT_URI: optionalUrl,
    /** Where the IdP returns the browser after single logout. Defaults to APP_ORIGIN + "/". */
    OIDC_POST_LOGOUT_REDIRECT_URI: optionalUrl,
    OIDC_SCOPES: z.string().trim().default('openid email profile'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === 'production') {
      const required = [
        'DATABASE_URL',
        'REDIS_URL',
        'OIDC_ISSUER',
        'OIDC_CLIENT_ID',
        'OIDC_CLIENT_SECRET',
        'OIDC_REDIRECT_URI',
      ] as const;
      for (const key of required) {
        if (!cfg[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' });
      }
      // Session cookies are Secure in production, so every browser-facing URL must be HTTPS.
      for (const key of ['APP_ORIGIN', 'OIDC_ISSUER', 'OIDC_REDIRECT_URI'] as const) {
        const value = cfg[key];
        if (value && !value.startsWith('https://'))
          ctx.addIssue({ code: 'custom', path: [key], message: 'must use https in production' });
      }
    }
    const oidcKeys = [
      'OIDC_ISSUER',
      'OIDC_CLIENT_ID',
      'OIDC_CLIENT_SECRET',
      'OIDC_REDIRECT_URI',
    ] as const;
    const setCount = oidcKeys.filter((k) => cfg[k]).length;
    if (setCount > 0 && setCount < oidcKeys.length) {
      for (const key of oidcKeys) {
        if (!cfg[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'required when OIDC is configured',
          });
      }
    }
  })
  .transform((cfg) => ({
    ...cfg,
    /** True when every OIDC setting is present. */
    oidcConfigured: Boolean(
      cfg.OIDC_ISSUER && cfg.OIDC_CLIENT_ID && cfg.OIDC_CLIENT_SECRET && cfg.OIDC_REDIRECT_URI,
    ),
    /** Cookies get the Secure flag whenever the portal is served over HTTPS (always in production). */
    cookieSecure: cfg.NODE_ENV === 'production' || cfg.APP_ORIGIN.startsWith('https://'),
    postLogoutRedirectUri:
      cfg.OIDC_POST_LOGOUT_REDIRECT_URI ?? `${cfg.APP_ORIGIN.replace(/\/$/, '')}/`,
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
