import type { Request, RequestHandler } from 'express';
import { logger } from '../logger.js';
import { errorCode } from '../infrastructure/dependency.js';
import { RedisNamespace, redisKey } from '../infrastructure/redis/keys.js';
import { Errors } from './problem.js';

export interface RateLimitHit {
  /** Requests counted in the current window, including this one. */
  count: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
}

/** Storage behind the limiter: Redis in the app, in-memory in tests. */
export interface RateLimitStore {
  hit(key: string, windowSeconds: number): Promise<RateLimitHit>;
}

/** Chainable MULTI surface the store needs (satisfied by the node-redis client). */
export interface RateLimitMulti {
  incr(key: string): RateLimitMulti;
  expire(key: string, seconds: number, mode?: 'NX'): RateLimitMulti;
  ttl(key: string): RateLimitMulti;
  exec(): Promise<unknown>;
}

export interface RateLimitRedis {
  multi(): RateLimitMulti;
}

/**
 * Fixed-window counter: INCR + EXPIRE NX + TTL in one MULTI, so the window starts
 * with the first request and every counter expires (requires Redis 7+).
 */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: RateLimitRedis) {}

  async hit(key: string, windowSeconds: number): Promise<RateLimitHit> {
    const replies = (await this.redis
      .multi()
      .incr(key)
      .expire(key, windowSeconds, 'NX')
      .ttl(key)
      .exec()) as unknown[];
    const [count, , ttl] = replies;
    const ttlSeconds = Number(ttl);
    return {
      count: Number(count),
      resetSeconds: ttlSeconds > 0 ? ttlSeconds : windowSeconds,
    };
  }
}

/** In-process store for tests and single-instance fallback. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async hit(key: string, windowSeconds: number): Promise<RateLimitHit> {
    const now = this.now();
    let entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowSeconds * 1000 };
      this.windows.set(key, entry);
    }
    entry.count += 1;
    return { count: entry.count, resetSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
}

export interface RateLimitOptions {
  /** Policy name, part of the Redis key (e.g. "auth"). */
  name: string;
  limit: number;
  windowSeconds: number;
  store: RateLimitStore;
  /** Identity to count against; defaults to client IP. Return undefined to skip limiting. */
  key?: (req: Request) => string | undefined;
  /**
   * If the store is unavailable: true = allow the request (availability first),
   * false = reject with 503 (use for security-sensitive routes). Default true.
   */
  failOpen?: boolean;
}

/** Limits from the Initial API Design §4 ("Rate limits, Redis-backed"). */
export const RateLimitPolicies = {
  auth: { name: 'auth', limit: 20, windowSeconds: 60 },
  publicVerify: { name: 'verify', limit: 30, windowSeconds: 60 },
  default: { name: 'default', limit: 300, windowSeconds: 60 },
} as const;

/**
 * Rate-limiting middleware. Sets RateLimit-Limit / -Remaining / -Reset headers and
 * responds 429 RATE_LIMITED with Retry-After when the limit is exceeded.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const { name, limit, windowSeconds, store, failOpen = true } = options;
  const identify = options.key ?? ((req: Request) => req.ip);

  return async (req, res, next) => {
    const identity = identify(req);
    if (!identity) {
      next();
      return;
    }
    let hit: RateLimitHit;
    try {
      hit = await store.hit(redisKey(RedisNamespace.RateLimit, name, identity), windowSeconds);
    } catch (err) {
      logger.warn({ policy: name, code: errorCode(err), failOpen }, 'Rate limit store unavailable');
      if (failOpen) next();
      else next(Errors.serviceUnavailable());
      return;
    }

    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - hit.count)));
    res.setHeader('RateLimit-Reset', String(hit.resetSeconds));

    if (hit.count > limit) {
      next(Errors.rateLimited(hit.resetSeconds));
      return;
    }
    next();
  };
}
