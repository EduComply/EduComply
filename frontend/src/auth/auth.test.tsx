// @vitest-environment jsdom
/**
 * Regression tests for browser authentication state (MOCKED fetch, real components).
 * Bug: after a successful Keycloak login the portal still showed "Not signed in" because
 * the top bar was a static placeholder and nothing called GET /api/v1/me.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthProvider } from './AuthProvider';
import type { Me } from './session';

const ME: Me = {
  id: '0190f0a0-0000-7000-8000-000000000001',
  displayName: 'Lea Learner',
  email: 'learner1@educomply.test',
  roles: ['LEARNER'],
  userType: 'STUDENT',
  lastLoginAt: null,
  csrfToken: 'csrf-token-123',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function mockFetch(routes: Record<string, () => Response>) {
  const fn = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = typeof input === 'string' ? input : input.toString();
    const handler = routes[path];
    if (!handler) throw new Error(`unexpected fetch ${path}`);
    return handler();
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderAt(path: string, navigate = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider navigate={navigate}>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
  return { navigate };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('portal authentication state', () => {
  it('shows the signed-in user from GET /me instead of "Not signed in" (regression)', async () => {
    const fetch = mockFetch({ '/api/v1/me': () => json(200, ME) });
    renderAt('/learner/dashboard');

    expect(await screen.findByText('Lea Learner')).toBeTruthy();
    expect(screen.getByText('LEARNER')).toBeTruthy();
    expect(screen.queryByText('Not signed in')).toBeNull();

    // Same-origin call that sends the HttpOnly session cookie.
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/me',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('shows "Not signed in" with a sign-in link that returns to the current page when /me is 401', async () => {
    mockFetch({
      '/api/v1/me': () =>
        json(401, { code: 'SESSION_EXPIRED', status: 401, title: 'Unauthorized' }),
    });
    renderAt('/admin/users');

    expect(await screen.findByText('Not signed in')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link.getAttribute('href')).toBe('/api/v1/auth/login?returnTo=%2Fadmin%2Fusers');
  });

  it('reports an unavailable session service (e.g. 503) without pretending to be signed out', async () => {
    mockFetch({
      '/api/v1/me': () => json(503, { code: 'SERVICE_UNAVAILABLE', status: 503, title: 'x' }),
    });
    renderAt('/learner/dashboard');
    expect(await screen.findByText('Session service unavailable')).toBeTruthy();
  });

  it('signs out with the CSRF token, then continues to the Keycloak logout URL', async () => {
    const idpLogoutUrl =
      'http://localhost:8080/realms/educomply/protocol/openid-connect/logout?id_token_hint=x';
    const fetch = mockFetch({
      '/api/v1/me': () => json(200, ME),
      '/api/v1/auth/logout': () => json(200, { idpLogoutUrl }),
    });
    const { navigate } = renderAt('/learner/dashboard');

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(idpLogoutUrl));
    const [, init] = fetch.mock.calls.find(([url]) => url === '/api/v1/auth/logout')!;
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(init!.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-token-123' });
    expect(await screen.findByText('Not signed in')).toBeTruthy();
  });

  it('shows the signed-in user on the landing page after the callback redirect', async () => {
    mockFetch({
      '/api/v1/me': () => json(200, ME),
      '/api/v1/health': () => json(200, { status: 'ok', version: '0.1.0' }),
    });
    renderAt('/');
    expect(await screen.findByText('Lea Learner')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Sign in with institutional account/ })).toBeNull();
  });
});
