import type { TtlStoreClient } from '../../src/shared/infrastructure/redis/ttlStore.js';

/** MOCK: in-memory Redis for TTL stores, with a controllable clock and outage switch. */
export class FakeRedis implements TtlStoreClient {
  data = new Map<string, { value: string; ttl: number; expiresAt: number }>();
  /** When true every command fails like a lost connection. */
  failing = false;

  constructor(public now: () => number = Date.now) {}

  private check(): void {
    if (this.failing) throw Object.assign(new Error('connection lost'), { code: 'ECONNREFUSED' });
  }

  private live(key: string) {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string) {
    this.check();
    return this.live(key)?.value ?? null;
  }

  async getDel(key: string) {
    this.check();
    const value = this.live(key)?.value ?? null;
    this.data.delete(key);
    return value;
  }

  async setEx(key: string, seconds: number, value: string) {
    this.check();
    this.data.set(key, { value, ttl: seconds, expiresAt: this.now() + seconds * 1000 });
    return 'OK';
  }

  async expire(key: string, seconds: number) {
    this.check();
    const entry = this.live(key);
    if (!entry) return 0;
    entry.ttl = seconds;
    entry.expiresAt = this.now() + seconds * 1000;
    return 1;
  }

  async del(key: string) {
    this.check();
    return this.data.delete(key) ? 1 : 0;
  }
}
