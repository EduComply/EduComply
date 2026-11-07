import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { COMPOSE_PROJECT, REPO_ROOT } from './config.js';

const run = promisify(execFile);

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  /** What to do about it (shown for warn/fail). */
  fix?: string;
}

// ── Docker ───────────────────────────────────────────────────────────

export interface ContainerInfo {
  name: string;
  project: string;
  state: string;
  status: string;
  /** Host ports published by the container. */
  hostPorts: number[];
}

/** Extracts host ports from a `docker ps` Ports string, e.g. "0.0.0.0:5173->5173/tcp, [::]:5173->5173/tcp". */
export function parsePublishedPorts(ports: string): number[] {
  const found = new Set<number>();
  for (const match of ports.matchAll(/:(\d+)->\d+\/tcp/g)) found.add(Number(match[1]));
  return [...found];
}

/** Parses `docker ps --format '{{json .}}'` (one JSON object per line). */
export function parseDockerPs(output: string): ContainerInfo[] {
  return output
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith('{'))
    .map((l) => JSON.parse(l) as Record<string, string>)
    .map((c) => ({
      name: c.Names ?? '',
      project: /com\.docker\.compose\.project=([^,]+)/.exec(c.Labels ?? '')?.[1] ?? '',
      state: c.State ?? '',
      status: c.Status ?? '',
      hostPorts: parsePublishedPorts(c.Ports ?? ''),
    }));
}

export async function dockerAvailable(): Promise<CheckResult> {
  try {
    const { stdout } = await run('docker', ['info', '--format', '{{.ServerVersion}}'], {
      timeout: 8_000,
      windowsHide: true,
    });
    return { name: 'Docker', status: 'ok', detail: `engine ${stdout.trim()}` };
  } catch {
    return {
      name: 'Docker',
      status: 'fail',
      detail: 'Docker engine is not reachable',
      fix: 'Start Docker Desktop and wait until it reports "Engine running".',
    };
  }
}

export async function runningContainers(): Promise<ContainerInfo[]> {
  try {
    const { stdout } = await run('docker', ['ps', '--format', '{{json .}}'], {
      timeout: 8_000,
      windowsHide: true,
    });
    return parseDockerPs(stdout);
  } catch {
    return [];
  }
}

/** Health of this project's compose services (other projects are never touched). */
export async function composeServices(): Promise<
  Array<{ service: string; state: string; health: string }>
> {
  try {
    const { stdout } = await run(
      'docker',
      [
        'compose',
        '-p',
        COMPOSE_PROJECT,
        '--profile',
        'app',
        'ps',
        '--all',
        '--format',
        '{{json .}}',
      ],
      { cwd: REPO_ROOT, timeout: 10_000, windowsHide: true },
    );
    return stdout
      .split(/\r?\n/)
      .filter((l) => l.trim().startsWith('{'))
      .map((l) => JSON.parse(l) as Record<string, string>)
      .map((s) => ({ service: s.Service ?? '', state: s.State ?? '', health: s.Health ?? '' }));
  } catch {
    return [];
  }
}

// ── Redis ────────────────────────────────────────────────────────────

/** PING with a hard deadline; never retries (node-redis reconnects are disabled here). */
export async function checkRedis(url: string | undefined, timeoutMs = 2_500): Promise<CheckResult> {
  if (!url) {
    return {
      name: 'Redis',
      status: 'fail',
      detail: 'REDIS_URL is not set',
      fix: 'Set REDIS_URL in .env (see .env.example).',
    };
  }
  const { createClient } = await import('redis');
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: timeoutMs, reconnectStrategy: false },
  });
  client.on('error', () => undefined);
  const started = Date.now();
  try {
    await Promise.race([
      client.connect().then(() => client.ping()),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)),
    ]);
    return { name: 'Redis', status: 'ok', detail: `PONG in ${Date.now() - started} ms` };
  } catch (err) {
    const code = (err as { code?: string }).code ?? (err as Error).message;
    return {
      name: 'Redis',
      status: 'fail',
      detail: `not reachable (${code})`,
      fix: 'Start local dependencies: npm run dev:deps',
    };
  } finally {
    await client.destroy?.();
  }
}

// ── Keycloak ─────────────────────────────────────────────────────────

/** Fetches OIDC discovery and verifies the issuer, with a hard deadline. */
export async function checkKeycloak(
  issuer: string | undefined,
  timeoutMs = 3_000,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckResult> {
  if (!issuer) {
    return {
      name: 'Keycloak',
      status: 'fail',
      detail: 'OIDC_ISSUER is not set',
      fix: 'Run: npm run auth:init-env',
    };
  }
  const started = Date.now();
  try {
    const res = await fetchImpl(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok)
      throw Object.assign(new Error(`HTTP ${res.status}`), { code: `HTTP_${res.status}` });
    const meta = (await res.json()) as { issuer?: string };
    if (meta.issuer !== issuer.replace(/\/$/, '')) {
      return {
        name: 'Keycloak',
        status: 'fail',
        detail: 'discovery issuer does not match OIDC_ISSUER',
        fix: 'Check KC_HOSTNAME in docker-compose.yml and OIDC_ISSUER in .env.',
      };
    }
    return {
      name: 'Keycloak',
      status: 'ok',
      detail: `realm discovery in ${Date.now() - started} ms`,
    };
  } catch (err) {
    const e = err as { name?: string; code?: string; cause?: { code?: string } };
    const code = e.name === 'TimeoutError' ? 'TIMEOUT' : (e.cause?.code ?? e.code ?? 'ERROR');
    return {
      name: 'Keycloak',
      status: 'fail',
      detail: `not reachable (${code})`,
      fix: 'Start local dependencies: npm run dev:deps (first start takes ~30 s).',
    };
  }
}
