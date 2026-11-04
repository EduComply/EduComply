import { config } from '@/config';
import { ApiError, type Problem } from '@/lib/api';

export type Role = 'LEARNER' | 'ADMIN' | 'REVIEWER';

/** Portals the server allows for the user's database role (GET /me). */
export type Portal = 'admin' | 'learner';

/** GET /me response (Initial API Design: user, roles and CSRF token). */
export interface Me {
  id: string;
  displayName: string;
  email: string;
  roles: Role[];
  /** Decided by the backend from the database role: which portals the user may open… */
  portals: Portal[];
  /** …and the default page after sign-in (ADMIN/REVIEWER → admin portal, LEARNER → learner). */
  homePath: string;
  userType: string;
  department: string | null;
  institutionalId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
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

/**
 * Full-page navigation target that starts institutional sign-in. Without `returnTo` the
 * backend sends the user to their role's home page after the callback; with a deep link it
 * returns there only if the user's role may open that portal.
 */
export function loginUrl(returnTo?: string): string {
  const base = `${config.apiBaseUrl}/auth/login`;
  return returnTo ? `${base}?returnTo=${encodeURIComponent(returnTo)}` : base;
}
