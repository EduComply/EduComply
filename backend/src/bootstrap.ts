import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { createApp } from './app.js';
import { checkDatabase, disconnectPrisma } from './shared/infrastructure/database/prisma.js';
import { connectRedis, disconnectRedis } from './shared/infrastructure/redis/redis.js';
import { logger } from './shared/logger.js';

/** External resources opened at startup and closed at shutdown (replaceable in tests). */
export interface Lifecycle {
  connect(): void | Promise<void>;
  probeDatabase(): Promise<{ status: string }>;
  disconnect(): Promise<void>;
}

export const defaultLifecycle: Lifecycle = {
  connect: () => connectRedis(),
  probeDatabase: () => checkDatabase(),
  async disconnect() {
    const results = await Promise.allSettled([disconnectPrisma(), disconnectRedis()]);
    for (const r of results) {
      if (r.status === 'rejected')
        logger.error({ err: r.reason }, 'Error while closing a connection');
    }
  },
};

export interface RunningServer {
  server: Server;
  port: number;
  /** Stops accepting connections, drains in-flight requests, then closes PostgreSQL and Redis. */
  shutdown(signal?: string): Promise<void>;
}

export interface StartOptions {
  port: number;
  app?: Express;
  lifecycle?: Lifecycle;
  /** Time allowed for in-flight requests before connections are force-closed. */
  drainTimeoutMs?: number;
}

export async function startServer(options: StartOptions): Promise<RunningServer> {
  const lifecycle = options.lifecycle ?? defaultLifecycle;
  const drainTimeoutMs = options.drainTimeoutMs ?? 10_000;
  const app = options.app ?? createApp();

  await lifecycle.connect();

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', () => {
      server.off('error', reject);
      resolve();
    });
    server.listen(options.port);
  });
  const port = (server.address() as AddressInfo).port;
  logger.info(`EduComply API listening on http://localhost:${port}`);

  // Non-blocking probe: report status only, never connection details.
  void lifecycle.probeDatabase().then((db) => {
    if (db.status === 'up') logger.info('Database reachable');
    else logger.warn({ database: db }, 'Database not available; /api/v1/ready will report 503');
  });

  let stopping: Promise<void> | undefined;
  const shutdown = (signal = 'shutdown'): Promise<void> => {
    stopping ??= (async () => {
      logger.info(`${signal} received, shutting down`);
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeIdleConnections();
      const force = setTimeout(() => server.closeAllConnections(), drainTimeoutMs);
      force.unref();
      await closed;
      clearTimeout(force);
      await lifecycle.disconnect();
      logger.info('Shutdown complete');
    })();
    return stopping;
  };

  return { server, port, shutdown };
}
