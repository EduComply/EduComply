import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (tools/dev → ../..). */
export const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export type ServiceName = 'frontend' | 'backend' | 'redis' | 'keycloak';

/**
 * Fixed development ports. They are NOT negotiable: Keycloak's registered redirect URIs
 * and APP_ORIGIN depend on 5173, so the tooling never switches ports silently.
 */
export const PORTS: Record<ServiceName, number> = {
  frontend: 5173,
  backend: 3000,
  redis: 6379,
  keycloak: 8080,
};

/** Docker Compose project that owns Redis and Keycloak (docker-compose.yml `name:`). */
export const COMPOSE_PROJECT = 'educomply';

/** Session file written by `npm run dev` (git-ignored). */
export const SESSION_FILE = join(REPO_ROOT, '.dev', 'session.json');

export const ENV_FILE = join(REPO_ROOT, '.env');
