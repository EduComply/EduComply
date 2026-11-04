import { env } from '../../../config/env.js';

/**
 * Every Redis key is `<REDIS_KEY_PREFIX><namespace>:<part>[:<part>…]`, e.g.
 * `educomply:session:<id>`. The prefix separates apps/environments sharing one Redis;
 * namespaces separate features. Register new namespaces here to avoid collisions.
 */
export const RedisNamespace = {
  Session: 'session',
  RateLimit: 'ratelimit',
  OidcState: 'oidc-state',
} as const;

export type RedisNamespaceName = (typeof RedisNamespace)[keyof typeof RedisNamespace];

/** Expiry for temporary data, in seconds. Nothing in Redis is stored without a TTL. */
export const RedisTtl = {
  /** Session idle timeout: 8 hours (API Design §4). Refreshed on activity. */
  session: 8 * 60 * 60,
  /** OIDC state/nonce/PKCE verifier between redirect and callback. */
  oidcState: 10 * 60,
} as const;

/**
 * Builds a namespaced key. Parts are URI-encoded so user-controlled values
 * (emails, IPs) cannot inject ":" and escape their namespace.
 */
export function redisKey(namespace: RedisNamespaceName, ...parts: Array<string | number>): string {
  if (parts.length === 0) throw new Error('redisKey requires at least one part');
  const encoded = parts.map((p) => encodeURIComponent(String(p)));
  return `${env.REDIS_KEY_PREFIX}${namespace}:${encoded.join(':')}`;
}
