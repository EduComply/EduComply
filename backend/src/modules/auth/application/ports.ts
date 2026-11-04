import type { RoleName } from '../../users/domain/roles.js';
import type { LoginState, SessionData } from '../domain/session.js';

/** Identity asserted by the provider after full OIDC validation (signature, iss, aud, nonce…). */
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  /** Optional institutional claim mapped to USER.user_type. */
  userType?: string;
  /** Raw ID token, kept server-side only for logout. */
  idToken?: string;
}

export interface AuthorizationRequest {
  state: string;
  nonce: string;
  codeChallenge: string;
}

export interface CallbackChecks {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export type IdentityProviderErrorKind = 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'INVALID_RESPONSE';

export class IdentityProviderError extends Error {
  constructor(
    public readonly kind: IdentityProviderErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'IdentityProviderError';
  }
}

/** Port to the institutional identity provider (OIDC now; SAML adapter later). */
export interface IdentityProvider {
  authorizationUrl(request: AuthorizationRequest): Promise<URL>;
  /** Exchanges the code (PKCE) and validates the ID token; throws IdentityProviderError. */
  completeAuthorization(callbackUrl: URL, checks: CallbackChecks): Promise<VerifiedIdentity>;
  /** RP-initiated logout URL, or null if the provider does not support it. */
  logoutUrl(idTokenHint?: string): Promise<string | null>;
}

/** Application user as seen by authentication and authorization. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleName;
  userType: string;
  department: string | null;
  institutionalId: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequestContext {
  requestId?: string;
  ip?: string;
}

export type LoginDenialReason = 'ACCOUNT_DISABLED' | 'IDENTITY_CONFLICT';

export type SyncResult =
  { ok: true; user: AuthUser; created: boolean } | { ok: false; reason: LoginDenialReason };

/** Port to the user store (PostgreSQL in the app, in-memory in tests). */
export interface UserDirectory {
  /** Find-or-create the user for a verified identity, link it, stamp login and audit. */
  syncFromIdentity(identity: VerifiedIdentity, ctx: RequestContext): Promise<SyncResult>;
  findById(userId: string): Promise<AuthUser | null>;
  recordLogout(userId: string, ctx: RequestContext): Promise<void>;
}

export interface SessionRepository {
  /** Stores the session under a new random id and returns that id. */
  create(data: SessionData): Promise<string>;
  get(sessionId: string): Promise<SessionData | null>;
  /** Sliding idle timeout. */
  touch(sessionId: string): Promise<void>;
  destroy(sessionId: string): Promise<void>;
}

export interface LoginStateRepository {
  save(state: string, data: LoginState): Promise<void>;
  /** One-time read: returns and deletes. */
  take(state: string): Promise<LoginState | null>;
}
