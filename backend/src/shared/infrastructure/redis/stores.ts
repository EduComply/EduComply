import { RedisRateLimitStore, type RateLimitRedis } from '../../http/rateLimit.js';
import { getRedis } from './redis.js';
import { RedisTtlStore, type TtlStoreClient } from './ttlStore.js';
import type { RedisNamespaceName } from './keys.js';

/**
 * Factories that bind the shared Redis client to the store interfaces. The client is
 * resolved per operation, so an unconfigured or unavailable Redis surfaces as an error
 * on use (handled as 503) rather than at startup. The typed getters compile only if
 * node-redis satisfies the interfaces.
 */
export function createRedisRateLimitStore(): RedisRateLimitStore {
  const client = (): RateLimitRedis => getRedis();
  return new RedisRateLimitStore(client);
}

export function createRedisTtlStore<T>(
  namespace: RedisNamespaceName,
  ttlSeconds: number,
): RedisTtlStore<T> {
  const client = (): TtlStoreClient => getRedis();
  return new RedisTtlStore<T>(client, namespace, ttlSeconds);
}
