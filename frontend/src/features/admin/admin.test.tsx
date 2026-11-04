// @vitest-environment jsdom
/**
 * Admin portal (MOCKED fetch with the real API contracts; real routes and components).
 * The backend authorisation itself is covered by backend/tests (auth, db and live suites).
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/auth/session';
import { json, ME, mockFetch, renderApp, unauthorized, type RouteHandler } from '@/test/harness';
import type { AdminUser, AuditEvent } from './adminApi';

const ADMIN: Me = {
  ...ME,
  id: 'admin-0001',
  displayName: 'Ada Admin',
  email: 'ada@uni.test',
  roles: ['ADMIN'],
  portals: ['admin'],
  homePath: '/admin/dashboard',
};
const REVIEWER: Me = { ...ADMIN, id: 'rev-0001', displayName: 'Rae Reviewer', roles: ['REVIEWER'] };

const user = (over: Partial<AdminUser>): AdminUser => ({
  id: '0190f0a0-0000-7000-8000-00000000000a',
  displayName: 'Lea Learner',
  email: 'learner1@educomply.test',
  roles: ['LEARNER'],
  userType: 'STUDENT',
  department: null,
  institutionalId: 'LIT-2026-0148',
  isActive: true,
  lastLoginAt: '2026-11-04T08:30:00.000Z',
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-04T08:30:00.000Z',
  ...over,
});
const LEA = user({});
const BO = user({
  id: '0190f0a0-0000-7000-8000-00000000000b',
  displayName: 'Bo Inactive',
  email: 'bo@uni.test',
  roles: ['REVIEWER'],
  isActive: false,
  lastLoginAt: null,
});
const page = <T,>(data: T[], nextCursor: string | null = null) => ({
  data,
  page: { nextCursor, limit: 25 },
});
const EVENTS: AuditEvent[] = [
  {
    id: '12',
    at: '2026-11-04T09:00:00.000Z',
    actorId: ADMIN.id,
    action: 'user.role_changed',
    targetType: 'user',
    targetId: LEA.id,
    reason: 'Sprint 1 reviewer',
    metadata: { from: 'LEARNER', to: 'REVIEWER' },
    requestId: 'r1',
    ipHash: 'x',
  },
  {
    id: '11',
    at: '2026-11-04T08:30:00.000Z',
    actorId: LEA.id,
    action: 'auth.login',
    targetType: 'user',
    targetId: LEA.id,
    reason: null,
    metadata: null,
    requestId: 'r0',
    ipHash: 'x',
  },
];

function setup(me: Me, extra: Record<string, RouteHandler> = {}) {
  return mockFetch({
    '/api/v1/me': () => json(200, me),
    '/api/v1/users': () => json(200, page([LEA, BO])),
    '/api/v1/audit-events': () => json(200, page(EVENTS)),
    [`/api/v1/users/${LEA.id}`]: () => json(200, LEA),
    ...extra,
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('access control', () => {
  it('learners are rejected from every admin route', async () => {
    setup(ME);
    renderApp('/admin/dashboard');
    expect(
      await screen.findByRole('heading', { name: "You don't have access to this area" }),
    ).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Admin portal' })).toBeNull();
  });

  it('anonymous users must sign in', async () => {
    mockFetch({ '/api/v1/me': unauthorized });
    renderApp('/admin/users');
    expect(await screen.findByRole('heading', { name: 'Sign in to continue' })).toBeTruthy();
  });

  it('reviewers get the reviewer navigation and cannot open ADMIN-only pages', async () => {
    const fetch = setup(REVIEWER);
    renderApp('/admin/dashboard');
    const nav = await screen.findByRole('navigation', { name: 'Admin portal' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Dashboard', 'Monitoring', 'Reports', 'Audit Events', 'Profile']);
    expect(screen.getByText('Reviewer')).toBeTruthy();
    // Reviewers never call the ADMIN-only users API from the dashboard.
    expect(fetch.mock.calls.some(([u]) => String(u).startsWith('/api/v1/users'))).toBe(false);
  });

  it('a reviewer opening /admin/users directly sees the access-denied screen', async () => {
    setup(REVIEWER);
    renderApp('/admin/users');
    expect(await screen.findByText('This section requires the ADMIN role.')).toBeTruthy();
  });
});

describe('admin dashboard', () => {
  it('shows live user figures, real recent activity, shortcuts and labelled demo stats', async () => {
    setup(ADMIN);
    renderApp('/admin/dashboard');
    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeTruthy();
    expect(screen.getByText('Administrator')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText('Registered users').nextSibling?.textContent).toBe('2'),
    );
    expect(screen.getByText('Courses (demo)')).toBeTruthy();
    expect(
      screen.getAllByRole('note').some((n) => n.textContent?.includes('Demonstration data')),
    ).toBe(true);
    expect(await screen.findByText('Role changed: LEARNER → REVIEWER')).toBeTruthy();
    expect(screen.getByText(/Ada Admin ·/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /User management/ }).getAttribute('href')).toBe(
      '/admin/users',
    );
    expect(screen.getByRole('link', { name: /Training management/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Assessment management/ })).toBeTruthy();
  });

  it('shows an error state with retry when activity cannot load', async () => {
    let fail = true;
    setup(ADMIN, {
      '/api/v1/audit-events': () =>
        fail
          ? json(500, { code: 'INTERNAL_ERROR', status: 500, title: 'x' })
          : json(200, page(EVENTS)),
    });
    renderApp('/admin/dashboard');
    expect(await screen.findByRole('heading', { name: 'Activity unavailable' })).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Role changed: LEARNER → REVIEWER')).toBeTruthy();
  });
});

describe('users', () => {
  it('lists real users with roles and account status', async () => {
    setup(ADMIN);
    renderApp('/admin/users');
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Lea Learner')).toBeTruthy();
    expect(within(table).getByText('learner1@educomply.test')).toBeTruthy();
    expect(within(table).getByText('REVIEWER')).toBeTruthy();
    expect(within(table).getByText('Inactive')).toBeTruthy();
    expect(within(table).getByText('Never')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View Lea Learner' }).getAttribute('href')).toBe(
      `/admin/users/${LEA.id}`,
    );
  });

  it('sends search and role filters to GET /users', async () => {
    const fetch = setup(ADMIN);
    renderApp('/admin/users');
    await screen.findByRole('table');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search by name or email' }), {
      target: { value: 'lea' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by role' }), {
      target: { value: 'ADMIN' },
    });
    await waitFor(() =>
      expect(fetch.mock.calls.map(([u]) => String(u))).toContain(
        '/api/v1/users?q=lea&role=ADMIN&limit=25',
      ),
    );
  });

  it('shows an empty state and an error state', async () => {
    let mode: 'empty' | 'error' = 'empty';
    setup(ADMIN, {
      '/api/v1/users': () =>
        mode === 'empty'
          ? json(200, page([]))
          : json(503, { code: 'SERVICE_UNAVAILABLE', status: 503, title: 'x', detail: 'Down' }),
    });
    const view = renderApp('/admin/users');
    expect(await screen.findByRole('heading', { name: 'No users found' })).toBeTruthy();
    view.unmount();
    mode = 'error';
    renderApp('/admin/users');
    expect(await screen.findByRole('heading', { name: 'Users could not be loaded' })).toBeTruthy();
  });

  it('a 401 from the API (expired session) shows the session-expired screen', async () => {
    let meStatus = 200;
    mockFetch({
      '/api/v1/me': () => (meStatus === 200 ? json(200, ADMIN) : unauthorized()),
      '/api/v1/users': () => {
        meStatus = 401;
        return unauthorized();
      },
    });
    renderApp('/admin/users');
    expect(await screen.findByRole('heading', { name: 'Your session has expired' })).toBeTruthy();
  });

  it('learners page lists only learners with learner columns', async () => {
    const fetch = setup(ADMIN, { '/api/v1/users': () => json(200, page([LEA])) });
    renderApp('/admin/learners');
    const table = await screen.findByRole('table');
    expect(within(table).getByText('LIT-2026-0148')).toBeTruthy();
    expect(within(table).getByText('Enrolments arrive in Sprint 2')).toBeTruthy();
    expect(fetch.mock.calls.map(([u]) => String(u))).toContain(
      '/api/v1/users?role=LEARNER&limit=25',
    );
    expect(screen.queryByRole('combobox', { name: 'Filter by role' })).toBeNull();
  });
});

describe('user detail and role changes', () => {
  it('shows real user details and account activity', async () => {
    setup(ADMIN);
    renderApp(`/admin/users/${LEA.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'User details' })).toBeTruthy();
    expect(await screen.findByText('Lea Learner')).toBeTruthy();
    expect(screen.getByText('LIT-2026-0148')).toBeTruthy();
    expect(screen.getByText('Student')).toBeTruthy();
    expect(await screen.findByText('“Sprint 1 reviewer”', { exact: false })).toBeTruthy();
  });

  it('changes a role after confirmation, sending the CSRF token and reason', async () => {
    const patched = { ...LEA, roles: ['REVIEWER'], updatedAt: '2026-11-04T10:00:00.000Z' };
    const fetch = setup(ADMIN, {
      [`/api/v1/users/${LEA.id}/roles`]: () => json(200, patched),
    });
    renderApp(`/admin/users/${LEA.id}`);
    await screen.findByText('Lea Learner');

    const submit = screen.getByRole('button', { name: 'Change role…' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /REVIEWER/ }));
    fireEvent.change(screen.getByLabelText(/Reason for the change/), {
      target: { value: 'Sprint 1 reviewer' },
    });
    fireEvent.click(submit);

    const dialog = screen.getByRole('alertdialog', { name: 'Confirm role change' });
    expect(dialog.textContent).toContain('from LEARNER to REVIEWER');
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make REVIEWER' }));

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByText(/Role changed from LEARNER to REVIEWER/)).toBeTruthy();
    const [, init] = fetch.mock.calls.find(([, i]) => i?.method === 'PATCH')!;
    expect(init).toMatchObject({ method: 'PATCH', credentials: 'include' });
    expect(init!.headers).toMatchObject({
      'X-CSRF-Token': 'csrf-token-123',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init!.body))).toEqual({
      roles: ['REVIEWER'],
      reason: 'Sprint 1 reviewer',
    });
  });

  it('cancelling the confirmation sends nothing; ADMIN grants show a warning', async () => {
    const fetch = setup(ADMIN);
    renderApp(`/admin/users/${LEA.id}`);
    await screen.findByText('Lea Learner');
    fireEvent.click(screen.getByRole('radio', { name: /ADMIN/ }));
    fireEvent.change(screen.getByLabelText(/Reason for the change/), {
      target: { value: 'Needs admin' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change role…' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Grant only to trusted staff');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it.each([
    ['CSRF_INVALID', 403, 'Your security token expired'],
    ['LAST_ADMIN', 409, 'last active administrator'],
    ['FORBIDDEN', 403, 'You do not have permission'],
  ])(
    'shows the API error %s without changing the displayed role',
    async (code, status, message) => {
      setup(ADMIN, {
        [`/api/v1/users/${LEA.id}/roles`]: () => json(status, { code, status, title: 'x' }),
      });
      renderApp(`/admin/users/${LEA.id}`);
      await screen.findByText('Lea Learner');
      fireEvent.click(screen.getByRole('radio', { name: /REVIEWER/ }));
      fireEvent.change(screen.getByLabelText(/Reason for the change/), {
        target: { value: 'Valid reason' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Change role…' }));
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Make REVIEWER' }),
      );
      expect((await screen.findByRole('alert')).textContent).toContain(message);
      expect(screen.getByText('(current)').closest('label')?.textContent).toContain('LEARNER');
    },
  );

  it('administrators cannot change their own role', async () => {
    const SELF = user({ id: ADMIN.id, displayName: 'Ada Admin', roles: ['ADMIN'] });
    setup(ADMIN, { [`/api/v1/users/${ADMIN.id}`]: () => json(200, SELF) });
    renderApp(`/admin/users/${ADMIN.id}`);
    expect(await screen.findByText(/You cannot change your own role/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change role…' })).toBeNull();
  });

  it('shows not found for an unknown user', async () => {
    setup(ADMIN, {
      '/api/v1/users/missing': () =>
        json(404, { code: 'NOT_FOUND', status: 404, title: 'Not Found' }),
    });
    renderApp('/admin/users/missing');
    expect(await screen.findByRole('heading', { name: 'User not found' })).toBeTruthy();
  });
});

describe('admin shell', () => {
  it('sidebar lists all admin sections for ADMIN and marks the active page', async () => {
    setup(ADMIN);
    renderApp('/admin/dashboard');
    const nav = await screen.findByRole('navigation', { name: 'Admin portal' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual([
      'Dashboard',
      'User Management',
      'Learner Management',
      'Courses',
      'Videos',
      'Question Banks',
      'Monitoring',
      'Certificates',
      'Reports',
      'Audit Events',
      'Profile',
    ]);
    fireEvent.click(within(nav).getByRole('link', { name: 'Courses' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Courses' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Courses' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('responsive menu toggles and the avatar opens the administrator profile', async () => {
    setup(ADMIN);
    renderApp('/admin/dashboard');
    const menu = await screen.findByRole('button', { name: 'Open menu' });
    fireEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('link', { name: /Ada Admin \(ADMIN\)/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Administrator profile' }),
    ).toBeTruthy();
    expect(screen.getAllByText('ada@uni.test').length).toBeGreaterThan(0);
  });

  it('logs out with the CSRF token', async () => {
    const idpLogoutUrl = 'http://localhost:8080/realms/educomply/protocol/openid-connect/logout';
    const fetch = setup(ADMIN, { '/api/v1/auth/logout': () => json(200, { idpLogoutUrl }) });
    const { navigate } = renderApp('/admin/dashboard');
    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(idpLogoutUrl));
    const [, init] = fetch.mock.calls.find(([u]) => u === '/api/v1/auth/logout')!;
    expect(init!.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-token-123' });
  });
});

describe('later-sprint modules are clearly unavailable (no fabricated data)', () => {
  it.each([
    ['/admin/courses', 'Courses', 'New course'],
    ['/admin/question-banks', 'Question Banks', 'New question bank'],
  ])('%s shows disabled create actions and a sprint note', async (path, title, action) => {
    setup(ADMIN);
    renderApp(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeTruthy();
    expect((screen.getByRole('button', { name: action }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Available in Sprint 2.')).toBeTruthy();
  });

  it('videos page has a disabled upload and storage information', async () => {
    setup(ADMIN);
    renderApp('/admin/videos');
    expect(await screen.findByText('Uploads are not available yet.')).toBeTruthy();
    expect((screen.getByLabelText('Choose file') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/private Amazon S3 bucket/)).toBeTruthy();
  });

  it.each([
    ['/admin/monitoring', 'No monitoring flags'],
    ['/admin/certificates', 'No certificates issued'],
  ])('%s shows an empty state', async (path, empty) => {
    setup(ADMIN);
    renderApp(path);
    expect(await screen.findByRole('heading', { name: empty })).toBeTruthy();
  });

  it('reports show no statistics and disabled exports', async () => {
    setup(REVIEWER);
    renderApp('/admin/reports');
    expect(await screen.findByRole('heading', { name: 'Training completion' })).toBeTruthy();
    const exports = screen.getAllByRole('button', { name: /Export (CSV|PDF)/ });
    expect(exports.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.queryByText(/\d+%/)).toBeNull();
  });
});
