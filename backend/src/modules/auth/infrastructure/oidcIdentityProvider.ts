import * as oidc from 'openid-client';
import { logger } from '../../../shared/logger.js';
import { errorCode } from '../../../shared/infrastructure/dependency.js';
import {
  IdentityProviderError,
  type AuthorizationRequest,
  type CallbackChecks,
  type IdentityProvider,
  type VerifiedIdentity,
} from '../application/ports.js';

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scopes: string;
  /** Seconds to wait for the provider before treating it as unavailable. */
  timeoutSeconds?: number;
}

const isLocalHttp = (url: URL) =>
  url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

/**
 * OpenID Connect adapter (openid-client v6). Discovery is lazy and cached; on failure it is
 * retried on the next login. The library validates the ID token signature, issuer, audience
 * (client_id), expiry, nonce and state, and the PKCE verifier is sent with the code exchange.
 */
export class OidcIdentityProvider implements IdentityProvider {
  private config: Promise<oidc.Configuration> | undefined;

  constructor(private readonly settings: OidcSettings) {}

  private configuration(): Promise<oidc.Configuration> {
    if (!this.config) {
      const issuer = new URL(this.settings.issuer);
      this.config = oidc
        .discovery(
          issuer,
          this.settings.clientId,
          { client_secret: this.settings.clientSecret, id_token_signed_response_alg: 'RS256' },
          oidc.ClientSecretBasic(this.settings.clientSecret),
          {
            timeout: this.settings.timeoutSeconds ?? 5,
            // Plain HTTP is allowed only for a local development provider (Keycloak on localhost).
            ...(isLocalHttp(issuer) ? { execute: [oidc.allowInsecureRequests] } : {}),
          },
        )
        .catch((err: unknown) => {
          this.config = undefined;
          logger.warn({ idpCode: errorCode(err) }, 'OIDC discovery failed');
          throw new IdentityProviderError('UNAVAILABLE', 'OIDC discovery failed');
        });
    }
    return this.config;
  }

  async authorizationUrl(request: AuthorizationRequest): Promise<URL> {
    const config = await this.configuration();
    return oidc.buildAuthorizationUrl(config, {
      redirect_uri: this.settings.redirectUri,
      scope: this.settings.scopes,
      response_type: 'code',
      code_challenge: request.codeChallenge,
      code_challenge_method: 'S256',
      state: request.state,
      nonce: request.nonce,
    });
  }

  async completeAuthorization(callbackUrl: URL, checks: CallbackChecks): Promise<VerifiedIdentity> {
    const config = await this.configuration();
    let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
    try {
      tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: checks.codeVerifier,
        expectedState: checks.state,
        expectedNonce: checks.nonce,
        idTokenExpected: true,
      });
    } catch (err) {
      const code = errorCode(err);
      logger.warn({ idpCode: code }, 'OIDC code exchange or ID token validation failed');
      const unavailable = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|TimeoutError|AbortError/.test(code);
      throw new IdentityProviderError(
        unavailable ? 'UNAVAILABLE' : 'INVALID_RESPONSE',
        'OIDC callback validation failed',
      );
    }
    const claims = tokens.claims();
    if (!claims) throw new IdentityProviderError('INVALID_RESPONSE', 'No ID token claims');

    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const identity: VerifiedIdentity = { issuer: claims.iss, subject: claims.sub };
    const email = str(claims.email);
    const joined = [str(claims.given_name), str(claims.family_name)].filter(Boolean).join(' ');
    const name = str(claims.name) ?? (joined || undefined);
    const userType = str(claims.user_type);
    if (email) identity.email = email;
    if (typeof claims.email_verified === 'boolean') identity.emailVerified = claims.email_verified;
    if (name) identity.name = name;
    if (userType) identity.userType = userType;
    if (tokens.id_token) identity.idToken = tokens.id_token;
    // Access and refresh tokens are deliberately discarded: the API does not call the IdP
    // on the user's behalf, and tokens must never reach the browser.
    return identity;
  }

  async logoutUrl(idTokenHint?: string): Promise<string | null> {
    const config = await this.configuration();
    if (!config.serverMetadata().end_session_endpoint) return null;
    return oidc
      .buildEndSessionUrl(config, {
        post_logout_redirect_uri: this.settings.postLogoutRedirectUri,
        client_id: this.settings.clientId,
        ...(idTokenHint ? { id_token_hint: idTokenHint } : {}),
      })
      .toString();
  }
}

/** Placeholder used when OIDC is not configured: every login reports NOT_CONFIGURED. */
export class UnconfiguredIdentityProvider implements IdentityProvider {
  private fail(): never {
    throw new IdentityProviderError('NOT_CONFIGURED', 'OIDC is not configured');
  }
  async authorizationUrl(): Promise<URL> {
    this.fail();
  }
  async completeAuthorization(): Promise<VerifiedIdentity> {
    this.fail();
  }
  async logoutUrl(): Promise<string | null> {
    return null;
  }
}
