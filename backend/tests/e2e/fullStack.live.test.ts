/**
 * LIVE end-to-end test of the whole stack over the configured DATABASE_TRANSPORT:
 * Keycloak login form → OIDC callback → Prisma user sync (user lookup, identity linking,
 * LEARNER role, audit events) in Neon → Redis session → learner and admin API → role
 * change → logout.
 *
 * Every database write happens inside ONE interactive transaction that is rolled back at
 * the end, so no user, role or audit record is left in Neon. The temporary Keycloak user is
 * deleted afterwards; logout removes the Redis session.
 *
 * Prerequisites: npm run dev:deps (Redis + Keycloak) and a reachable Neon database.
 * Run: npm run test:e2e   (or with DATABASE_TRANSPORT=websocket)
 */
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDefaultModules } from '../../src/composition.js';
import { env } from '../../src/config/env.js';
import { PrismaAuditQuery } from '../../src/modules/audit/infrastructure/prismaAuditQuery.js';
import { grantRole } from '../../src/modules/users/application/grantRole.js';
import { PrismaUserAdmin } from '../../src/modules/users/infrastructure/prismaUserAdmin.js';
import { PrismaUserDirectory } from '../../src/modules/users/infrastructure/prismaUserDirectory.js';
import { disconnectPrisma, getPrisma } from '../../src/shared/infrastructure/database/prisma.js';
import {
  connectRedis,
  disconnectRedis,
  getRedis,
} from '../../src/shared/infrastructure/redis/redis.js';
import {
  createKeycloakUser,
  deleteKeycloakUser,
  keycloakConfigFromEnv,
} from '../../scripts/keycloakAdmin.js';
import { asClient, inRollback } from '../db/helpers.js';
import { cookiesFrom } from '../support/authHarness.js';

if (!env.oidcConfigured || !env.REDIS_URL || !env.DATABASE_URL) {
  throw new Error('OIDC_*, REDIS_URL and DATABASE_URL must be set; see README.');
}

const kc = keycloakConfigFromEnv();
const tag = randomUUID().slice(0, 8);
const testUser = {
  username: `e2e-${tag}`,
  email: `e2e-${tag}@educomply.invalid`,
  firstName: 'Eetoo',
  lastName: 'Tester',
  password: `${randomBytes(18).toString('base64url')}!9a`,
};
let keycloakUserId: string | undefined;

beforeAll(async () => {
  connectRedis();
  const deadline = Date.now() + 10_000;
  while (!getRedis().isReady) {
    if (Date.now() > deadline) throw new Error('Redis not ready');
    await new Promise((r) => setTimeout(r, 100));
  }
  keycloakUserId = await createKeycloakUser(kc, testUser);
});

afterAll(async () => {
  if (keycloakUserId) await deleteKeycloakUser(kc, keycloakUserId);
  await disconnectRedis();
  await disconnectPrisma();
});

describe(`full stack over DATABASE_TRANSPORT=${env.DATABASE_TRANSPORT}`, () => {
  it('login → user sync + audit → learner/admin API → role change → logout (rolled back)', async () => {
    await inRollback(async (tx) => {
      const db = asClient(tx);
      const app = createApp({
        modules: {
          ...createDefaultModules({ users: new PrismaUserDirectory(() => db) }),
          userAdmin: new PrismaUserAdmin(() => db),
          auditQuery: new PrismaAuditQuery(() => db),
        },
      });

      /** Keycloak login (authorization code + PKCE) → callback; returns redirect + cookie. */
      const signIn = async (returnTo?: string) => {
        const start = await request(app)
          .get('/api/v1/auth/login')
          .query(returnTo ? { returnTo } : {});
        expect(start.status).toBe(302);
        const loginCookie = cookiesFrom(start).ec_login!.value;
        const callback = new URL(await signInAtKeycloak(start.headers.location!));
        const cb = await request(app)
          .get(`${callback.pathname}${callback.search}`)
          .set('Cookie', `ec_login=${loginCookie}`);
        expect(cb.status, cb.headers.location).toBe(302);
        return {
          location: cb.headers.location as string,
          cookie: `ec_session=${cookiesFrom(cb).ec_session!.value}`,
        };
      };

      // 1. First sign-in (no fixed return path) → LEARNER → learner dashboard.
      const first = await signIn();
      expect(first.location).toBe(`${env.APP_ORIGIN}/learner/dashboard`);
      const cookie = first.cookie;

      // 2. Learner dashboard data: user lookup + LEARNER role from the database.
      const me = await request(app).get('/api/v1/me').set('Cookie', cookie);
      expect(me.status, JSON.stringify(me.body)).toBe(200);
      expect(me.body).toMatchObject({
        email: testUser.email,
        roles: ['LEARNER'],
        portals: ['learner'],
        homePath: '/learner/dashboard',
      });
      const userId = me.body.id as string;

      // 3. Identity linked and audit events written in the user-sync transaction.
      const identities = await tx.userIdentity.findMany({ where: { userId } });
      expect(identities.map((i) => i.subject)).toEqual([keycloakUserId]);
      const actions = (
        await tx.auditEvent.findMany({
          where: { OR: [{ targetId: userId }, { actorId: userId }] },
          orderBy: { id: 'asc' },
        })
      ).map((e) => e.action);
      expect(actions).toEqual(
        expect.arrayContaining(['user.created', 'identity.linked', 'auth.login']),
      );

      // 4. RBAC: a learner cannot open the admin API.
      expect((await request(app).get('/api/v1/users').set('Cookie', cookie)).status).toBe(403);

      // 5. Role change (audited transaction), effective on the next request.
      await grantRole(db, {
        email: testUser.email,
        roleName: 'ADMIN',
        reason: 'e2e transport test',
        operator: 'e2e',
      });
      const asAdmin = await request(app).get('/api/v1/me').set('Cookie', cookie);
      expect(asAdmin.body.roles).toEqual(['ADMIN']);

      // 6. Admin dashboard data: user search, user detail, audit log.
      const list = await request(app)
        .get('/api/v1/users')
        .query({ q: testUser.email })
        .set('Cookie', cookie);
      expect(list.status, JSON.stringify(list.body)).toBe(200);
      expect(list.body.data.map((u: { id: string }) => u.id)).toContain(userId);
      const detail = await request(app).get(`/api/v1/users/${userId}`).set('Cookie', cookie);
      expect(detail.status, JSON.stringify(detail.body)).toBe(200);
      const audit = await request(app)
        .get('/api/v1/audit-events')
        .query({ targetId: userId, limit: 100 })
        .set('Cookie', cookie);
      expect(audit.status, JSON.stringify(audit.body)).toBe(200);
      expect(audit.body.data.map((e: { action: string }) => e.action)).toContain(
        'user.role_changed',
      );

      // 7. Logout removes the Redis session.
      const out = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', me.body.csrfToken as string);
      expect(out.status, JSON.stringify(out.body)).toBe(200);
      expect((await request(app).get('/api/v1/me').set('Cookie', cookie)).status).toBe(401);

      // 8. Signing in again as the (now) ADMIN lands in the admin portal — even when the
      //    sign-in started from a learner page — and a new session is issued.
      const again = await signIn('/learner');
      expect(again.location).toBe(`${env.APP_ORIGIN}/admin/dashboard`);
      expect(again.cookie).not.toBe(cookie);
      const adminMe = await request(app).get('/api/v1/me').set('Cookie', again.cookie);
      expect(adminMe.body).toMatchObject({
        roles: ['ADMIN'],
        portals: ['admin'],
        homePath: '/admin/dashboard',
      });
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', again.cookie)
        .set('X-CSRF-Token', adminMe.body.csrfToken as string);
    }, 90_000);

    // Rolled back: nothing from this test exists in the database.
    expect(await getPrisma().user.count({ where: { email: testUser.email } })).toBe(0);
  });
});

/** Submits the Keycloak login form like a browser; returns the redirect (callback) URL. */
async function signInAtKeycloak(authorizationUrl: string): Promise<string> {
  const jar = new Map<string, string>();
  const store = (res: Response) => {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [name, ...value] = pair!.split('=');
      jar.set(name!.trim(), value.join('='));
    }
  };
  const page = await fetch(authorizationUrl, { redirect: 'manual' });
  store(page);
  expect(page.status).toBe(200);
  const formTag = /<form\b[^>]*\bid="kc-form-login"[^>]*>/.exec(await page.text())?.[0];
  const action = formTag && /\baction="([^"]+)"/.exec(formTag)?.[1];
  if (!action) throw new Error('Keycloak login form not found');
  const submit = await fetch(action.replace(/&amp;/g, '&'), {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    },
    body: new URLSearchParams({
      username: testUser.username,
      password: testUser.password,
      credentialId: '',
    }),
  });
  expect(submit.status).toBe(302);
  return submit.headers.get('location')!;
}
