/**
 * MOCKED tests: server startup and graceful shutdown with a fake lifecycle
 * (no PostgreSQL or Redis). Uses a real HTTP listener on an ephemeral port.
 */
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { startServer, type Lifecycle } from '../src/bootstrap.js';
import { parseEnv } from '../src/config/env.js';

const fakeLifecycle = (): Lifecycle & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    connect: vi.fn(() => {
      calls.push('connect');
    }),
    probeDatabase: vi.fn(async () => ({ status: 'up' })),
    disconnect: vi.fn(async () => {
      calls.push('disconnect');
    }),
  };
};

const app = () =>
  createApp({
    readinessChecks: {
      database: async () => ({ status: 'up' }),
      redis: async () => ({ status: 'up' }),
    },
  });

describe('startup and shutdown', () => {
  it('connects dependencies, serves requests, then shuts down cleanly', async () => {
    const lifecycle = fakeLifecycle();
    const running = await startServer({ port: 0, app: app(), lifecycle });
    expect(lifecycle.calls).toEqual(['connect']);

    const res = await fetch(`http://127.0.0.1:${running.port}/api/v1/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();

    await running.shutdown('SIGTERM');
    expect(lifecycle.calls).toEqual(['connect', 'disconnect']);
    expect(running.server.listening).toBe(false);
  });

  it('is idempotent when shutdown is requested twice', async () => {
    const lifecycle = fakeLifecycle();
    const running = await startServer({ port: 0, app: app(), lifecycle });
    await Promise.all([running.shutdown('SIGINT'), running.shutdown('SIGTERM')]);
    expect(lifecycle.disconnect).toHaveBeenCalledTimes(1);
  });

  it('force-closes keep-alive connections after the drain timeout', async () => {
    const lifecycle = fakeLifecycle();
    const running = await startServer({ port: 0, app: app(), lifecycle, drainTimeoutMs: 50 });
    await fetch(`http://127.0.0.1:${running.port}/api/v1/health`, { keepalive: true });
    const started = Date.now();
    await running.shutdown();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('fails to start when the port is already in use', async () => {
    const first = await startServer({ port: 0, app: app(), lifecycle: fakeLifecycle() });
    await expect(
      startServer({ port: first.port, app: app(), lifecycle: fakeLifecycle() }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
    await first.shutdown();
  });
});

describe('environment validation', () => {
  it('requires database, Redis and OIDC settings in production, naming only the variables', () => {
    expect(() =>
      parseEnv({ NODE_ENV: 'production', APP_ORIGIN: 'https://portal.uni.ac.lk' }),
    ).toThrowError(
      /^Invalid environment configuration: DATABASE_URL, REDIS_URL, OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI$/,
    );
  });

  it('requires HTTPS URLs in production (Secure cookies)', () => {
    const run = () =>
      parseEnv({
        NODE_ENV: 'production',
        APP_ORIGIN: 'http://portal.uni.ac.lk',
        DATABASE_URL: 'postgresql://u:p@h/db',
        REDIS_URL: 'rediss://h:6380',
        OIDC_ISSUER: 'http://idp.uni.ac.lk/realms/x',
        OIDC_CLIENT_ID: 'educomply-api',
        OIDC_CLIENT_SECRET: 'top-secret-value',
        OIDC_REDIRECT_URI: 'https://portal.uni.ac.lk/api/v1/auth/oidc/callback',
      });
    expect(run).toThrowError(/APP_ORIGIN, OIDC_ISSUER$/);
    expect(run).not.toThrowError(/top-secret-value/);
  });

  it('requires all OIDC settings once any is set', () => {
    expect(() => parseEnv({ OIDC_ISSUER: 'http://localhost:8080/realms/educomply' })).toThrowError(
      /OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI/,
    );
  });

  it('uses Secure cookies for HTTPS portals and in production', () => {
    expect(parseEnv({}).cookieSecure).toBe(false);
    expect(parseEnv({ APP_ORIGIN: 'https://portal.uni.ac.lk' }).cookieSecure).toBe(true);
  });

  it('rejects a malformed REDIS_URL without echoing it', () => {
    const run = () => parseEnv({ REDIS_URL: 'http://user:topsecret@cache' });
    expect(run).toThrowError(/REDIS_URL/);
    expect(run).not.toThrowError(/topsecret/);
  });

  it('parses CORS_ORIGINS into an exact allow-list, defaulting to APP_ORIGIN', () => {
    expect(parseEnv({}).corsOrigins).toEqual(['http://localhost:5173']);
    expect(
      parseEnv({ CORS_ORIGINS: 'https://portal.uni.ac.lk, http://localhost:5173/' }).corsOrigins,
    ).toEqual(['https://portal.uni.ac.lk', 'http://localhost:5173']);
  });

  it('rejects CORS origins with paths or wildcards', () => {
    expect(() => parseEnv({ CORS_ORIGINS: 'https://portal.uni.ac.lk/app' })).toThrowError(
      /CORS_ORIGINS/,
    );
    expect(() => parseEnv({ CORS_ORIGINS: '*' })).toThrowError(/CORS_ORIGINS/);
  });

  it('validates the Redis key prefix', () => {
    expect(parseEnv({}).REDIS_KEY_PREFIX).toBe('educomply:');
    expect(() => parseEnv({ REDIS_KEY_PREFIX: 'NoColon' })).toThrowError(/REDIS_KEY_PREFIX/);
  });
});
