import { createHash } from 'node:crypto';
import { RedisNamespace, RedisTtl } from '../../../shared/infrastructure/redis/keys.js';
import {
  RedisTtlStore,
  type TtlStoreClient,
} from '../../../shared/infrastructure/redis/ttlStore.js';
import { randomToken } from '../application/authService.js';
import type { LoginStateRepository, SessionRepository } from '../application/ports.js';
import type { LoginState, SessionData } from '../domain/session.js';

type ClientSource = TtlStoreClient | (() => TtlStoreClient);

/**
 * Sessions in Redis under `<prefix>session:<sha256(sessionId)>` with an 8-hour sliding
 * idle TTL. Only the hash is stored, so a Redis dump does not reveal usable cookies.
 */
export class RedisSessionRepository implements SessionRepository {
  private readonly store: RedisTtlStore<SessionData>;

  constructor(client: ClientSource, ttlSeconds: number = RedisTtl.session) {
    this.store = new RedisTtlStore<SessionData>(client, RedisNamespace.Session, ttlSeconds);
  }

  private static hash(sessionId: string): string {
    return createHash('sha256').update(sessionId).digest('hex');
  }

  async create(data: SessionData): Promise<string> {
    const sessionId = randomToken(32); // 256-bit opaque identifier
    await this.store.set(RedisSessionRepository.hash(sessionId), data);
    return sessionId;
  }

  get(sessionId: string): Promise<SessionData | null> {
    return this.store.get(RedisSessionRepository.hash(sessionId));
  }

  async touch(sessionId: string): Promise<void> {
    await this.store.touch(RedisSessionRepository.hash(sessionId));
  }

  destroy(sessionId: string): Promise<void> {
    return this.store.delete(RedisSessionRepository.hash(sessionId));
  }
}

/** OIDC state → { PKCE verifier, nonce, returnTo } for 10 minutes, consumed exactly once. */
export class RedisLoginStateRepository implements LoginStateRepository {
  private readonly store: RedisTtlStore<LoginState>;

  constructor(client: ClientSource, ttlSeconds: number = RedisTtl.oidcState) {
    this.store = new RedisTtlStore<LoginState>(client, RedisNamespace.OidcState, ttlSeconds);
  }

  save(state: string, data: LoginState): Promise<void> {
    return this.store.set(state, data);
  }

  take(state: string): Promise<LoginState | null> {
    return this.store.take(state);
  }
}
