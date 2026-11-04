// @vitest-environment jsdom
/**
 * Authentication in the portal (MOCKED fetch, real components and routes).
 * Includes the Task 4 regression: after Keycloak login the portal must show the user from
 * GET /api/v1/me, not a static "Not signed in" placeholder.
 */
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, ME, mockFetch, renderApp, unauthorized } from '@/test/harness';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('authenticated portal', () => {
  it('shows the signed-in user from GET /me (regression: not a "Not signed in" placeholder)', async () => {
    const fetch = mockFetch({ '/api/v1/me': () => json(200, ME) });
    renderApp('/learner/dashboard');

    expect(await screen.findByRole('link', { name: /Lea Learner \(LEARNER\)/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Welcome back, Lea!' })).toBeTruthy();
    expect(screen.queryByText('Not signed in')).toBeNull();
    // Same-origin call that sends the HttpOnly session cookie.
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/me',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('logs out with the CSRF token, then continues to the Keycloak logout URL', async () => {
    const idpLogoutUrl =
      'http://localhost:8080/realms/educomply/protocol/openid-connect/logout?id_token_hint=x';
    const fetch = mockFetch({
      '/api/v1/me': () => json(200, ME),
      '/api/v1/auth/logout': () => json(200, { idpLogoutUrl }),
    });
    const { navigate } = renderApp('/learner/dashboard');

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(idpLogoutUrl));
    const [, init] = fetch.mock.calls.find(([url]) => url === '/api/v1/auth/logout')!;
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(init!.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-token-123' });
    // After logout the protected page is replaced by the sign-in screen.
    expect(await screen.findByRole('heading', { name: 'Sign in to continue' })).toBeTruthy();
  });

  it('shows the signed-in user on the landing page with a link into the portal', async () => {
    mockFetch({
      '/api/v1/me': () => json(200, ME),
      '/api/v1/health': () => json(200, { status: 'ok', version: '0.1.0' }),
    });
    renderApp('/');
    expect(await screen.findByText('Lea Learner')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to learner portal' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Sign in with institutional account/ })).toBeNull();
  });
});

describe('protected routes', () => {
  it('anonymous users see a sign-in screen (no learner content) that returns to the page', async () => {
    mockFetch({ '/api/v1/me': unauthorized });
    renderApp('/learner/training?x=1');

    expect(await screen.findByRole('heading', { name: 'Sign in to continue' })).toBeTruthy();
    expect(screen.queryByText('Assigned training courses')).toBeNull();
    const link = screen.getByRole('link', { name: 'Sign in with institutional account' });
    expect(link.getAttribute('href')).toBe(
      '/api/v1/auth/login?returnTo=%2Flearner%2Ftraining%3Fx%3D1',
    );
  });

  it('shows a loading state while the session is checked', async () => {
    let release!: (r: Response) => void;
    mockFetch({ '/api/v1/me': () => new Promise<Response>((r) => (release = r)) });
    renderApp('/learner/dashboard');
    expect(screen.getByRole('status').textContent).toContain('Checking your session');
    await act(async () => release(json(200, ME)));
    expect(await screen.findByRole('heading', { name: 'Welcome back, Lea!' })).toBeTruthy();
  });

  it('reports an unavailable session service (503) without pretending to be signed out', async () => {
    mockFetch({
      '/api/v1/me': () => json(503, { code: 'SERVICE_UNAVAILABLE', status: 503, title: 'x' }),
    });
    renderApp('/learner/dashboard');
    expect(
      await screen.findByRole('heading', { name: 'Sign-in service unavailable' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('blocks learners from the admin portal', async () => {
    mockFetch({ '/api/v1/me': () => json(200, ME) });
    renderApp('/admin/users');
    expect(
      await screen.findByRole('heading', { name: "You don't have access to this area" }),
    ).toBeTruthy();
  });

  it('lets administrators into the admin portal', async () => {
    mockFetch({ '/api/v1/me': () => json(200, { ...ME, roles: ['ADMIN'] }) });
    renderApp('/admin/users');
    expect(await screen.findByRole('heading', { level: 1, name: 'Users & Roles' })).toBeTruthy();
  });
});

describe('session expiration', () => {
  it('when the server session expires, returning to the tab shows "Your session has expired"', async () => {
    let meResponse: () => Response = () => json(200, ME);
    mockFetch({ '/api/v1/me': () => meResponse() });
    renderApp('/learner/dashboard');
    expect(await screen.findByRole('heading', { name: 'Welcome back, Lea!' })).toBeTruthy();

    meResponse = unauthorized; // e.g. 8 h idle timeout or logout in another tab
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(await screen.findByRole('heading', { name: 'Your session has expired' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Welcome back, Lea!' })).toBeNull();
  });
});
