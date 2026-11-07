import type { CookieOptions, Response } from 'express';
import { RedisTtl } from '../../../shared/infrastructure/redis/keys.js';

/** Cookie names from the Initial API Design §4. */
export const SESSION_COOKIE = 'ec_session';
export const CSRF_COOKIE = 'ec_csrf';
/** Binds the OIDC state to the browser that started the login. */
export const LOGIN_STATE_COOKIE = 'ec_login';

export const AUTH_PATH = '/api/v1/auth';

export interface CookiePolicy {
  /** Secure flag: always in production / HTTPS; off only for http://localhost development. */
  secure: boolean;
}

const base = (policy: CookiePolicy): CookieOptions => ({
  secure: policy.secure,
  sameSite: 'lax', // sent on top-level navigation back from the IdP, not on cross-site POSTs
  path: '/',
});

/**
 * ec_session: opaque id, HttpOnly (no JavaScript access). A browser-session cookie;
 * the 8-hour idle timeout is enforced server-side in Redis.
 */
export function setSessionCookies(
  res: Response,
  policy: CookiePolicy,
  sessionId: string,
  csrfToken: string,
): void {
  res.cookie(SESSION_COOKIE, sessionId, { ...base(policy), httpOnly: true });
  // Readable by the portal so it can echo it in X-CSRF-Token (also returned by GET /me).
  res.cookie(CSRF_COOKIE, csrfToken, { ...base(policy), httpOnly: false });
}

export function clearSessionCookies(res: Response, policy: CookiePolicy): void {
  res.clearCookie(SESSION_COOKIE, { ...base(policy), httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...base(policy), httpOnly: false });
}

export function setLoginStateCookie(res: Response, policy: CookiePolicy, state: string): void {
  res.cookie(LOGIN_STATE_COOKIE, state, {
    ...base(policy),
    httpOnly: true,
    path: AUTH_PATH,
    maxAge: RedisTtl.oidcState * 1000,
  });
}

export function clearLoginStateCookie(res: Response, policy: CookiePolicy): void {
  res.clearCookie(LOGIN_STATE_COOKIE, { ...base(policy), httpOnly: true, path: AUTH_PATH });
}
