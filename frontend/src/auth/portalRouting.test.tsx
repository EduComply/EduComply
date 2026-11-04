// @vitest-environment jsdom
/**
 * Role-based portal separation in the UI (MOCKED fetch with the real GET /me contract; real
 * routes, guards and layouts). The server decides `portals` and `homePath`; the backend
 * enforces the same rules on every API (backend/tests/portalRedirect.test.ts).
 */
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/auth/session';
import { json, ME, mockFetch, renderApp } from '@/test/harness';

const ADMIN: Me = {
  ...ME,
  id: 'admin-0001',
  displayName: 'Ada Admin',
  email: 'ada@uni.test',
  roles: ['ADMIN'],
  portals: ['admin'],
  homePath: '/admin/dashboard',
};
const emptyPage = { data: [], page: { nextCursor: null, limit: 25 } };
const navLabels = (name: string) =>
  within(screen.getByRole('navigation', { name }))
    .getAllByRole('link')
    .map((l) => l.textContent);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sign-in entry point', () => {
  it('the welcome page offers only "Sign in" (no portal choice; the server picks it by role)', async () => {
    mockFetch({
      '/api/v1/me': () => json(401, { code: 'UNAUTHENTICATED', status: 401, title: 'x' }),
      '/api/v1/health': () => json(200, { status: 'ok', version: '0.1.0' }),
    });
    renderApp('/');
    const link = await screen.findByRole('link', { name: 'Sign in with institutional account' });
    expect(link.getAttribute('href')).toBe('/api/v1/auth/login');
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Sign in with institutional account',
    ]);
    expect(screen.queryByRole('link', { name: 'Learner portal' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Admin portal' })).toBeNull();
  });

  it('while the session is checked, the welcome page does not offer sign-in yet', async () => {
    let release!: (r: Response) => void;
    mockFetch({
      '/api/v1/me': () => new Promise<Response>((r) => (release = r)),
      '/api/v1/health': () => json(200, { status: 'ok', version: '0.1.0' }),
    });
    renderApp('/');
    expect(screen.getByText('Checking your session…')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sign in with institutional account' })).toBeNull();
    release(json(200, ME));
    expect(await screen.findByRole('link', { name: 'Go to dashboard' })).toBeTruthy();
  });

  it.each([
    ['administrator', ADMIN, '/admin/dashboard'],
    ['learner', ME, '/learner/dashboard'],
    [
      'reviewer',
      { ...ADMIN, roles: ['REVIEWER'], portals: ['admin'], homePath: '/admin/dashboard' } as Me,
      '/admin/dashboard',
    ],
  ])('a signed-in %s gets one "Go to dashboard" action to their home page', async (_, me, home) => {
    mockFetch({
      '/api/v1/me': () => json(200, me),
      '/api/v1/health': () => json(200, { status: 'ok', version: '0.1.0' }),
    });
    renderApp('/');
    const link = await screen.findByRole('link', { name: 'Go to dashboard' });
    expect(link.getAttribute('href')).toBe(home);
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Go to dashboard']);
  });
});

describe('portal separation', () => {
  it('an administrator opening the learner portal is sent to the admin dashboard', async () => {
    mockFetch({
      '/api/v1/me': () => json(200, ADMIN),
      '/api/v1/users': () => json(200, emptyPage),
      '/api/v1/audit-events': () => json(200, emptyPage),
    });
    renderApp('/learner/dashboard');
    expect(await screen.findByRole('navigation', { name: 'Admin portal' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Learner portal' })).toBeNull();
    expect(navLabels('Admin portal')).toEqual(
      expect.arrayContaining([
        'Dashboard',
        'User Management',
        'Learner Management',
        'Courses',
        'Monitoring',
        'Reports',
        'Audit Events',
        'Profile',
      ]),
    );
  });

  it('a learner sees the learner navigation only', async () => {
    mockFetch({ '/api/v1/me': () => json(200, ME) });
    renderApp('/learner/dashboard');
    await screen.findByRole('navigation', { name: 'Learner portal' });
    expect(navLabels('Learner portal')).toEqual([
      'Dashboard',
      'My Training',
      'Assessments',
      'My Progress',
      'Profile',
      'Settings',
      'Calendar',
    ]);
    expect(screen.queryByRole('navigation', { name: 'Admin portal' })).toBeNull();
  });

  it('a learner typing an admin URL is denied and pointed back to the learner portal', async () => {
    const fetch = mockFetch({ '/api/v1/me': () => json(200, ME) });
    for (const path of ['/admin', '/admin/dashboard', '/admin/users', '/admin/audit']) {
      cleanup();
      renderApp(path);
      expect(
        await screen.findByRole('heading', { name: "You don't have access to this area" }),
      ).toBeTruthy();
      expect(
        screen.getByRole('link', { name: 'Go to the learner portal' }).getAttribute('href'),
      ).toBe('/learner/dashboard');
      expect(screen.queryByRole('navigation', { name: 'Admin portal' })).toBeNull();
    }
    // No admin API is called for a learner.
    expect(fetch.mock.calls.some(([u]) => !String(u).startsWith('/api/v1/me'))).toBe(false);
  });

  it('the guard follows the server-reported portals, not the role list alone', async () => {
    mockFetch({ '/api/v1/me': () => json(200, { ...ADMIN, portals: [], homePath: '/' }) });
    renderApp('/admin/dashboard');
    expect(
      await screen.findByRole('heading', { name: "You don't have access to this area" }),
    ).toBeTruthy();
  });
});

describe('audit events page', () => {
  it('lists real audit events and filters by action', async () => {
    const fetch = mockFetch({
      '/api/v1/me': () => json(200, ADMIN),
      '/api/v1/users': () => json(200, emptyPage),
      '/api/v1/audit-events': (url) =>
        json(200, {
          data:
            url.searchParams.get('action') === 'user.role_changed'
              ? []
              : [
                  {
                    id: '7',
                    at: '2026-11-04T09:00:00.000Z',
                    actorId: ADMIN.id,
                    action: 'auth.login',
                    targetType: 'user',
                    targetId: ADMIN.id,
                    reason: null,
                    metadata: null,
                    requestId: 'r',
                    ipHash: 'x',
                  },
                ],
          page: { nextCursor: null, limit: 25 },
        }),
    });
    renderApp('/admin/audit');
    expect(await screen.findByRole('heading', { level: 1, name: 'Audit Events' })).toBeTruthy();
    expect(await screen.findByRole('cell', { name: 'Signed in' })).toBeTruthy();
    const select = screen.getByLabelText('Filter by action');
    fireEvent.change(select, { target: { value: 'user.role_changed' } });
    expect(await screen.findByText('No audit events')).toBeTruthy();
    expect(fetch.mock.calls.some(([u]) => String(u).includes('action=user.role_changed'))).toBe(
      true,
    );
  });
});
