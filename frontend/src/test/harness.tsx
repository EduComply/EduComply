import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { App } from '@/App';
import { AuthProvider } from '@/auth/AuthProvider';
import type { Me } from '@/auth/session';

/** MOCK /me payload (shape of the real GET /api/v1/me response). */
export const ME: Me = {
  id: '0190f0a0-0000-7000-8000-000000000001',
  displayName: 'Lea Learner',
  email: 'learner1@educomply.test',
  roles: ['LEARNER'],
  userType: 'STUDENT',
  department: null,
  institutionalId: null,
  isActive: true,
  lastLoginAt: '2026-11-04T08:30:00.000Z',
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-04T08:30:00.000Z',
  csrfToken: 'csrf-token-123',
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const unauthorized = () =>
  json(401, { code: 'SESSION_EXPIRED', status: 401, title: 'Unauthorized', type: 'x' });

/** Replaces global fetch with a router keyed by path. Unknown paths fail the test. */
export function mockFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const fn = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = typeof input === 'string' ? input : input.toString();
    const handler = routes[path];
    if (!handler) throw new Error(`unexpected fetch ${path}`);
    return handler();
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Renders the real application routes at `path` with the real AuthProvider. */
export function renderApp(path: string, navigate = vi.fn()) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider navigate={navigate}>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
  return { ...view, navigate };
}

/** jsdom has no media playback; stub it so the prototype player can be exercised. */
export function stubMedia() {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event('pause'));
  });
}
