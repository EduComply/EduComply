import { config } from '@/config';
import { ApiError, type Problem } from '@/lib/api';

export type Role = 'LEARNER' | 'ADMIN' | 'REVIEWER';

/** GET /me response (Initial API Design: user, roles and CSRF token). */
export interface Me {
  id: string;
  displayName: string;
  email: string;
  roles: Role[];
  userType: string;
  lastLoginAt: string | null;
  csrfToken: string;
}

/**
 * Loads the signed-in user. The HttpOnly ec_session cookie is sent automatically
 * (same origin through the Vite proxy); JavaScript never sees it.
 * Returns null when there is no valid session (401).
 */
export async function fetchMe(signal?: AbortSignal): Promise<Me | null> {
  const res = await fetch(`${config.apiBaseUrl}/me`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new ApiError((await res.json().catch(() => null)) as Problem);
  return (await res.json()) as Me;
}

/** Ends the EduComply session; returns the identity-provider logout URL, if any. */
export async function logout(csrfToken: string): Promise<string | null> {
  const res = await fetch(`${config.apiBaseUrl}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken },
  });
  // 401 means the session was already gone: treat as signed out.
  if (res.status === 401) return null;
  if (!res.ok) throw new ApiError((await res.json().catch(() => null)) as Problem);
  const body = (await res.json()) as { idpLogoutUrl: string | null };
  return body.idpLogoutUrl;
}

/** Full-page navigation target that starts institutional sign-in. */
export function loginUrl(returnTo: string): string {
  return `${config.apiBaseUrl}/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}
