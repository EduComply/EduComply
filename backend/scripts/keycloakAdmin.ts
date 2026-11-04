/**
 * Minimal Keycloak Admin REST client for development tooling and live tests.
 * Credentials come from KEYCLOAK_ADMIN_USERNAME / KEYCLOAK_ADMIN_PASSWORD; nothing is logged.
 */
export interface KeycloakAdminConfig {
  baseUrl: string;
  realm: string;
  username: string;
  password: string;
}

export function keycloakConfigFromEnv(env: NodeJS.ProcessEnv = process.env): KeycloakAdminConfig {
  const issuer = env.OIDC_ISSUER;
  const username = env.KEYCLOAK_ADMIN_USERNAME;
  const password = env.KEYCLOAK_ADMIN_PASSWORD;
  if (!issuer || !username || !password) {
    throw new Error(
      'OIDC_ISSUER, KEYCLOAK_ADMIN_USERNAME and KEYCLOAK_ADMIN_PASSWORD must be set (npm run auth:init-env)',
    );
  }
  const url = new URL(issuer);
  const match = /^\/realms\/([^/]+)\/?$/.exec(url.pathname);
  if (!match) throw new Error('OIDC_ISSUER must look like http://host:8080/realms/<realm>');
  return { baseUrl: url.origin, realm: decodeURIComponent(match[1]!), username, password };
}

async function adminToken(cfg: KeycloakAdminConfig): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: cfg.username,
      password: cfg.password,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Keycloak admin login failed (HTTP ${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export interface NewKeycloakUser {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

/** Creates an enabled user with a verified email and a permanent password; returns its id. */
export async function createKeycloakUser(
  cfg: KeycloakAdminConfig,
  user: NewKeycloakUser,
): Promise<string> {
  const token = await adminToken(cfg);
  const res = await fetch(`${cfg.baseUrl}/admin/realms/${cfg.realm}/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      enabled: true,
      emailVerified: true,
      requiredActions: [],
      credentials: [{ type: 'password', value: user.password, temporary: false }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 409) throw new Error('A Keycloak user with that username or email exists');
  if (res.status !== 201) throw new Error(`Keycloak user creation failed (HTTP ${res.status})`);
  const id = res.headers.get('location')?.split('/').pop();
  if (!id) throw new Error('Keycloak did not return the new user id');
  return id;
}

export async function findKeycloakUserId(
  cfg: KeycloakAdminConfig,
  username: string,
): Promise<string | null> {
  const token = await adminToken(cfg);
  const res = await fetch(
    `${cfg.baseUrl}/admin/realms/${cfg.realm}/users?exact=true&username=${encodeURIComponent(username)}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`Keycloak user lookup failed (HTTP ${res.status})`);
  const users = (await res.json()) as Array<{ id: string }>;
  return users[0]?.id ?? null;
}

export async function deleteKeycloakUser(cfg: KeycloakAdminConfig, id: string): Promise<void> {
  const token = await adminToken(cfg);
  const res = await fetch(`${cfg.baseUrl}/admin/realms/${cfg.realm}/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status !== 204 && res.status !== 404) {
    throw new Error(`Keycloak user deletion failed (HTTP ${res.status})`);
  }
}
