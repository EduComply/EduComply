import { redisKey, type RedisNamespaceName } from './keys.js';

/** The Redis commands a TTL store needs (satisfied by the node-redis client). */
export interface TtlStoreClient {
  get(key: string): Promise<unknown>;
  setEx(key: string, seconds: number, value: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/**
 * Namespaced JSON key-value store where every entry expires. Foundation for
 * Redis-backed sessions and OIDC login state in Task 4. Not for permanent data —
 * compliance records live in PostgreSQL.
 */
export class RedisTtlStore<T> {
  constructor(
    private readonly client: TtlStoreClient,
    private readonly namespace: RedisNamespaceName,
    private readonly defaultTtlSeconds: number,
  ) {
    if (!Number.isInteger(defaultTtlSeconds) || defaultTtlSeconds <= 0) {
      throw new Error('defaultTtlSeconds must be a positive integer');
    }
  }

  key(id: string): string {
    return redisKey(this.namespace, id);
  }

  async get(id: string): Promise<T | null> {
    const raw = await this.client.get(this.key(id));
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null; // corrupt entry: treat as missing
    }
  }

  async set(id: string, value: T, ttlSeconds = this.defaultTtlSeconds): Promise<void> {
    await this.client.setEx(this.key(id), ttlSeconds, JSON.stringify(value));
  }

  /** Extends the expiry (sliding idle timeout). Returns false if the entry no longer exists. */
  async touch(id: string, ttlSeconds = this.defaultTtlSeconds): Promise<boolean> {
    const result = await this.client.expire(this.key(id), ttlSeconds);
    return result === 1 || result === true;
  }

  async delete(id: string): Promise<void> {
    await this.client.del(this.key(id));
  }
}
