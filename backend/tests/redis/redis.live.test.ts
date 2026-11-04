/**
 * LIVE tests against the Redis at REDIS_URL (e.g. `docker compose up -d redis`).
 * Run with: npm run test:redis. Uses unique keys and deletes them afterwards.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisRateLimitStore } from '../../src/shared/http/rateLimit.js';
import { RedisNamespace, redisKey } from '../../src/shared/infrastructure/redis/keys.js';
import {
  checkRedis,
  connectRedis,
  disconnectRedis,
  getRedis,
} from '../../src/shared/infrastructure/redis/redis.js';
import { RedisTtlStore } from '../../src/shared/infrastructure/redis/ttlStore.js';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is not set; live Redis tests cannot run.');
}

const tag = `test-${randomUUID().slice(0, 8)}`;
const createdKeys: string[] = [];

beforeAll(async () => {
  connectRedis();
  const deadline = Date.now() + 10_000;
  while (!getRedis().isReady) {
    if (Date.now() > deadline) throw new Error('Redis did not become ready within 10 s');
    await new Promise((r) => setTimeout(r, 100));
  }
});

afterAll(async () => {
  if (createdKeys.length > 0 && getRedis().isReady) await getRedis().del(createdKeys);
  await disconnectRedis();
});

describe('live Redis', () => {
  it('is reachable (readiness probe reports up)', async () => {
    expect(await checkRedis()).toMatchObject({ status: 'up' });
  });

  it('stores temporary JSON with a TTL and deletes it', async () => {
    const store = new RedisTtlStore<{ n: number }>(getRedis(), RedisNamespace.Session, 30);
    createdKeys.push(store.key(tag));

    await store.set(tag, { n: 1 });
    expect(await store.get(tag)).toEqual({ n: 1 });
    const ttl = await getRedis().ttl(store.key(tag));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);

    expect(await store.touch(tag, 60)).toBe(true);
    expect(await getRedis().ttl(store.key(tag))).toBeGreaterThan(30);

    await store.delete(tag);
    expect(await store.get(tag)).toBeNull();
  });

  it('counts rate-limit hits in a window that expires', async () => {
    const store = new RedisRateLimitStore(getRedis());
    const key = redisKey(RedisNamespace.RateLimit, 'live-test', tag);
    createdKeys.push(key);

    const first = await store.hit(key, 30);
    const second = await store.hit(key, 30);
    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(second.resetSeconds).toBeGreaterThan(0);
    expect(second.resetSeconds).toBeLessThanOrEqual(30);
  });

  it('never stores keys outside the application prefix', async () => {
    for (const key of createdKeys)
      expect(key.startsWith(process.env.REDIS_KEY_PREFIX ?? 'educomply:')).toBe(true);
  });
});
