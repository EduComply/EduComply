import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './shared/logger.js';
import { checkDatabase, disconnectPrisma } from './shared/infrastructure/database/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`EduComply API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  // Non-blocking startup probe: report status/code only, never connection details.
  void checkDatabase().then((db) => {
    if (db.status === 'up') logger.info({ latencyMs: db.latencyMs }, 'Database connected');
    else
      logger.warn({ database: db }, 'Database not available; /api/v1/health/ready will report 503');
  });
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  server.close(async () => {
    try {
      await disconnectPrisma();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error while closing database connections');
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
