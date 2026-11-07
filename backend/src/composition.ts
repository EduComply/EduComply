import { env } from './config/env.js';
import { PrismaAuditQuery } from './modules/audit/infrastructure/prismaAuditQuery.js';
import type { AuditQueryService } from './modules/audit/application/auditQuery.js';
import { AuthService } from './modules/auth/application/authService.js';
import type { IdentityProvider, UserDirectory } from './modules/auth/application/ports.js';
import {
  OidcIdentityProvider,
  UnconfiguredIdentityProvider,
} from './modules/auth/infrastructure/oidcIdentityProvider.js';
import {
  RedisLoginStateRepository,
  RedisSessionRepository,
} from './modules/auth/infrastructure/redisSessionRepositories.js';
import type { CookiePolicy } from './modules/auth/presentation/cookies.js';
import type { UserAdminService } from './modules/users/application/userAdmin.js';
import { PrismaUserAdmin } from './modules/users/infrastructure/prismaUserAdmin.js';
import { PrismaUserDirectory } from './modules/users/infrastructure/prismaUserDirectory.js';
import type { RateLimitStore } from './shared/http/rateLimit.js';
import { getPrisma } from './shared/infrastructure/database/prisma.js';
import { getRedis } from './shared/infrastructure/redis/redis.js';
import { createRedisRateLimitStore } from './shared/infrastructure/redis/stores.js';
import type { TtlStoreClient } from './shared/infrastructure/redis/ttlStore.js';

/** Everything the HTTP layer needs. Tests build this with fakes; the app uses real adapters. */
export interface AppModules {
  auth: AuthService;
  userAdmin: UserAdminService;
  auditQuery: AuditQueryService;
  rateLimitStore: RateLimitStore;
  cookiePolicy: CookiePolicy;
  appOrigin: string;
  redirectUri: string;
}

export function createIdentityProvider(): IdentityProvider {
  if (!env.oidcConfigured) return new UnconfiguredIdentityProvider();
  return new OidcIdentityProvider({
    issuer: env.OIDC_ISSUER!,
    clientId: env.OIDC_CLIENT_ID!,
    clientSecret: env.OIDC_CLIENT_SECRET!,
    redirectUri: env.OIDC_REDIRECT_URI!,
    postLogoutRedirectUri: env.postLogoutRedirectUri,
    scopes: env.OIDC_SCOPES,
    ...(env.OIDC_INTERNAL_URL ? { internalUrl: env.OIDC_INTERNAL_URL } : {}),
  });
}

/**
 * Composition root. Nothing connects here: Redis and Prisma clients are resolved on first
 * use, so the app can start (and report readiness) while a dependency is still down.
 */
export function createDefaultModules(
  overrides: { users?: UserDirectory; idp?: IdentityProvider } = {},
): AppModules {
  const redis = (): TtlStoreClient => getRedis();
  return {
    auth: new AuthService({
      idp: overrides.idp ?? createIdentityProvider(),
      users: overrides.users ?? new PrismaUserDirectory(getPrisma),
      sessions: new RedisSessionRepository(redis),
      loginStates: new RedisLoginStateRepository(redis),
    }),
    userAdmin: new PrismaUserAdmin(getPrisma),
    auditQuery: new PrismaAuditQuery(getPrisma),
    rateLimitStore: createRedisRateLimitStore(),
    cookiePolicy: { secure: env.cookieSecure },
    appOrigin: env.APP_ORIGIN,
    redirectUri: env.OIDC_REDIRECT_URI ?? `${env.APP_ORIGIN}/api/v1/auth/oidc/callback`,
  };
}
