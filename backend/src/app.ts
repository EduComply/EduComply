import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { createDefaultModules, type AppModules } from './composition.js';
import { auditRouter } from './modules/audit/presentation/auditRouter.js';
import { createAuthGuards } from './modules/auth/presentation/authGuards.js';
import { authRouter } from './modules/auth/presentation/authRouter.js';
import { usersRouter } from './modules/users/presentation/usersRouter.js';
import { env } from './config/env.js';
import type { ReadinessChecks } from './modules/health/application/getReadiness.js';
import { healthRouter } from './modules/health/presentation/healthRouter.js';
import { corsMiddleware } from './shared/http/cors.js';
import { errorHandler, notFoundHandler } from './shared/http/errorHandler.js';
import { requestLogger } from './shared/http/requestLogger.js';
import { checkDatabase } from './shared/infrastructure/database/prisma.js';
import { checkRedis } from './shared/infrastructure/redis/redis.js';
import { logger } from './shared/logger.js';

export const API_PREFIX = '/api/v1';
export const JSON_BODY_LIMIT = '100kb';
const VERSION = process.env.npm_package_version ?? '0.1.0';

export interface AppOptions {
  /** Readiness probes; replace with fakes in tests. */
  readinessChecks?: ReadinessChecks;
  readinessTimeoutMs?: number;
  /** CORS allow-list; defaults to CORS_ORIGINS / APP_ORIGIN. */
  corsOrigins?: readonly string[];
  /** Auth, user and audit services; defaults to the real PostgreSQL/Redis/OIDC adapters. */
  modules?: AppModules;
}

/**
 * Builds the Express app. Middleware order matters:
 * request id + logging → security headers → CORS → body + cookie parsing → routes → 404 → errors.
 */
export function createApp(options: AppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // one reverse proxy in front (req.ip = client IP)

  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(corsMiddleware(options.corsOrigins ?? env.corsOrigins));
  app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true }));
  app.use(cookieParser()); // unsigned: ec_session is a random 256-bit id, not trusted data

  // ── Module routers ────────────────────────────────────────────────
  app.use(
    API_PREFIX,
    healthRouter({
      version: VERSION,
      checks: options.readinessChecks ?? { database: checkDatabase, redis: checkRedis },
      ...(options.readinessTimeoutMs ? { checkTimeoutMs: options.readinessTimeoutMs } : {}),
    }),
  );

  const modules = options.modules ?? createDefaultModules();
  const guards = createAuthGuards(modules.auth, modules.cookiePolicy, modules.rateLimitStore);
  app.use(
    API_PREFIX,
    authRouter({
      service: modules.auth,
      guards,
      cookiePolicy: modules.cookiePolicy,
      rateLimitStore: modules.rateLimitStore,
      appOrigin: modules.appOrigin,
      redirectUri: modules.redirectUri,
    }),
  );
  app.use(API_PREFIX, usersRouter({ guards, admin: modules.userAdmin }));
  app.use(API_PREFIX, auditRouter({ guards, audit: modules.auditQuery }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
