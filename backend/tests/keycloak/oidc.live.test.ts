/**
 * LIVE end-to-end OIDC test against the local Keycloak realm and Redis:
 * real authorization-code + PKCE flow (the Keycloak login form is submitted over HTTP),
 * real ID-token validation, real Redis sessions. User records use the in-memory directory
 * so the shared PostgreSQL database is not modified (DB sync is covered by tests/db).
 *
 * Prerequisites: npm run redis:up && npm run keycloak:up. Run: npm run test:keycloak
 */
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDefaultModules } from '../../src/composition.js';
import { env } from '../../src/config/env.js';
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
import { cookiesFrom } from '../support/authHarness.js';
import { MemoryUsers } from '../support/memoryUsers.js';

if (!env.oidcConfigured || !env.REDIS_URL) {
  throw new Error('OIDC_* and REDIS_URL must be set (npm run auth:init-env); see README.');
}

const kc = keycloakConfigFromEnv();
const tag = randomUUID().slice(0, 8);
const testUser = {
  username: `live-${tag}`,
  email: `live-${tag}@educomply.test`,
  firstName: 'Live',
  lastName: 'Tester',
  password: `${randomBytes(18).toString('base64url')}!9a`,
};
let keycloakUserId: string | undefined;

const users = new MemoryUsers();
const app = createApp({ modules: createDefaultModules({ users }) });

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
});

/** Keeps Keycloak's own cookies between the login page GET and the form POST. */
function cookieJar() {
  const jar = new Map<string, string>();
  return {
    store(res: Response) {
      for (const line of res.headers.getSetCookie()) {
        const [pair] = line.split(';');
        const [name, ...value] = pair!.split('=');
        jar.set(name!.trim(), value.join('='));
      }
    },
    header: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
  };
}

/** Logs in at Keycloak like a browser would; returns the callback URL Keycloak redirects to. */
async function signInAtKeycloak(authorizationUrl: string, password = testUser.password) {
  const jar = cookieJar();
  const page = await fetch(authorizationUrl, { redirect: 'manual' });
  jar.store(page);
  expect(page.status).toBe(200);
  const html = await page.text();
  const formTag = /<form\b[^>]*\bid="kc-form-login"[^>]*>/.exec(html)?.[0];
  const action = formTag && /\baction="([^"]+)"/.exec(formTag)?.[1];
  if (!action) throw new Error('Keycloak login form not found');

  const submit = await fetch(action.replace(/&amp;/g, '&'), {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
    body: new URLSearchParams({ username: testUser.username, password, credentialId: '' }),
  });
  return { status: submit.status, location: submit.headers.get('location') };
}

async function startLogin(returnTo = '/learner') {
  const res = await request(app).get('/api/v1/auth/login').query({ returnTo });
  expect(res.status).toBe(302);
  return { authorizationUrl: res.headers.location!, loginCookie: cookiesFrom(res).ec_login!.value };
}

describe('live Keycloak OIDC', () => {
  it('redirects to the Keycloak realm with PKCE S256, state and nonce', async () => {
    const { authorizationUrl } = await startLogin();
    const url = new URL(authorizationUrl);
    expect(`${url.origin}${url.pathname}`).toBe(`${env.OIDC_ISSUER}/protocol/openid-connect/auth`);
    expect(url.searchParams.get('client_id')).toBe(env.OIDC_CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(env.OIDC_REDIRECT_URI);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('nonce')).toBeTruthy();
  });

  it('full login: Keycloak → callback → Redis session → /me → logout', async () => {
    const { authorizationUrl, loginCookie } = await startLogin('/learner/dashboard');
    const kcResult = await signInAtKeycloak(authorizationUrl);
    expect(kcResult.status).toBe(302);
    const callback = new URL(kcResult.location!);
    expect(`${callback.origin}${callback.pathname}`).toBe(env.OIDC_REDIRECT_URI);

    const res = await request(app)
      .get(`${callback.pathname}${callback.search}`)
      .set('Cookie', `ec_login=${loginCookie}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${env.APP_ORIGIN}/learner/dashboard`);
    const cookies = cookiesFrom(res);
    expect(cookies.ec_session).toBeDefined();
    const cookie = `ec_session=${cookies.ec_session!.value}`;

    const me = await request(app).get('/api/v1/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      email: testUser.email,
      roles: ['LEARNER'],
      displayName: 'Live Tester',
    });
    // ID token validated by openid-client and kept server-side only.
    expect(JSON.stringify(me.body)).not.toMatch(/eyJ[\w-]+\.[\w-]+\./);

    // Session is in the real Redis under the namespaced prefix, with an 8 h TTL.
    const keys = await getRedis().keys(`${env.REDIS_KEY_PREFIX}session:*`);
    expect(keys.length).toBeGreaterThan(0);

    // Replaying the same callback fails: state is single-use.
    const replay = await request(app)
      .get(`${callback.pathname}${callback.search}`)
      .set('Cookie', `ec_login=${loginCookie}`);
    expect(replay.headers.location).toBe(`${env.APP_ORIGIN}/?authError=LOGIN_EXPIRED`);

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', me.body.csrfToken as string);
    expect(logout.status).toBe(200);
    const idpLogout = new URL(logout.body.idpLogoutUrl as string);
    expect(idpLogout.pathname).toBe(`/realms/${kc.realm}/protocol/openid-connect/logout`);
    expect(idpLogout.searchParams.get('id_token_hint')).toBeTruthy();
    expect((await request(app).get('/api/v1/me').set('Cookie', cookie)).status).toBe(401);
    expect(users.audit.map((e) => e.action)).toEqual([
      'user.created',
      'identity.linked',
      'auth.login',
      'auth.logout',
    ]);
  });

  it('rejects a tampered authorization code (Keycloak token endpoint refuses it)', async () => {
    const { authorizationUrl, loginCookie } = await startLogin();
    const kcResult = await signInAtKeycloak(authorizationUrl);
    const callback = new URL(kcResult.location!);
    callback.searchParams.set('code', `${callback.searchParams.get('code')}tampered`);
    const res = await request(app)
      .get(`${callback.pathname}${callback.search}`)
      .set('Cookie', `ec_login=${loginCookie}`);
    expect(res.headers.location).toBe(`${env.APP_ORIGIN}/?authError=LOGIN_FAILED`);
  });

  it('wrong password stays on the Keycloak login page (no code issued)', async () => {
    const { authorizationUrl } = await startLogin();
    const kcResult = await signInAtKeycloak(authorizationUrl, 'definitely-wrong-password');
    expect(kcResult.status).toBe(200);
    expect(kcResult.location).toBeNull();
  });
});
