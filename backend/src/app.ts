import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './shared/logger.js';
import { errorHandler, notFoundHandler } from './shared/http/errorHandler.js';
import { healthRouter } from './modules/health/presentation/healthRouter.js';

export const API_PREFIX = '/api/v1';
const VERSION = process.env.npm_package_version ?? '0.1.0';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '100kb' }));

  // ── Module routers ────────────────────────────────────────────────
  app.use(`${API_PREFIX}/health`, healthRouter(VERSION));
  // Sprint 1 next: auth, users, audit (see src/modules/README.md)

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
