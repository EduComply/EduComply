/**
 * MOCKED tests: OIDC login, Redis sessions, RBAC, CSRF and rate limiting through the real
 * HTTP stack, with a fake IdP, fake Redis and in-memory user store. Live counterparts:
 * tests/keycloak (real Keycloak + Redis) and tests/db (real PostgreSQL user sync).
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { safeReturnTo } from '../src/modules/auth/domain/session.js';
import { RedisTtl } from '../src/shared/infrastructure/redis/keys.js';
import { MemoryRateLimitStore } from '../src/shared/http/rateLimit.js';
import { buildAuthApp, cookiesFrom, login, PORTAL, REDIRECT_URI } from './support/authHarness.js';

const learner = { subject: 'sub-learner', email: 'learner@uni.test', name: 'Lea Learner' };

describe('OIDC login (authorization code + PKCE)', () => {
  it('GET /auth/login redirects to the IdP with state, nonce and S256 challenge', async () => {
    const ctx = buildAuthApp();
    const res = await request(ctx.app).get('/api/v1/auth/login?returnTo=/learner/dashboard');
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location!);
    expect(url.origin + url.pathname).toBe(`${ctx.idp.issuer}/protocol/openid-connect/auth`);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.get('nonce')).toBeTruthy();

    const loginCookie = cookiesFrom(res).ec_login!;
    expect(loginCookie.value).toBe(url.searchParams.get('state'));
    expect(loginCookie.attrs).toMatch(/HttpOnly/i);
    expect(loginCookie.attrs).toMatch(/Path=\/api\/v1\/auth/);
    expect(loginCookie.attrs).toMatch(/SameSite=Lax/i);
  });

  it('successful callback creates a session, sets cookies and returns to the portal path', async () => {
    const ctx = buildAuthApp();
    const start = await request(ctx.app).get('/api/v1/auth/login?returnTo=/learner/training');
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const code = ctx.idp.issueCode(state, learner);

    const res = await request(ctx.app)
      .get('/api/v1/auth/oidc/callback')
      .query({ code, state })
      .set('Cookie', `ec_login=${state}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${PORTAL}/learner/training`);

    const cookies = cookiesFrom(res);
    expect(cookies.ec_session!.value).toMatch(/^[\w-]{43}$/);
    expect(cookies.ec_session!.attrs).toMatch(/HttpOnly/i);
    expect(cookies.ec_session!.attrs).toMatch(/SameSite=Lax/i);
    expect(cookies.ec_csrf!.attrs).not.toMatch(/HttpOnly/i);
    // Session stored in Redis under a hash, never the raw cookie value; tokens not in cookies.
    const keys = [...ctx.redis.data.keys()];
    expect(keys.some((k) => k.includes(cookies.ec_session!.value))).toBe(false);
    expect(JSON.stringify(res.headers)).not.toContain('fake-id-token');
  });

  it('rejects an unknown or forged state', async () => {
    const ctx = buildAuthApp();
    const res = await request(ctx.app)
      .get('/api/v1/auth/oidc/callback?code=x&state=forged')
      .set('Cookie', 'ec_login=forged');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${PORTAL}/?authError=LOGIN_EXPIRED`);
    expect(cookiesFrom(res).ec_session).toBeUndefined();
  });

  it('rejects a callback whose state was issued to another browser (login CSRF)', async () => {
    const ctx = buildAuthApp();
    const start = await request(ctx.app).get('/api/v1/auth/login');
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const code = ctx.idp.issueCode(state, learner);
    const res = await request(ctx.app).get('/api/v1/auth/oidc/callback').query({ code, state });
    expect(res.headers.location).toBe(`${PORTAL}/?authError=LOGIN_FAILED`);
  });

  it('rejects an invalid authorization code', async () => {
    const ctx = buildAuthApp();
    const start = await request(ctx.app).get('/api/v1/auth/login');
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const res = await request(ctx.app)
      .get('/api/v1/auth/oidc/callback')
      .query({ code: 'not-issued', state })
      .set('Cookie', `ec_login=${state}`);
    expect(res.headers.location).toBe(`${PORTAL}/?authError=LOGIN_FAILED`);
  });

  it('state is single-use: replaying a callback fails', async () => {
    const ctx = buildAuthApp();
    const start = await request(ctx.app).get('/api/v1/auth/login');
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const code = ctx.idp.issueCode(state, learner);
    const call = () =>
      request(ctx.app)
        .get('/api/v1/auth/oidc/callback')
        .query({ code, state })
        .set('Cookie', `ec_login=${state}`);
    expect((await call()).headers.location).toBe(`${PORTAL}/learner`.replace('/learner', '/'));
    expect((await call()).headers.location).toBe(`${PORTAL}/?authError=LOGIN_EXPIRED`);
  });

  it('rejects an expired login attempt (state older than 10 minutes)', async () => {
    let now = Date.now();
    const ctx = buildAuthApp({ now: () => now });
    const start = await request(ctx.app).get('/api/v1/auth/login');
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const code = ctx.idp.issueCode(state, learner);
    now += (RedisTtl.oidcState + 1) * 1000;
    const res = await request(ctx.app)
      .get('/api/v1/auth/oidc/callback')
      .query({ code, state })
      .set('Cookie', `ec_login=${state}`);
    expect(res.headers.location).toBe(`${PORTAL}/?authError=LOGIN_EXPIRED`);
  });

  it('maps a cancelled login (error=access_denied) to LOGIN_CANCELLED', async () => {
    const ctx = buildAuthApp();
    const start = await request(ctx.app).get('/api/v1/auth/login');
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const res = await request(ctx.app)
      .get('/api/v1/auth/oidc/callback')
      .query({ error: 'access_denied', state })
      .set('Cookie', `ec_login=${state}`);
    expect(res.headers.location).toBe(`${PORTAL}/?authError=LOGIN_CANCELLED`);
  });

  it('rejects identities without a verified email', async () => {
    const ctx = buildAuthApp();
    const start = await request(ctx.app).get('/api/v1/auth/login');
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const code = ctx.idp.issueCode(state, { ...learner, emailVerified: false });
    const res = await request(ctx.app)
      .get('/api/v1/auth/oidc/callback')
      .query({ code, state })
      .set('Cookie', `ec_login=${state}`);
    expect(res.headers.location).toBe(`${PORTAL}/?authError=EMAIL_NOT_VERIFIED`);
  });

  it('reports an unavailable identity provider safely', async () => {
    const ctx = buildAuthApp();
    ctx.idp.unavailable = true;
    const res = await request(ctx.app).get('/api/v1/auth/login');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${PORTAL}/?authError=IDP_UNAVAILABLE`);
  });

  it.each([
    ['https://evil.example/phish', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
    ['/admin/users?x=1#top', '/admin/users?x=1#top'],
  ])('sanitises returnTo %s → %s (no open redirect)', (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });

  it('builds the token-exchange URL from the registered redirect URI, not the Host header', async () => {
    const ctx = buildAuthApp();
    const seen: string[] = [];
    const original = ctx.idp.completeAuthorization.bind(ctx.idp);
    ctx.idp.completeAuthorization = (url, checks) => {
      seen.push(`${url.origin}${url.pathname}`);
      return original(url, checks);
    };
    const start = await request(ctx.app).get('/api/v1/auth/login');
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    await request(ctx.app)
      .get('/api/v1/auth/oidc/callback')
      .query({ code: ctx.idp.issueCode(state, learner), state })
      .set('Host', 'evil.example')
      .set('Cookie', `ec_login=${state}`);
    expect(seen).toEqual([REDIRECT_URI]);
  });
});

describe('sessions and GET /me', () => {
  it('returns the current user, roles and CSRF token', async () => {
    const ctx = buildAuthApp();
    const s = await login(ctx, learner);
    const res = await request(ctx.app).get('/api/v1/me').set('Cookie', s.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: s.userId,
      email: learner.email,
      roles: ['LEARNER'],
      csrfToken: s.csrf,
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(res.body)).not.toContain('fake-id-token');
  });

  it('anonymous requests get 401 SESSION_EXPIRED', async () => {
    const ctx = buildAuthApp();
    const res = await request(ctx.app).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'SESSION_EXPIRED', status: 401 });
  });

  it('an unknown session id gets 401 and the cookies are cleared', async () => {
    const ctx = buildAuthApp();
    const res = await request(ctx.app).get('/api/v1/me').set('Cookie', 'ec_session=made-up');
    expect(res.status).toBe(401);
    expect(cookiesFrom(res).ec_session!.attrs).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('expires after 8 hours idle, and activity extends the session', async () => {
    let now = Date.now();
    const ctx = buildAuthApp({ now: () => now });
    const s = await login(ctx, learner);
    const me = () => request(ctx.app).get('/api/v1/me').set('Cookie', s.cookie);

    now += (RedisTtl.session - 60) * 1000; // 7 h 59 m: still valid, and this request slides it
    expect((await me()).status).toBe(200);
    now += (RedisTtl.session - 60) * 1000; // another 7 h 59 m since last activity
    expect((await me()).status).toBe(200);
    now += (RedisTtl.session + 1) * 1000; // idle for more than 8 h
    const res = await me();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_EXPIRED');
  });

  it('regenerates the session id on login and destroys the previous session', async () => {
    const ctx = buildAuthApp();
    const first = await login(ctx, learner);
    const start = await request(ctx.app).get('/api/v1/auth/login');
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const res = await request(ctx.app)
      .get('/api/v1/auth/oidc/callback')
      .query({ code: ctx.idp.issueCode(state, learner), state })
      .set('Cookie', `ec_login=${state}; ${first.cookie}`);
    const second = cookiesFrom(res).ec_session!.value;
    expect(second).not.toBe(first.sessionId);
    expect((await request(ctx.app).get('/api/v1/me').set('Cookie', first.cookie)).status).toBe(401);
  });

  it('a deactivated user loses access immediately', async () => {
    const ctx = buildAuthApp();
    const s = await login(ctx, learner);
    ctx.users.users.get(s.userId)!.isActive = false;
    expect((await request(ctx.app).get('/api/v1/me').set('Cookie', s.cookie)).status).toBe(401);
  });
});

describe('logout', () => {
  it('requires the CSRF token, destroys the session and returns the IdP logout URL', async () => {
    const ctx = buildAuthApp();
    const s = await login(ctx, learner);

    const noCsrf = await request(ctx.app).post('/api/v1/auth/logout').set('Cookie', s.cookie);
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.code).toBe('CSRF_INVALID');

    const res = await request(ctx.app)
      .post('/api/v1/auth/logout')
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf);
    expect(res.status).toBe(200);
    expect(res.body.idpLogoutUrl).toContain('/protocol/openid-connect/logout');
    expect(res.body.idpLogoutUrl).toContain('id_token_hint=');
    expect(cookiesFrom(res).ec_session!.attrs).toMatch(/Expires=Thu, 01 Jan 1970/);

    expect((await request(ctx.app).get('/api/v1/me').set('Cookie', s.cookie)).status).toBe(401);
    expect(ctx.users.audit.map((e) => e.action)).toContain('auth.logout');
  });
});

describe('role-based authorization', () => {
  const setup = async () => {
    const ctx = buildAuthApp();
    const asLearner = await login(ctx, learner);
    const asAdmin = await login(ctx, {
      subject: 'sub-admin',
      email: 'admin@uni.test',
      role: 'ADMIN',
    });
    const asReviewer = await login(ctx, {
      subject: 'sub-reviewer',
      email: 'reviewer@uni.test',
      role: 'REVIEWER',
    });
    return { ctx, asLearner, asAdmin, asReviewer };
  };
  const get = (ctx: Awaited<ReturnType<typeof setup>>['ctx'], path: string, cookie?: string) => {
    const req = request(ctx.app).get(path);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('anonymous users are rejected with 401 on every protected endpoint', async () => {
    const { ctx } = await setup();
    for (const path of ['/api/v1/me', '/api/v1/users', '/api/v1/audit-events']) {
      expect((await get(ctx, path)).status).toBe(401);
    }
  });

  it('LEARNER: /me allowed; admin and audit endpoints → 403 FORBIDDEN', async () => {
    const { ctx, asLearner } = await setup();
    expect((await get(ctx, '/api/v1/me', asLearner.cookie)).status).toBe(200);
    const users = await get(ctx, '/api/v1/users', asLearner.cookie);
    expect(users.status).toBe(403);
    expect(users.body).toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect((await get(ctx, '/api/v1/audit-events', asLearner.cookie)).status).toBe(403);
  });

  it('ADMIN: can list users, view a user and read the audit log', async () => {
    const { ctx, asAdmin, asLearner } = await setup();
    const list = await get(ctx, '/api/v1/users?limit=10', asAdmin.cookie);
    expect(list.status).toBe(200);
    expect(list.body.page).toEqual({ nextCursor: null, limit: 10 });
    expect(list.body.data.length).toBe(3);
    expect((await get(ctx, `/api/v1/users/${asLearner.userId}`, asAdmin.cookie)).status).toBe(200);
    expect((await get(ctx, '/api/v1/audit-events', asAdmin.cookie)).status).toBe(200);
  });

  it('REVIEWER: can read the audit log but not manage users', async () => {
    const { ctx, asReviewer } = await setup();
    expect((await get(ctx, '/api/v1/audit-events', asReviewer.cookie)).status).toBe(200);
    expect((await get(ctx, '/api/v1/users', asReviewer.cookie)).status).toBe(403);
  });

  it('ADMIN changes a role with CSRF + reason; the change is audited', async () => {
    const { ctx, asAdmin, asLearner } = await setup();
    const res = await request(ctx.app)
      .patch(`/api/v1/users/${asLearner.userId}/roles`)
      .set('Cookie', asAdmin.cookie)
      .set('X-CSRF-Token', asAdmin.csrf)
      .send({ roles: ['REVIEWER'], reason: 'Sprint 1 reviewer' });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['REVIEWER']);
    expect(ctx.users.audit.at(-1)).toMatchObject({
      action: 'user.role_changed',
      actorId: asAdmin.userId,
      metadata: { from: 'LEARNER', to: 'REVIEWER' },
    });
  });

  it('users cannot assign themselves ADMIN or REVIEWER', async () => {
    const { ctx, asLearner, asAdmin } = await setup();
    const self = await request(ctx.app)
      .patch(`/api/v1/users/${asLearner.userId}/roles`)
      .set('Cookie', asLearner.cookie)
      .set('X-CSRF-Token', asLearner.csrf)
      .send({ roles: ['ADMIN'], reason: 'let me in please' });
    expect(self.status).toBe(403);
    expect(ctx.users.users.get(asLearner.userId)!.role).toBe('LEARNER');

    const adminSelf = await request(ctx.app)
      .patch(`/api/v1/users/${asAdmin.userId}/roles`)
      .set('Cookie', asAdmin.cookie)
      .set('X-CSRF-Token', asAdmin.csrf)
      .send({ roles: ['LEARNER'], reason: 'self change' });
    expect(adminSelf.status).toBe(409);
    expect(adminSelf.body.code).toBe('SELF_ROLE_CHANGE');
  });

  it('validates the role-change body (one role, reason, no unknown fields)', async () => {
    const { ctx, asAdmin, asLearner } = await setup();
    const res = await request(ctx.app)
      .patch(`/api/v1/users/${asLearner.userId}/roles`)
      .set('Cookie', asAdmin.cookie)
      .set('X-CSRF-Token', asAdmin.csrf)
      .send({ roles: ['ADMIN', 'REVIEWER'], reason: 'x', extra: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});

describe('CSRF protection', () => {
  it('rejects state-changing requests with a missing or wrong X-CSRF-Token', async () => {
    const ctx = buildAuthApp();
    const admin = await login(ctx, { subject: 'a', email: 'a@uni.test', role: 'ADMIN' });
    const target = await login(ctx, { subject: 'b', email: 'b@uni.test' });
    for (const token of [undefined, 'wrong-token', target.csrf]) {
      const req = request(ctx.app)
        .patch(`/api/v1/users/${target.userId}/roles`)
        .set('Cookie', admin.cookie)
        .send({ roles: ['REVIEWER'], reason: 'csrf test' });
      const res = await (token ? req.set('X-CSRF-Token', token) : req);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_INVALID');
    }
    expect(ctx.users.users.get(target.userId)!.role).toBe('LEARNER');
  });
});

describe('rate limiting', () => {
  it('limits /auth/* to 20 requests per minute per IP', async () => {
    const ctx = buildAuthApp({ rateLimitStore: new MemoryRateLimitStore() });
    for (let i = 0; i < 20; i++) {
      expect((await request(ctx.app).get('/api/v1/auth/login')).status).toBe(302);
    }
    const res = await request(ctx.app).get('/api/v1/auth/login');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('auth rate limiting fails closed when Redis is unavailable', async () => {
    const ctx = buildAuthApp({
      rateLimitStore: { hit: () => Promise.reject(new Error('ECONNREFUSED')) },
    });
    const res = await request(ctx.app).get('/api/v1/auth/login');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
  });
});

describe('Redis and database failures', () => {
  it('authenticated requests fail closed with 503 when the session store is down', async () => {
    const ctx = buildAuthApp();
    const s = await login(ctx, learner);
    ctx.redis.failing = true;
    const res = await request(ctx.app).get('/api/v1/me').set('Cookie', s.cookie);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('login start reports SERVICE_UNAVAILABLE when login state cannot be stored', async () => {
    const ctx = buildAuthApp();
    ctx.redis.failing = true;
    const res = await request(ctx.app).get('/api/v1/auth/login');
    expect(res.headers.location).toBe(`${PORTAL}/?authError=SERVICE_UNAVAILABLE`);
  });

  it('a database outage during callback does not create a session', async () => {
    const ctx = buildAuthApp();
    const start = await request(ctx.app).get('/api/v1/auth/login');
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    ctx.users.failing = true;
    const res = await request(ctx.app)
      .get('/api/v1/auth/oidc/callback')
      .query({ code: ctx.idp.issueCode(state, learner), state })
      .set('Cookie', `ec_login=${state}`);
    expect(res.headers.location).toBe(`${PORTAL}/?authError=SERVICE_UNAVAILABLE`);
    expect(cookiesFrom(res).ec_session).toBeUndefined();
  });
});

describe('user synchronisation and audit (mock directory)', () => {
  it('first login creates a LEARNER, links the identity and audits; later logins reuse it', async () => {
    const ctx = buildAuthApp();
    const first = await login(ctx, learner);
    const second = await login(ctx, learner);
    expect(second.userId).toBe(first.userId);
    expect(ctx.users.users.size).toBe(1);
    expect(ctx.users.users.get(first.userId)!.role).toBe('LEARNER');
    expect(ctx.users.audit.map((e) => e.action)).toEqual([
      'user.created',
      'identity.linked',
      'auth.login',
      'auth.login',
    ]);
  });

  it('an existing role is preserved on later logins', async () => {
    const ctx = buildAuthApp();
    const s = await login(ctx, { ...learner, role: 'ADMIN' });
    await login(ctx, learner);
    expect(ctx.users.users.get(s.userId)!.role).toBe('ADMIN');
  });

  it('a disabled account cannot sign in', async () => {
    const ctx = buildAuthApp();
    ctx.users.addUser(learner.email, 'LEARNER', false);
    const start = await request(ctx.app).get('/api/v1/auth/login');
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const res = await request(ctx.app)
      .get('/api/v1/auth/oidc/callback')
      .query({ code: ctx.idp.issueCode(state, learner), state })
      .set('Cookie', `ec_login=${state}`);
    expect(res.headers.location).toBe(`${PORTAL}/?authError=ACCOUNT_DISABLED`);
  });
});
