import { randomUUID } from 'node:crypto';
import { pkceChallenge } from '../../src/modules/auth/application/authService.js';
import {
  IdentityProviderError,
  type AuthorizationRequest,
  type CallbackChecks,
  type IdentityProvider,
  type VerifiedIdentity,
} from '../../src/modules/auth/application/ports.js';

export interface FakeLogin {
  subject: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

/**
 * MOCK identity provider. Behaves like an OIDC provider for the checks the app relies on:
 * codes are single-use and bound to the state, and the nonce and PKCE verifier must match
 * what was sent in the authorization request.
 */
export class FakeIdentityProvider implements IdentityProvider {
  readonly issuer = 'https://idp.test.invalid/realms/educomply';
  unavailable = false;
  private readonly requests = new Map<string, { nonce: string; codeChallenge: string }>();
  private readonly codes = new Map<string, { state: string; login: FakeLogin }>();

  async authorizationUrl(request: AuthorizationRequest): Promise<URL> {
    if (this.unavailable) throw new IdentityProviderError('UNAVAILABLE', 'down');
    this.requests.set(request.state, {
      nonce: request.nonce,
      codeChallenge: request.codeChallenge,
    });
    const url = new URL(`${this.issuer}/protocol/openid-connect/auth`);
    url.searchParams.set('state', request.state);
    url.searchParams.set('nonce', request.nonce);
    url.searchParams.set('code_challenge', request.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url;
  }

  /** Simulates the user authenticating at the provider; returns the authorization code. */
  issueCode(state: string, login: FakeLogin): string {
    const code = randomUUID();
    this.codes.set(code, { state, login });
    return code;
  }

  async completeAuthorization(callbackUrl: URL, checks: CallbackChecks): Promise<VerifiedIdentity> {
    if (this.unavailable) throw new IdentityProviderError('UNAVAILABLE', 'down');
    const code = callbackUrl.searchParams.get('code') ?? '';
    const issued = this.codes.get(code);
    this.codes.delete(code);
    const request = this.requests.get(checks.state);
    if (
      !issued ||
      !request ||
      issued.state !== checks.state ||
      request.nonce !== checks.nonce ||
      pkceChallenge(checks.codeVerifier) !== request.codeChallenge
    ) {
      throw new IdentityProviderError('INVALID_RESPONSE', 'invalid code, nonce or PKCE');
    }
    const { login } = issued;
    return {
      issuer: this.issuer,
      subject: login.subject,
      ...(login.email !== undefined ? { email: login.email } : {}),
      emailVerified: login.emailVerified ?? true,
      name: login.name ?? 'Test User',
      idToken: `fake-id-token-${login.subject}`,
    };
  }

  async logoutUrl(idTokenHint?: string): Promise<string | null> {
    const url = new URL(`${this.issuer}/protocol/openid-connect/logout`);
    if (idTokenHint) url.searchParams.set('id_token_hint', idTokenHint);
    return url.toString();
  }
}
