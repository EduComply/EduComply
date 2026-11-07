import { createClient } from 'redis';
import { env } from '../../../config/env.js';
import { logger } from '../../logger.js';
import { errorCode, type DependencyStatus } from '../dependency.js';

export type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | undefined;
let lastErrorCode: string | undefined;

/** Exponential backoff with jitter, capped at 5 s. Never gives up: Redis may come back. */
export function reconnectDelay(retries: number): number {
  const base = Math.min(100 * 2 ** retries, 5_000);
  return base + Math.floor(Math.random() * 250);
}

export function isRedisConfigured(): boolean {
  return Boolean(env.REDIS_URL);
}

/**
 * Shared Redis client (temporary state only: sessions, rate limits, short-lived tokens).
 * Created lazily; call `connectRedis()` at startup. Commands fail fast while disconnected
 * (offline queue disabled) so callers can degrade instead of hanging.
 */
export function getRedis(): RedisClient {
  if (!client) {
    if (!env.REDIS_URL) throw new Error('REDIS_URL is not configured');
    client = createClient({
      url: env.REDIS_URL,
      disableOfflineQueue: true,
      pingInterval: 30_000, // keeps managed-Redis connections from idling out
      socket: { connectTimeout: 5_000, reconnectStrategy: reconnectDelay },
    });
    // Log state changes once, with an error code only — never the URL or credentials.
    client.on('error', (err: unknown) => {
      const code = errorCode(err);
      if (code !== lastErrorCode) logger.warn({ redisCode: code }, 'Redis connection error');
      lastErrorCode = code;
    });
    client.on('ready', () => {
      lastErrorCode = undefined;
      logger.info('Redis connected');
    });
    client.on('reconnecting', () => logger.debug('Redis reconnecting'));
  }
  return client;
}

/**
 * Starts connecting without blocking startup. If Redis is down the client keeps
 * retrying in the background and readiness reports 503 until it is reachable.
 */
export function connectRedis(): void {
  if (!isRedisConfigured()) {
    logger.warn('REDIS_URL is not set; Redis-backed features are unavailable');
    return;
  }
  const redis = getRedis();
  if (redis.isOpen) return;
  redis.connect().catch((err: unknown) => {
    logger.warn({ redisCode: errorCode(err) }, 'Redis initial connection failed; retrying');
  });
}

/** Graceful close (waits for in-flight commands); forces the socket closed if not connected. */
export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  const current = client;
  client = undefined;
  if (current.isReady) await current.close();
  else if (current.isOpen) current.destroy();
}

/** Minimal surface used by the probe, so it can be tested with a fake client. */
export interface PingableClient {
  readonly isReady: boolean;
  ping(): Promise<unknown>;
}

export async function checkRedisClient(redis: PingableClient): Promise<DependencyStatus> {
  if (!redis.isReady) return { status: 'down', code: 'NOT_CONNECTED' };
  const started = Date.now();
  try {
    await redis.ping();
    return { status: 'up', latencyMs: Date.now() - started };
  } catch (err) {
    return { status: 'down', latencyMs: Date.now() - started, code: errorCode(err) };
  }
}

/** Readiness probe for the shared client. */
export async function checkRedis(): Promise<DependencyStatus> {
  if (!isRedisConfigured()) return { status: 'not_configured' };
  return checkRedisClient(getRedis());
}
