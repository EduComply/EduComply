import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../../../generated/prisma/client.js';
import { env } from '../../../config/env.js';
import { DatabaseNotConfiguredError, databaseErrorCode } from './errors.js';
import { withVerifiedTls } from './sslmode.js';
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
    const adapter = createAdapter(env.DATABASE_URL);
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
      // Prisma's default maxWait (2 s) is too short for a Neon compute waking from suspend
      // and caused "Unable to start a transaction in the given time". Both stay bounded.
      transactionOptions: { maxWait: 15_000, timeout: 20_000 },
    });
  }
  return client;
}

/**
 * Bounded pool settings shared by both transports, so a blocked or sleeping Neon endpoint
 * fails fast instead of hanging. Certificates are always verified.
 */
const POOL = {
  max: 10,
  connectionTimeoutMillis: 15_000, // new connection (DNS + TCP/WebSocket + TLS + auth)
  idleTimeoutMillis: 30_000,
  query_timeout: 30_000, // client-side cap per query
} as const;

export function createAdapter(
  url: string,
  transport: 'tcp' | 'websocket' = env.DATABASE_TRANSPORT,
): PrismaPg | PrismaNeon {
  if (transport === 'websocket') {
    // Neon serverless driver: PostgreSQL protocol tunnelled through wss://<host>/v2 on 443.
    // TLS is provided (and the certificate verified) by Node's built-in WebSocket client;
    // the driver's defaults (useSecureWebSocket=true) are kept. Supports interactive
    // transactions, unlike Neon's HTTP mode.
    return new PrismaNeon({ connectionString: url, ...POOL });
  }
  // sslmode made explicit for pg (see sslmode.ts); keep-alive detects dropped connections.
  return new PrismaPg({ connectionString: withVerifiedTls(url), ...POOL, keepAlive: true });
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
    return {
      status: 'down',
      latencyMs: Date.now() - started,
      code: databaseErrorCode(err) ?? errorCode(err),
    };
  }
}
