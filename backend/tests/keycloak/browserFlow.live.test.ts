/**
 * LIVE browser-path test: the real Vite dev server (frontend config + /api proxy) in front of
 * the real API, real Keycloak and real Redis — the same hops a browser makes:
 *   portal → /api/v1/auth/login (via Vite) → Keycloak login form → callback (via Vite)
 *   → cookies on the portal origin → GET /api/v1/me (via Vite) → logout.
 * Users are kept in memory so the shared PostgreSQL database is not modified.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { startServer, type RunningServer } from '../../src/bootstrap.js';
import { createDefaultModules } from '../../src/composition.js';
import { env } from '../../src/config/env.js';
import {
  connectRedis,
  disconnectRedis,
  getRedis,
} from '../../src/shared/infrastructure/redis/redis.js';
import {
  createKeycloakUser,
  deleteKeycloakUser,
  keycloakConfigFromEnv,
} from '../../scripts/keycloakAdmin.js';
import { MemoryUsers } from '../support/memoryUsers.js';

const kc = keycloakConfigFromEnv();
const tag = randomUUID().slice(0, 8);
const user = {
  username: `browser-${tag}`,
  email: `browser-${tag}@educomply.test`,
  firstName: 'Bea',
  lastName: 'Browser',
  password: `${randomBytes(18).toString('base64url')}!9a`,
};

let api: RunningServer;
let vite: ViteDevServer;
let portal: string;
let keycloakUserId: string | undefined;

/** Minimal browser cookie jar per origin (enough for host-only cookies). */
class Browser {
  private jars = new Map<string, Map<string, string>>();
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const { host } = new URL(url);
    const jar = this.jars.get(host) ?? new Map<string, string>();
    this.jars.set(host, jar);
    const res = await fetch(url, {
      ...init,
      redirect: 'manual',
      headers: {
        ...(init.headers as Record<string, string>),
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
      },
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const [name, ...value] = pair!.split('=');
      const expired = attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a.trim()));
      if (expired) jar.delete(name!.trim());
      else jar.set(name!.trim(), value.join('='));
    }
    return res;
  }
  cookies(origin: string) {
    return this.jars.get(new URL(origin).host) ?? new Map<string, string>();
  }
}

beforeAll(async () => {
  connectRedis();
  const deadline = Date.now() + 10_000;
  while (!getRedis().isReady) {
    if (Date.now() > deadline) throw new Error('Redis not ready');
    await new Promise((r) => setTimeout(r, 100));
  }
  keycloakUserId = await createKeycloakUser(kc, user);

  const app = createApp({ modules: createDefaultModules({ users: new MemoryUsers() }) });
  api = await startServer({
    port: 0,
    app,
    lifecycle: {
      connect: () => undefined,
      probeDatabase: async () => ({ status: 'skipped' }),
      disconnect: async () => undefined,
    },
  });

  // The real frontend config, with its /api proxy pointed at this test API.
  const frontendRoot = fileURLToPath(new URL('../../../frontend/', import.meta.url));
  vite = await createViteServer({
    root: frontendRoot,
    configFile: `${frontendRoot}vite.config.ts`,
    logLevel: 'silent',
    server: {
      port: 0,
      strictPort: false,
      proxy: { '/api': { target: `http://127.0.0.1:${api.port}`, changeOrigin: false } },
    },
  });
  await vite.listen();
  portal = `http://localhost:${(vite.httpServer!.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await vite?.close();
  await api?.shutdown();
  if (keycloakUserId) await deleteKeycloakUser(kc, keycloakUserId);
  await disconnectRedis();
});

describe('live browser flow through the Vite proxy', () => {
  it('serves the portal and reports "not signed in" (401) before login', async () => {
    const browser = new Browser();
    const page = await browser.fetch(`${portal}/learner/dashboard`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<div id="root">');
    expect((await browser.fetch(`${portal}/api/v1/me`)).status).toBe(401);
  });

  it('after Keycloak login, the portal origin holds ec_session and GET /api/v1/me returns the user', async () => {
    const browser = new Browser();

    // 1. Portal "Sign in" link → API (through Vite) → 302 to Keycloak
    const start = await browser.fetch(
      `${portal}/api/v1/auth/login?returnTo=%2Flearner%2Fdashboard`,
    );
    expect(start.status).toBe(302);
    const authorizationUrl = start.headers.get('location')!;
    expect(browser.cookies(portal).has('ec_login')).toBe(true);

    // 2. Keycloak login page + form POST
    const loginPage = await browser.fetch(authorizationUrl);
    const html = await loginPage.text();
    const formTag = /<form\b[^>]*\bid="kc-form-login"[^>]*>/.exec(html)?.[0];
    const action = /\baction="([^"]+)"/.exec(formTag ?? '')?.[1]?.replace(/&amp;/g, '&');
    const submit = await browser.fetch(action!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: user.username,
        password: user.password,
        credentialId: '',
      }),
    });
    expect(submit.status).toBe(302);
    const callback = new URL(submit.headers.get('location')!);
    expect(callback.pathname).toBe('/api/v1/auth/oidc/callback');

    // 3. Browser follows the redirect to the callback on the portal origin (via Vite proxy)
    const done = await browser.fetch(`${portal}${callback.pathname}${callback.search}`);
    expect(done.status).toBe(302);
    expect(done.headers.get('location')).toBe(`${env.APP_ORIGIN}/learner/dashboard`);
    expect(browser.cookies(portal).has('ec_session')).toBe(true);
    expect(browser.cookies(portal).has('ec_csrf')).toBe(true);
    expect(browser.cookies(portal).has('ec_login')).toBe(false);

    // 4. What the React AuthProvider does on page load
    const me = await browser.fetch(`${portal}/api/v1/me`, {
      headers: { Accept: 'application/json' },
    });
    expect(me.status).toBe(200);
    const body = (await me.json()) as {
      email: string;
      displayName: string;
      roles: string[];
      csrfToken: string;
    };
    expect(body).toMatchObject({
      email: user.email,
      displayName: 'Bea Browser',
      roles: ['LEARNER'],
    });
    expect(body.csrfToken).toBe(browser.cookies(portal).get('ec_csrf'));

    // 5. Sign out (CSRF header), session gone, Keycloak logout URL returned
    const out = await browser.fetch(`${portal}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': body.csrfToken, Accept: 'application/json' },
    });
    expect(out.status).toBe(200);
    const { idpLogoutUrl } = (await out.json()) as { idpLogoutUrl: string };
    expect(new URL(idpLogoutUrl).searchParams.get('post_logout_redirect_uri')).toBe(
      env.postLogoutRedirectUri,
    );
    expect(browser.cookies(portal).has('ec_session')).toBe(false);
    expect((await browser.fetch(`${portal}/api/v1/me`)).status).toBe(401);
  });
});
