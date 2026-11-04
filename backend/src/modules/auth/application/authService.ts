import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { safeReturnTo, type SessionData } from '../domain/session.js';
import {
  IdentityProviderError,
  type AuthUser,
  type IdentityProvider,
  type LoginStateRepository,
  type RequestContext,
  type SessionRepository,
  type UserDirectory,
} from './ports.js';

/** Why a login did not complete. Sent to the portal as ?authError=<code>; never includes details. */
export type LoginErrorCode =
  | 'LOGIN_CANCELLED'
  | 'LOGIN_EXPIRED'
  | 'LOGIN_FAILED'
  | 'IDP_UNAVAILABLE'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_DISABLED'
  | 'IDENTITY_CONFLICT';

export class LoginError extends Error {
  constructor(
    public readonly code: LoginErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LoginError';
  }
}

export interface AuthenticatedSession {
  sessionId: string;
  session: SessionData;
  user: AuthUser;
}

export interface AuthServiceDeps {
  idp: IdentityProvider;
  users: UserDirectory;
  sessions: SessionRepository;
  loginStates: LoginStateRepository;
}

const base64url = (bytes: Buffer) => bytes.toString('base64url');
export const randomToken = (bytes = 32) => base64url(randomBytes(bytes));
export const pkceChallenge = (verifier: string) =>
  base64url(createHash('sha256').update(verifier).digest());

/** Constant-time comparison for CSRF and state tokens. */
export function tokensMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Backend-for-frontend authentication (Initial API Design §4): the API performs the OIDC
 * Authorization Code flow with PKCE, state and nonce, keeps tokens server-side and gives the
 * browser only an opaque session id.
 */
export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  /** Step 1: create one-time login state and the provider authorization URL. */
  async startLogin(returnTo: unknown): Promise<{ redirectUrl: URL; state: string }> {
    const state = randomToken();
    const nonce = randomToken();
    const codeVerifier = randomToken(48);
    await this.deps.loginStates.save(state, {
      codeVerifier,
      nonce,
      returnTo: safeReturnTo(returnTo),
      createdAt: new Date().toISOString(),
    });
    try {
      const redirectUrl = await this.deps.idp.authorizationUrl({
        state,
        nonce,
        codeChallenge: pkceChallenge(codeVerifier),
      });
      return { redirectUrl, state };
    } catch (err) {
      await this.deps.loginStates.take(state).catch(() => undefined);
      throw toLoginError(err);
    }
  }

  /**
   * Step 2: validate the callback, sync the user, and issue a NEW session id
   * (any previous session is destroyed — prevents session fixation).
   */
  async completeLogin(input: {
    callbackUrl: URL;
    /** State value from the browser-bound login cookie. */
    cookieState: string | undefined;
    previousSessionId: string | undefined;
    ctx: RequestContext;
  }): Promise<{ sessionId: string; session: SessionData; user: AuthUser; returnTo: string }> {
    const params = input.callbackUrl.searchParams;
    const state = params.get('state') ?? '';
    // One-time use: the state is deleted whether or not the rest succeeds.
    const loginState = state ? await this.deps.loginStates.take(state) : null;

    if (params.get('error')) {
      throw new LoginError(
        params.get('error') === 'access_denied' ? 'LOGIN_CANCELLED' : 'LOGIN_FAILED',
        'The identity provider returned an error.',
      );
    }
    if (!loginState) {
      throw new LoginError('LOGIN_EXPIRED', 'Unknown, expired or already-used login state.');
    }
    if (!tokensMatch(state, input.cookieState)) {
      // State not issued to this browser (login CSRF / injected callback).
      throw new LoginError('LOGIN_FAILED', 'Login state does not match this browser.');
    }

    let identity;
    try {
      identity = await this.deps.idp.completeAuthorization(input.callbackUrl, {
        state,
        nonce: loginState.nonce,
        codeVerifier: loginState.codeVerifier,
      });
    } catch (err) {
      throw toLoginError(err);
    }

    if (!identity.email || identity.emailVerified !== true) {
      throw new LoginError('EMAIL_NOT_VERIFIED', 'The identity provider did not verify an email.');
    }

    const result = await this.deps.users.syncFromIdentity(identity, input.ctx);
    if (!result.ok) throw new LoginError(result.reason, 'Login denied.');

    if (input.previousSessionId) {
      await this.deps.sessions.destroy(input.previousSessionId).catch(() => undefined);
    }
    const session: SessionData = {
      userId: result.user.id,
      csrfToken: randomToken(),
      issuer: identity.issuer,
      ...(identity.idToken ? { idToken: identity.idToken } : {}),
      createdAt: new Date().toISOString(),
    };
    const sessionId = await this.deps.sessions.create(session);
    return { sessionId, session, user: result.user, returnTo: loginState.returnTo };
  }

  /**
   * Resolves a session id to an active user and refreshes the idle timeout.
   * Returns null (and destroys the session) if it expired or the user is no longer active.
   * Propagates store errors so callers can fail closed.
   */
  async resolveSession(sessionId: string): Promise<AuthenticatedSession | null> {
    const session = await this.deps.sessions.get(sessionId);
    if (!session) return null;
    const user = await this.deps.users.findById(session.userId);
    if (!user || !user.isActive) {
      await this.deps.sessions.destroy(sessionId);
      return null;
    }
    await this.deps.sessions.touch(sessionId);
    return { sessionId, session, user };
  }

  /** Destroys the session and returns the provider single-logout URL where supported. */
  async logout(auth: AuthenticatedSession, ctx: RequestContext): Promise<string | null> {
    await this.deps.sessions.destroy(auth.sessionId);
    await this.deps.users.recordLogout(auth.user.id, ctx);
    try {
      return await this.deps.idp.logoutUrl(auth.session.idToken);
    } catch {
      return null; // local logout still succeeded
    }
  }
}

function toLoginError(err: unknown): LoginError {
  if (err instanceof LoginError) return err;
  if (err instanceof IdentityProviderError) {
    return err.kind === 'INVALID_RESPONSE'
      ? new LoginError('LOGIN_FAILED', 'The identity provider response was invalid.')
      : new LoginError('IDP_UNAVAILABLE', 'The identity provider is unavailable.');
  }
  throw err;
}
