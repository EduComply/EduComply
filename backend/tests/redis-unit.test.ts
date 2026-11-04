/**
 * MOCKED tests: Redis infrastructure (keys, TTL store, rate limiting, readiness probe).
 * Uses in-memory fakes of the Redis client — no Redis server needed.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { errorHandler } from '../src/shared/http/errorHandler.js';
import {
  MemoryRateLimitStore,
  rateLimit,
  RedisRateLimitStore,
  type RateLimitMulti,
  type RateLimitStore,
} from '../src/shared/http/rateLimit.js';
import { runCheck } from '../src/shared/infrastructure/dependency.js';
import { RedisNamespace, RedisTtl, redisKey } from '../src/shared/infrastructure/redis/keys.js';
import { checkRedisClient, reconnectDelay } from '../src/shared/infrastructure/redis/redis.js';
import { RedisTtlStore, type TtlStoreClient } from '../src/shared/infrastructure/redis/ttlStore.js';

/** Minimal in-memory Redis fake for the commands the stores use. */
class FakeRedis implements TtlStoreClient {
  data = new Map<string, { value: string; ttl: number }>();
  async get(key: string) {
    return this.data.get(key)?.value ?? null;
  }
  async setEx(key: string, seconds: number, value: string) {
    this.data.set(key, { value, ttl: seconds });
    return 'OK';
  }
  async expire(key: string, seconds: number) {
    const entry = this.data.get(key);
    if (!entry) return 0;
    entry.ttl = seconds;
    return 1;
  }
  async del(key: string) {
    return this.data.delete(key) ? 1 : 0;
  }
}

describe('redis keys', () => {
  it('prefixes and namespaces every key', () => {
    expect(redisKey(RedisNamespace.Session, 'abc')).toBe(`${env.REDIS_KEY_PREFIX}session:abc`);
    expect(redisKey(RedisNamespace.RateLimit, 'auth', '10.0.0.1')).toBe(
      `${env.REDIS_KEY_PREFIX}ratelimit:auth:10.0.0.1`,
    );
  });

  it('encodes parts so values cannot escape their namespace', () => {
    expect(redisKey(RedisNamespace.Session, 'x:ratelimit:y')).toBe(
      `${env.REDIS_KEY_PREFIX}session:x%3Aratelimit%3Ay`,
    );
  });

  it('defines expiry for temporary data (8 h sessions per API design)', () => {
    expect(RedisTtl.session).toBe(28_800);
    expect(RedisTtl.oidcState).toBeGreaterThan(0);
  });
});

describe('RedisTtlStore', () => {
  it('stores JSON with an expiry, refreshes it and deletes it', async () => {
    const fake = new FakeRedis();
    const store = new RedisTtlStore<{ userId: string }>(fake, RedisNamespace.Session, 60);

    await store.set('s1', { userId: 'u1' });
    expect(fake.data.get(store.key('s1'))).toEqual({ value: '{"userId":"u1"}', ttl: 60 });
    expect(await store.get('s1')).toEqual({ userId: 'u1' });

    expect(await store.touch('s1', 120)).toBe(true);
    expect(fake.data.get(store.key('s1'))?.ttl).toBe(120);

    await store.delete('s1');
    expect(await store.get('s1')).toBeNull();
    expect(await store.touch('s1')).toBe(false);
  });

  it('treats corrupt entries as missing', async () => {
    const fake = new FakeRedis();
    const store = new RedisTtlStore<object>(fake, RedisNamespace.Session, 60);
    await fake.setEx(store.key('bad'), 60, '{not json');
    expect(await store.get('bad')).toBeNull();
  });

  it('rejects non-positive TTLs', () => {
    expect(() => new RedisTtlStore(new FakeRedis(), RedisNamespace.Session, 0)).toThrow();
  });
});

describe('RedisRateLimitStore', () => {
  it('increments, sets the window expiry with NX and returns the TTL', async () => {
    const calls: unknown[][] = [];
    const multi: RateLimitMulti = {
      incr: (k) => (calls.push(['incr', k]), multi),
      expire: (k, s, m) => (calls.push(['expire', k, s, m]), multi),
      ttl: (k) => (calls.push(['ttl', k]), multi),
      exec: async () => [3, 0, 42],
    };
    const store = new RedisRateLimitStore({ multi: () => multi });
    expect(await store.hit('k', 60)).toEqual({ count: 3, resetSeconds: 42 });
    expect(calls).toEqual([
      ['incr', 'k'],
      ['expire', 'k', 60, 'NX'],
      ['ttl', 'k'],
    ]);
  });
});

describe('rateLimit middleware', () => {
  const build = (store: RateLimitStore, failOpen?: boolean) => {
    const app = express();
    app.get(
      '/limited',
      rateLimit({
        name: 'test',
        limit: 2,
        windowSeconds: 60,
        store,
        ...(failOpen === undefined ? {} : { failOpen }),
      }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    app.use(errorHandler);
    return app;
  };

  it('allows requests up to the limit, then responds 429 RATE_LIMITED with Retry-After', async () => {
    const app = build(new MemoryRateLimitStore());
    const first = await request(app).get('/limited');
    expect(first.status).toBe(200);
    expect(first.headers['ratelimit-limit']).toBe('2');
    expect(first.headers['ratelimit-remaining']).toBe('1');
    await request(app).get('/limited');

    const third = await request(app).get('/limited');
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('RATE_LIMITED');
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    expect(third.headers['ratelimit-remaining']).toBe('0');
  });

  it('resets after the window', async () => {
    let now = 0;
    const store = new MemoryRateLimitStore(() => now);
    expect((await store.hit('k', 1)).count).toBe(1);
    expect((await store.hit('k', 1)).count).toBe(2);
    now = 1_000;
    expect((await store.hit('k', 1)).count).toBe(1);
  });

  const broken: RateLimitStore = { hit: () => Promise.reject(new Error('ECONNREFUSED')) };

  it('fails open by default when Redis is unavailable', async () => {
    const res = await request(build(broken)).get('/limited');
    expect(res.status).toBe(200);
  });

  it('fails closed with 503 when configured for sensitive routes', async () => {
    const res = await request(build(broken, false)).get('/limited');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
  });
});

describe('Redis readiness probe', () => {
  it('reports up with latency when PING succeeds', async () => {
    const result = await checkRedisClient({ isReady: true, ping: async () => 'PONG' });
    expect(result.status).toBe('up');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports down without sending commands while disconnected', async () => {
    const ping = vi.fn();
    expect(await checkRedisClient({ isReady: false, ping })).toEqual({
      status: 'down',
      code: 'NOT_CONNECTED',
    });
    expect(ping).not.toHaveBeenCalled();
  });

  it('reports the error code when PING fails', async () => {
    const err = Object.assign(new Error('redis://:secret@host refused'), { code: 'ECONNRESET' });
    const result = await checkRedisClient({ isReady: true, ping: () => Promise.reject(err) });
    expect(result).toMatchObject({ status: 'down', code: 'ECONNRESET' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('runCheck converts a hang into TIMEOUT', async () => {
    const result = await runCheck(() => new Promise(() => {}), 20);
    expect(result).toMatchObject({ status: 'down', code: 'TIMEOUT' });
  });

  it('reconnects with capped exponential backoff', () => {
    expect(reconnectDelay(0)).toBeGreaterThanOrEqual(100);
    expect(reconnectDelay(0)).toBeLessThan(400);
    expect(reconnectDelay(20)).toBeLessThanOrEqual(5_250);
  });
});
