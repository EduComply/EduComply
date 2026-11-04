/**
 * Role-based landing page and portal separation (MOCKED IdP, fake Redis, in-memory users,
 * real HTTP stack). The role always comes from the user store, never from the IdP claims.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  homePathFor,
  portalOfPath,
  portalsFor,
  postLoginPath,
} from '../src/modules/auth/domain/portal.js';
import type { RoleName } from '../src/modules/users/domain/roles.js';
import { buildAuthApp, cookiesFrom, PORTAL } from './support/authHarness.js';

describe('portal policy', () => {
  it('lands ADMIN and REVIEWER in the admin portal and LEARNER in the learner portal', () => {
    expect(homePathFor(['ADMIN'])).toBe('/admin/dashboard');
    expect(homePathFor(['REVIEWER'])).toBe('/admin/dashboard');
    expect(homePathFor(['LEARNER'])).toBe('/learner/dashboard');
    expect(homePathFor([])).toBe('/');
  });

  it('applies the documented priority ADMIN > REVIEWER > LEARNER for several roles', () => {
    expect(homePathFor(['LEARNER', 'ADMIN'])).toBe('/admin/dashboard');
    expect(homePathFor(['LEARNER', 'REVIEWER'])).toBe('/admin/dashboard');
    expect(portalsFor(['LEARNER', 'REVIEWER'])).toEqual(['admin', 'learner']);
  });

  it('maps paths to portals without prefix tricks', () => {
    expect(portalOfPath('/admin')).toBe('admin');
    expect(portalOfPath('/admin/users?q=a')).toBe('admin');
    expect(portalOfPath('/administrator')).toBeNull();
    expect(portalOfPath('/learner/training#x')).toBe('learner');
    expect(portalOfPath('/')).toBeNull();
  });

  it('keeps an authorised deep link and replaces anything else with the home page', () => {
    expect(postLoginPath('/admin/users', ['ADMIN'])).toBe('/admin/users');
    expect(postLoginPath('/learner/training', ['LEARNER'])).toBe('/learner/training');
    expect(postLoginPath('/', ['ADMIN'])).toBe('/admin/dashboard');
    expect(postLoginPath('/learner', ['ADMIN'])).toBe('/admin/dashboard');
    expect(postLoginPath('/admin/users', ['LEARNER'])).toBe('/learner/dashboard');
  });
});

async function signIn(
  ctx: ReturnType<typeof buildAuthApp>,
  who: { subject: string; email: string; name: string },
  returnTo?: string,
  existingSession?: string,
) {
  const start = await request(ctx.app)
    .get('/api/v1/auth/login')
    .query(returnTo ? { returnTo } : {});
  const state = new URL(start.headers.location!).searchParams.get('state')!;
  const code = ctx.idp.issueCode(state, who);
  const res = await request(ctx.app)
    .get('/api/v1/auth/oidc/callback')
    .query({ code, state })
    .set(
      'Cookie',
      [`ec_login=${state}`, ...(existingSession ? [`ec_session=${existingSession}`] : [])].join(
        '; ',
      ),
    );
  return { location: res.headers.location, session: cookiesFrom(res).ec_session!.value };
}

const person = (role: RoleName) => ({
  subject: `sub-${role.toLowerCase()}`,
  email: `${role.toLowerCase()}@uni.test`,
  name: `Test ${role}`,
});

describe('role-based redirect after the OIDC callback', () => {
  it.each([
    ['LEARNER', undefined, '/learner/dashboard'],
    ['ADMIN', undefined, '/admin/dashboard'],
    ['REVIEWER', undefined, '/admin/dashboard'],
    ['ADMIN', '/learner', '/admin/dashboard'],
    ['ADMIN', '/admin/users', '/admin/users'],
    ['LEARNER', '/admin/users', '/learner/dashboard'],
    ['LEARNER', '/learner/training?x=1', '/learner/training?x=1'],
  ] as const)('%s with returnTo=%s lands on %s', async (role, returnTo, expected) => {
    const ctx = buildAuthApp();
    // Elevated roles exist only in the user store (granted by an admin / db:grant-role).
    if (role !== 'LEARNER') ctx.users.addUser(person(role).email, role);
    const { location } = await signIn(ctx, person(role), returnTo);
    expect(location).toBe(`${PORTAL}${expected}`);
  });

  it('GET /me reports the server-decided portals and home page', async () => {
    const ctx = buildAuthApp();
    ctx.users.addUser(person('ADMIN').email, 'ADMIN');
    const admin = await signIn(ctx, person('ADMIN'));
    const learner = await signIn(ctx, person('LEARNER'));
    const me = (s: string) => request(ctx.app).get('/api/v1/me').set('Cookie', `ec_session=${s}`);
    expect((await me(admin.session)).body).toMatchObject({
      roles: ['ADMIN'],
      portals: ['admin'],
      homePath: '/admin/dashboard',
    });
    expect((await me(learner.session)).body).toMatchObject({
      roles: ['LEARNER'],
      portals: ['learner'],
      homePath: '/learner/dashboard',
    });
  });

  it('a role claimed by the IdP is ignored: a new user is a LEARNER', async () => {
    const ctx = buildAuthApp();
    const claimsAdmin = { ...person('ADMIN'), email: 'new-admin-claim@uni.test', roles: ['ADMIN'] };
    const { location, session } = await signIn(ctx, claimsAdmin);
    expect(location).toBe(`${PORTAL}/learner/dashboard`);
    const me = await request(ctx.app).get('/api/v1/me').set('Cookie', `ec_session=${session}`);
    expect(me.body.roles).toEqual(['LEARNER']);
  });

  it('switching accounts replaces the previous session (no identity reuse)', async () => {
    const ctx = buildAuthApp();
    ctx.users.addUser(person('ADMIN').email, 'ADMIN');
    const learner = await signIn(ctx, person('LEARNER'));
    // The admin signs in from the same browser while the learner cookie is still present.
    const admin = await signIn(ctx, person('ADMIN'), undefined, learner.session);
    expect(admin.location).toBe(`${PORTAL}/admin/dashboard`);
    expect(admin.session).not.toBe(learner.session);
    const me = (s: string) => request(ctx.app).get('/api/v1/me').set('Cookie', `ec_session=${s}`);
    expect((await me(learner.session)).status).toBe(401);
    expect((await me(admin.session)).body.email).toBe(person('ADMIN').email);
  });

  it('the backend enforces ADMIN on admin APIs regardless of the portal', async () => {
    const ctx = buildAuthApp();
    ctx.users.addUser(person('ADMIN').email, 'ADMIN');
    const admin = await signIn(ctx, person('ADMIN'));
    const learner = await signIn(ctx, person('LEARNER'));
    const users = (s: string) =>
      request(ctx.app).get('/api/v1/users').set('Cookie', `ec_session=${s}`);
    expect((await users(learner.session)).status).toBe(403);
    expect((await users(admin.session)).status).toBe(200);
    const audit = (s: string) =>
      request(ctx.app).get('/api/v1/audit-events').set('Cookie', `ec_session=${s}`);
    expect((await audit(learner.session)).status).toBe(403);
    expect((await audit(admin.session)).status).toBe(200);
  });
});
