import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import type { AppModules } from '../../src/composition.js';
import { AuthService } from '../../src/modules/auth/application/authService.js';
import {
  RedisLoginStateRepository,
  RedisSessionRepository,
} from '../../src/modules/auth/infrastructure/redisSessionRepositories.js';
import type { RoleName } from '../../src/modules/users/domain/roles.js';
import { MemoryRateLimitStore, type RateLimitStore } from '../../src/shared/http/rateLimit.js';
import { FakeIdentityProvider, type FakeLogin } from './fakeIdp.js';
import { FakeRedis } from './fakeRedis.js';
import { auditQueryOf, MemoryUsers } from './memoryUsers.js';

export const PORTAL = 'http://localhost:5173';
export const REDIRECT_URI = 'http://localhost:5173/api/v1/auth/oidc/callback';

/** MOCKED app: fake IdP, fake Redis (TTL-aware clock), in-memory users, real HTTP stack. */
export function buildAuthApp(
  options: { rateLimitStore?: RateLimitStore; now?: () => number } = {},
) {
  const redis = new FakeRedis(options.now);
  const idp = new FakeIdentityProvider();
  const users = new MemoryUsers();
  const modules: AppModules = {
    auth: new AuthService({
      idp,
      users,
      sessions: new RedisSessionRepository(redis),
      loginStates: new RedisLoginStateRepository(redis),
    }),
    userAdmin: users,
    auditQuery: auditQueryOf(users),
    rateLimitStore: options.rateLimitStore ?? new MemoryRateLimitStore(),
    cookiePolicy: { secure: false },
    appOrigin: PORTAL,
    redirectUri: REDIRECT_URI,
  };
  const app = createApp({
    modules,
    corsOrigins: [PORTAL],
    readinessChecks: {
      database: async () => ({ status: 'up' }),
      redis: async () => ({ status: 'up' }),
    },
  });
  return { app, redis, idp, users };
}

/** Parses Set-Cookie headers into name → { value, attributes }. */
export function cookiesFrom(res: request.Response) {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const out: Record<string, { value: string; attrs: string }> = {};
  for (const line of raw) {
    const [pair, ...attrs] = line.split(';');
    const [name, ...rest] = pair!.split('=');
    out[name!.trim()] = { value: decodeURIComponent(rest.join('=')), attrs: attrs.join(';') };
  }
  return out;
}

export interface LoggedIn {
  cookie: string;
  csrf: string;
  sessionId: string;
  userId: string;
}

/** Runs the full browser flow: /auth/login → (fake IdP) → /auth/oidc/callback. */
export async function login(
  ctx: ReturnType<typeof buildAuthApp>,
  login: FakeLogin & { role?: RoleName },
  returnTo = '/learner',
): Promise<LoggedIn> {
  const start = await request(ctx.app).get('/api/v1/auth/login').query({ returnTo });
  if (start.status !== 302) throw new Error(`login start failed: ${start.status}`);
  const state = new URL(start.headers.location!).searchParams.get('state')!;
  const loginCookie = cookiesFrom(start).ec_login!.value;
  const code = ctx.idp.issueCode(state, login);

  const callback = await request(ctx.app)
    .get('/api/v1/auth/oidc/callback')
    .query({ code, state })
    .set('Cookie', `ec_login=${loginCookie}`);
  const cookies = cookiesFrom(callback);
  if (!cookies.ec_session) throw new Error(`callback failed: ${callback.headers.location}`);

  const userId = ctx.users.identities.get(`${ctx.idp.issuer}|${login.subject}`)!;
  if (login.role) ctx.users.users.get(userId)!.role = login.role;
  return {
    cookie: `ec_session=${cookies.ec_session.value}; ec_csrf=${cookies.ec_csrf!.value}`,
    csrf: cookies.ec_csrf!.value,
    sessionId: cookies.ec_session.value,
    userId,
  };
}

export type AuthApp = ReturnType<typeof buildAuthApp>;
export type { Express };
