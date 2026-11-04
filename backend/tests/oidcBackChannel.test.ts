import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { backChannelFetch } from '../src/modules/auth/infrastructure/oidcIdentityProvider.js';

const issuer = 'http://localhost:8080/realms/educomply';

afterEach(() => vi.unstubAllGlobals());

describe('OIDC back-channel (OIDC_INTERNAL_URL, Docker networking)', () => {
  it('sends issuer-origin requests to the internal host, keeping path, query and options', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const f = backChannelFetch(issuer, 'http://keycloak:8080');
    const options = {
      method: 'POST',
      body: 'grant_type=authorization_code',
      headers: {},
      redirect: 'manual',
    } as Parameters<typeof f>[1];

    await f('http://localhost:8080/realms/educomply/protocol/openid-connect/token?x=1', options);

    const [target, passed] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(target.href).toBe(
      'http://keycloak:8080/realms/educomply/protocol/openid-connect/token?x=1',
    );
    expect(passed).toBe(options);
  });

  it('leaves requests to any other origin unchanged', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await backChannelFetch(issuer, 'http://keycloak:8080')('https://idp.example.org/jwks', {
      method: 'GET',
      headers: {},
      redirect: 'manual',
    } as Parameters<ReturnType<typeof backChannelFetch>>[1]);
    expect((fetchMock.mock.calls[0] as unknown as [URL])[0].href).toBe(
      'https://idp.example.org/jwks',
    );
  });

  it('is optional, and must be https in production like the other OIDC URLs', () => {
    expect(parseEnv({}).OIDC_INTERNAL_URL).toBeUndefined();
    expect(parseEnv({ OIDC_INTERNAL_URL: 'http://keycloak:8080' }).OIDC_INTERNAL_URL).toBe(
      'http://keycloak:8080',
    );
    expect(() =>
      parseEnv({ NODE_ENV: 'production', OIDC_INTERNAL_URL: 'http://keycloak:8080' }),
    ).toThrowError(/OIDC_INTERNAL_URL/);
  });
});
