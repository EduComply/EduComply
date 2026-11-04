/** Server-side session held in Redis. The browser only ever sees the opaque session id. */
export interface SessionData {
  userId: string;
  /** Synchroniser token; state-changing requests must echo it in X-CSRF-Token. */
  csrfToken: string;
  /** Issuer the user signed in with. */
  issuer: string;
  /** ID token kept server-side only, as id_token_hint for single logout. Never sent to the browser. */
  idToken?: string;
  createdAt: string;
}

/** Short-lived state between /auth/login and /auth/oidc/callback (one-time use). */
export interface LoginState {
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  createdAt: string;
}

const MAX_RETURN_TO_LENGTH = 512;
const BASE = 'http://return-to.invalid';

/**
 * Accepts only same-site relative paths ("/learner/dashboard?x=1") to prevent open
 * redirects. Absolute URLs, protocol-relative ("//evil"), backslash tricks and control
 * characters fall back to "/".
 */
export function safeReturnTo(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_RETURN_TO_LENGTH) {
    return fallback;
  }
  // eslint-disable-next-line no-control-regex
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) {
    return fallback;
  }
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
