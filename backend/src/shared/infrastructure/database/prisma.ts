import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../../../generated/prisma/client.js';
import { env } from '../../../config/env.js';
import { DatabaseNotConfiguredError } from './errors.js';
import { errorCode, type DependencyStatus } from '../dependency.js';

/** A Prisma client or an interactive-transaction client; repositories accept either. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

let client: PrismaClient | undefined;

/**
 * Lazily creates the single application-wide Prisma client.
 * Runtime queries use the pooled Neon connection (DATABASE_URL) through the pg driver adapter.
 */
export function getPrisma(): PrismaClient {
  if (!client) {
    if (!env.DATABASE_URL) throw new DatabaseNotConfiguredError();
    const adapter = new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    client = new PrismaClient({
      adapter,
      // Query text and parameters are never logged.
      // Silent in tests: several tests deliberately trigger constraint errors.
      log:
        env.NODE_ENV === 'test'
          ? []
          : env.NODE_ENV === 'development'
            ? ['warn', 'error']
            : ['error'],
      errorFormat: 'minimal',
    });
  }
  return client;
}

/** Closes the pool; safe to call when no client was created. */
export async function disconnectPrisma(): Promise<void> {
  if (!client) return;
  const current = client;
  client = undefined;
  await current.$disconnect();
}

/** Lightweight connectivity probe used by the readiness endpoint and tooling. */
export async function checkDatabase(): Promise<DependencyStatus> {
  if (!env.DATABASE_URL) return { status: 'not_configured' };
  const started = Date.now();
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return { status: 'up', latencyMs: Date.now() - started };
  } catch (err) {
    return { status: 'down', latencyMs: Date.now() - started, code: errorCode(err) };
  }
}
