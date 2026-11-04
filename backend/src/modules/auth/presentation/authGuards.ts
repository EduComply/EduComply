import type { RequestHandler } from 'express';
import { Errors } from '../../../shared/http/problem.js';
import {
  rateLimit,
  RateLimitPolicies,
  type RateLimitStore,
} from '../../../shared/http/rateLimit.js';
import { errorCode } from '../../../shared/infrastructure/dependency.js';
import { logger } from '../../../shared/logger.js';
import type { RoleName } from '../../users/domain/roles.js';
import {
  tokensMatch,
  type AuthenticatedSession,
  type AuthService,
} from '../application/authService.js';
import { clearSessionCookies, SESSION_COOKIE, type CookiePolicy } from './cookies.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by requireAuth for authenticated requests. */
    auth?: AuthenticatedSession;
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface AuthGuards {
  /** Session required; CSRF token required for state-changing methods; per-user rate limit. */
  authenticated: RequestHandler[];
  requireRole(...roles: RoleName[]): RequestHandler;
}

export function createAuthGuards(
  service: AuthService,
  policy: CookiePolicy,
  rateLimitStore: RateLimitStore,
): AuthGuards {
  const requireSession: RequestHandler = async (req, res, next) => {
    const sessionId: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      next(Errors.sessionExpired());
      return;
    }

    let auth: AuthenticatedSession | null;
    try {
      auth = await service.resolveSession(sessionId);
    } catch (err) {
      // Fail closed: without the session store we cannot authenticate anyone.
      req.log?.warn({ code: errorCode(err) }, 'Session lookup failed');
      next(Errors.serviceUnavailable('Sign-in sessions are temporarily unavailable.'));
      return;
    }
    if (!auth) {
      clearSessionCookies(res, policy);
      next(Errors.sessionExpired('Your session has expired. Sign in again.'));
      return;
    }

    if (
      UNSAFE_METHODS.has(req.method) &&
      !tokensMatch(req.get('x-csrf-token'), auth.session.csrfToken)
    ) {
      (req.log ?? logger).warn(
        { userId: auth.user.id, method: req.method, path: req.path },
        'CSRF token rejected',
      );
      next(Errors.csrfInvalid());
      return;
    }

    req.auth = auth;
    next();
  };

  // "All other routes: 300 / min per user" (API Design §4). Availability first.
  const perUserLimit = rateLimit({
    ...RateLimitPolicies.default,
    store: rateLimitStore,
    key: (req) => req.auth?.user.id,
  });

  const requireRole =
    (...roles: RoleName[]): RequestHandler =>
    (req, _res, next) => {
      const user = req.auth?.user;
      if (!user) {
        next(Errors.sessionExpired());
        return;
      }
      if (!roles.includes(user.role)) {
        (req.log ?? logger).warn(
          { userId: user.id, role: user.role, required: roles, method: req.method, path: req.path },
          'Authorization denied',
        );
        next(Errors.forbidden());
        return;
      }
      next();
    };

  return { authenticated: [requireSession, perUserLimit], requireRole };
}
