import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  rateLimit,
  RateLimitPolicies,
  type RateLimitStore,
} from '../../../shared/http/rateLimit.js';
import { validate } from '../../../shared/http/validate.js';
import { errorCode } from '../../../shared/infrastructure/dependency.js';
import { logger } from '../../../shared/logger.js';
import { LoginError, type AuthService, type LoginErrorCode } from '../application/authService.js';
import type { AuthGuards } from './authGuards.js';
import {
  clearLoginStateCookie,
  clearSessionCookies,
  LOGIN_STATE_COOKIE,
  SESSION_COOKIE,
  setLoginStateCookie,
  setSessionCookies,
  type CookiePolicy,
} from './cookies.js';

export interface AuthRouterDeps {
  service: AuthService;
  guards: AuthGuards;
  cookiePolicy: CookiePolicy;
  rateLimitStore: RateLimitStore;
  /** Portal origin users are returned to, e.g. http://localhost:5173 */
  appOrigin: string;
  /** Registered redirect URI; the callback URL is rebuilt from it, never from the Host header. */
  redirectUri: string;
}

const LoginQuery = z.strictObject({
  returnTo: z.string().max(512).optional(),
  idp: z.string().max(64).optional(),
});

export function authRouter(deps: AuthRouterDeps): Router {
  const router = Router();
  const portal = deps.appOrigin.replace(/\/$/, '');
  const ctx = (req: Request) => ({
    ...(typeof req.id === 'string' ? { requestId: req.id } : {}),
    ...(req.ip ? { ip: req.ip } : {}),
  });

  /** Browser-facing failures go back to the portal with a code only — never details. */
  const fail = (req: Request, res: Response, code: LoginErrorCode | 'SERVICE_UNAVAILABLE') => {
    clearLoginStateCookie(res, deps.cookiePolicy);
    res.redirect(302, `${portal}/?authError=${code}`);
  };

  // "/auth/*: 20 / min per IP" (API Design §4). Fail closed: no Redis means no login state anyway.
  router.use(
    '/auth',
    rateLimit({ ...RateLimitPolicies.auth, store: deps.rateLimitStore, failOpen: false }),
  );

  /** GET /auth/login?returnTo=/learner — redirects to the IdP with PKCE, state and nonce. */
  router.get('/auth/login', validate({ query: LoginQuery }), async (req, res) => {
    try {
      const { returnTo } = req.validated.query as z.infer<typeof LoginQuery>;
      const { redirectUrl, state } = await deps.service.startLogin(returnTo);
      setLoginStateCookie(res, deps.cookiePolicy, state);
      res.set('Cache-Control', 'no-store').redirect(302, redirectUrl.toString());
    } catch (err) {
      if (err instanceof LoginError) {
        req.log.warn({ authError: err.code }, 'Login could not start');
        fail(req, res, err.code);
        return;
      }
      req.log.error({ code: errorCode(err) }, 'Login start failed');
      fail(req, res, 'SERVICE_UNAVAILABLE');
    }
  });

  /** GET /auth/oidc/callback — validates the response, syncs the user, creates the session. */
  router.get('/auth/oidc/callback', async (req, res) => {
    const callbackUrl = new URL(deps.redirectUri);
    callbackUrl.search = new URL(req.originalUrl, 'http://callback.invalid').search;
    const cookieState: unknown = req.cookies?.[LOGIN_STATE_COOKIE];
    const previous: unknown = req.cookies?.[SESSION_COOKIE];
    try {
      const result = await deps.service.completeLogin({
        callbackUrl,
        cookieState: typeof cookieState === 'string' ? cookieState : undefined,
        previousSessionId: typeof previous === 'string' ? previous : undefined,
        ctx: ctx(req),
      });
      clearLoginStateCookie(res, deps.cookiePolicy);
      setSessionCookies(res, deps.cookiePolicy, result.sessionId, result.session.csrfToken);
      req.log.info({ userId: result.user.id }, 'User signed in');
      res.set('Cache-Control', 'no-store').redirect(302, `${portal}${result.returnTo}`);
    } catch (err) {
      if (err instanceof LoginError) {
        req.log.warn({ authError: err.code }, 'Login rejected');
        fail(req, res, err.code);
        return;
      }
      req.log.error({ code: errorCode(err) }, 'Login callback failed');
      fail(req, res, 'SERVICE_UNAVAILABLE');
    }
  });

  /** POST /auth/logout — destroys the session; returns the IdP single-logout URL. */
  router.post('/auth/logout', ...deps.guards.authenticated, async (req, res) => {
    const auth = req.auth!;
    const idpLogoutUrl = await deps.service.logout(auth, ctx(req));
    clearSessionCookies(res, deps.cookiePolicy);
    (req.log ?? logger).info({ userId: auth.user.id }, 'User signed out');
    res.set('Cache-Control', 'no-store').json({ idpLogoutUrl });
  });

  return router;
}
