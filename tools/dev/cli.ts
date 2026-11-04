/**
 * EduComply development CLI (run through npm scripts):
 *   npm run dev            preflight checks, then frontend + backend under one supervisor
 *   npm run dev:doctor     full environment diagnosis (no changes made)
 *   npm run dev:deps       start Redis + Keycloak (this project only) and wait until healthy
 *   npm run dev:deps:stop  stop this project's containers (volumes kept)
 *   npm run dev:stop       stop EduComply dev servers owned by `npm run dev`
 *   npm run dev:health     check a running app (liveness, readiness, frontend proxy)
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { COMPOSE_PROJECT, PORTS, REPO_ROOT, type ServiceName } from './config.js';
import {
  checkKeycloak,
  checkRedis,
  composeServices,
  dockerAvailable,
  runningContainers,
  type CheckResult,
} from './deps.js';
import { checkEnv, loadEnv } from './env.js';
import { DIAGNOSIS_HELP, diagnoseDatabase, diagnoseWebSocket, httpsReachable } from './neon.js';
import { explainConflict, inspectPort } from './preflight.js';
import {
  ancestors,
  classifyProcess,
  clearSession,
  decideOwnership,
  isAlive,
  listProcesses,
  readSession,
  stopTree,
} from './processes.js';
import { Supervisor } from './supervisor.js';

const run = promisify(execFile);
const args = process.argv.slice(2);
const command = args[0] ?? 'dev';
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const ICON = {
  ok: '\u001b[32m✔\u001b[0m',
  warn: '\u001b[33m!\u001b[0m',
  fail: '\u001b[31m✖\u001b[0m',
};
function print(r: CheckResult) {
  console.log(`${ICON[r.status]} ${r.name}: ${r.detail}`);
  if (r.status !== 'ok' && r.fix) console.log(`    → ${r.fix}`);
}

type Transport = 'tcp' | 'websocket';

/** The transport the app will use (DATABASE_TRANSPORT, default tcp). */
function configuredTransport(): Transport {
  return process.env.DATABASE_TRANSPORT === 'websocket' ? 'websocket' : 'tcp';
}

async function databaseCheck(
  label: string,
  url: string | undefined,
  timeoutMs: number,
  transport: Transport = 'tcp',
): Promise<CheckResult> {
  const diagnose = transport === 'websocket' ? diagnoseWebSocket : diagnoseDatabase;
  // One bounded retry absorbs a Neon compute waking from suspend.
  let result = await diagnose(url, { timeoutMs });
  if (['query_timeout', 'ssl_stalled', 'ws_failed'].includes(result.diagnosis)) {
    result = await diagnose(url, { timeoutMs });
  }
  const via = transport === 'websocket' ? 'WebSocket (wss, 443)' : 'TCP 5432';
  return {
    name: label,
    status: result.diagnosis === 'ok' ? 'ok' : 'fail',
    detail:
      result.diagnosis === 'ok'
        ? `connected via ${via}, TLS verified, in ${result.latencyMs} ms (${result.host})`
        : `${result.diagnosis} at ${result.stage}${result.code ? ` [${result.code}]` : ''} — ${DIAGNOSIS_HELP[result.diagnosis]}`,
    ...(result.diagnosis === 'ok'
      ? {}
      : { fix: 'See docs/development.md → "Neon connectivity" for network options.' }),
  };
}

async function appPorts(
  services: ServiceName[],
): Promise<{ results: CheckResult[]; blocked: boolean }> {
  const results: CheckResult[] = [];
  let blocked = false;
  for (const service of services) {
    let inspection = await inspectPort(service);
    if (!inspection.probe.inUse) {
      results.push({ name: `Port ${PORTS[service]} (${service})`, status: 'ok', detail: 'free' });
      continue;
    }
    // Only orphans of a previous `npm run dev` (verified by session file + command line) are stopped.
    const orphans = inspection.owners.filter((o) => o.kind === 'orphan');
    if (
      orphans.length > 0 &&
      orphans.length === inspection.owners.length &&
      inspection.containers.length === 0
    ) {
      for (const o of orphans) {
        console.log(
          `  stopping orphaned EduComply ${service} (pid ${o.process.pid}) from a previous session`,
        );
        await stopTree(o.process.pid);
      }
      await new Promise((r) => setTimeout(r, 500));
      inspection = await inspectPort(service);
      if (!inspection.probe.inUse) {
        results.push({
          name: `Port ${PORTS[service]} (${service})`,
          status: 'ok',
          detail: 'freed (orphan stopped)',
        });
        continue;
      }
    }
    results.push(explainConflict(inspection));
    blocked = true;
  }
  return { results, blocked };
}

async function depsPortsOwnedByUs(): Promise<CheckResult[]> {
  const containers = await runningContainers();
  const out: CheckResult[] = [];
  for (const service of ['redis', 'keycloak'] as const) {
    const port = PORTS[service];
    const foreign = containers.filter(
      (c) => c.hostPorts.includes(port) && c.project !== COMPOSE_PROJECT,
    );
    if (foreign.length > 0) {
      out.push({
        name: `Port ${port} (${service})`,
        status: 'fail',
        detail: `published by another project: ${foreign.map((c) => `${c.name} (${c.project || 'no project'})`).join(', ')}`,
        fix: `Stop only that container (needs your approval): docker stop ${foreign[0]!.name}`,
      });
    }
  }
  return out;
}

/**
 * Runs npm WITHOUT a shell: when started through npm, npm_execpath is npm's own CLI script,
 * so `node npm-cli.js …` works on every platform (no npm.cmd / shell quoting on Windows).
 */
function npmCommand(npmArgs: string[]): { command: string; args: string[] } {
  const bundled = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const cli = process.env.npm_execpath ?? (existsSync(bundled) ? bundled : undefined);
  if (cli && /\.c?js$/.test(cli)) return { command: process.execPath, args: [cli, ...npmArgs] };
  // POSIX fallback (npm on PATH). Windows always ships npm-cli.js next to node.exe.
  return { command: 'npm', args: npmArgs };
}

// ── Commands ─────────────────────────────────────────────────────────

async function dev(): Promise<number> {
  const only = option('only') as 'backend' | 'frontend' | undefined;
  const services: ServiceName[] = only ? [only] : ['backend', 'frontend'];
  console.log(`EduComply dev — preflight checks${only ? ` (${only} only)` : ''}`);

  const existing = readSession();
  if (existing && isAlive(existing.supervisorPid)) {
    print({
      name: 'Already running',
      status: 'fail',
      detail: `npm run dev is already running (pid ${existing.supervisorPid}, since ${existing.startedAt})`,
      fix: 'Use that terminal (Ctrl+C to stop) or run: npm run dev:stop',
    });
    return 1;
  }

  const hasEnv = loadEnv();
  const skipDeps = flag('skip-deps-check');
  const [env, ports, redis, keycloak, db] = await Promise.all([
    hasEnv
      ? checkEnv()
      : Promise.resolve<CheckResult>({
          name: 'Environment',
          status: 'fail',
          detail: '.env not found',
          fix: 'Copy .env.example to .env',
        }),
    appPorts(services),
    skipDeps || only === 'frontend' ? null : checkRedis(process.env.REDIS_URL),
    skipDeps || only === 'frontend' ? null : checkKeycloak(process.env.OIDC_ISSUER),
    skipDeps || only === 'frontend'
      ? null
      : databaseCheck(
          `Neon PostgreSQL (DATABASE_TRANSPORT=${configuredTransport()})`,
          process.env.DATABASE_URL,
          configuredTransport() === 'websocket' ? 8_000 : 6_000,
          configuredTransport(),
        ),
  ]);
  const results = [env, ...ports.results, redis, keycloak, db].filter(
    (r): r is CheckResult => r !== null,
  );
  results.forEach(print);

  const allowDb = flag('allow-db-offline');
  const fatal = results.filter(
    (r) => r.status === 'fail' && !(allowDb && r.name === 'Neon PostgreSQL'),
  );
  if (fatal.length > 0) {
    console.log(
      `\n${ICON.fail} Not starting: fix the ${fatal.length} problem(s) above, or run: npm run dev:doctor`,
    );
    return 1;
  }
  if (db?.status === 'fail') {
    console.log(
      `${ICON.warn} Starting WITHOUT the database (--allow-db-offline): sign-in and user pages will return 503.`,
    );
  }

  const supervisor = new Supervisor({
    repoRoot: REPO_ROOT,
    children: services.map((s) => ({
      name: s === 'backend' ? 'api' : 'web',
      ...npmCommand(['run', 'dev', '-w', s]),
      cwd: REPO_ROOT,
      color: s === 'backend' ? 34 : 32,
    })),
  });
  console.log(
    `\n${ICON.ok} Starting ${services.join(' + ')} — frontend http://localhost:${PORTS.frontend}, API http://localhost:${PORTS.backend}. Press Ctrl+C to stop.\n`,
  );
  supervisor.start();
  return supervisor.done;
}

async function doctor(): Promise<number> {
  console.log('EduComply environment diagnosis (read-only)\n');
  const hasEnv = loadEnv();
  print({
    name: 'Node.js',
    status: Number(process.versions.node.split('.')[0]) >= 20 ? 'ok' : 'fail',
    detail: process.version,
    fix: 'Install Node.js 20.19 or newer.',
  });
  print(
    hasEnv
      ? await checkEnv()
      : {
          name: 'Environment',
          status: 'fail',
          detail: '.env not found',
          fix: 'Copy .env.example to .env',
        },
  );

  const session = readSession();
  if (session) {
    const alive = isAlive(session.supervisorPid);
    print({
      name: 'Dev session',
      status: alive ? 'ok' : 'warn',
      detail: alive
        ? `npm run dev running (pid ${session.supervisorPid})`
        : 'stale session file from a session that ended abnormally',
      fix: 'npm run dev:stop cleans up its leftover processes.',
    });
  }

  const docker = await dockerAvailable();
  print(docker);
  if (docker.status === 'ok') {
    const services = await composeServices();
    for (const name of ['redis', 'keycloak']) {
      const s = services.find((x) => x.service === name);
      print({
        name: `Container ${name}`,
        status:
          s?.state === 'running' && (s.health === 'healthy' || s.health === '') ? 'ok' : 'fail',
        detail: s ? `${s.state}${s.health ? ` (${s.health})` : ''}` : 'not created',
        fix: 'Start local dependencies: npm run dev:deps',
      });
    }
    (await depsPortsOwnedByUs()).forEach(print);
    for (const name of ['backend', 'frontend']) {
      const s = services.find((x) => x.service === name && x.state === 'running');
      if (s) {
        print({
          name: `Container ${name} (Docker stack)`,
          status: s.health === 'healthy' ? 'ok' : 'warn',
          detail: `${s.state}${s.health ? ` (${s.health})` : ''} — npm run dev cannot run at the same time`,
        });
      }
    }
  }

  for (const service of ['frontend', 'backend'] as const) {
    const i = await inspectPort(service);
    if (!i.probe.inUse)
      print({ name: `Port ${i.port} (${service})`, status: 'ok', detail: 'free' });
    else if (i.owners.length > 0 && i.owners.every((o) => o.kind === 'running-session')) {
      print({
        name: `Port ${i.port} (${service})`,
        status: 'ok',
        detail: 'used by the running `npm run dev`',
      });
    } else print(explainConflict(i));
  }

  print(await checkRedis(process.env.REDIS_URL));
  print(await checkKeycloak(process.env.OIDC_ISSUER));
  // Both transports are tested for real; the one the app uses decides ✔/✖, the other is info.
  const transport = configuredTransport();
  const [tcp, ws, direct] = await Promise.all([
    databaseCheck('Neon app DB over TCP 5432', process.env.DATABASE_URL, 8_000, 'tcp'),
    databaseCheck('Neon app DB over WebSocket 443', process.env.DATABASE_URL, 8_000, 'websocket'),
    databaseCheck('Neon direct (DIRECT_URL, migrations, TCP 5432)', process.env.DIRECT_URL, 8_000),
  ]);
  const mark = (r: CheckResult, t: Transport): CheckResult =>
    t === transport
      ? { ...r, name: `${r.name} ← used by the app` }
      : { ...r, status: r.status === 'ok' ? 'ok' : 'warn', fix: undefined };
  print(mark(tcp, 'tcp'));
  print(mark(ws, 'websocket'));
  if (direct.status !== 'ok') {
    direct.fix =
      'Migrations (db:migrate:*) need a network that allows TCP 5432 (e.g. a phone hotspot).';
  }
  print(direct);
  const used = transport === 'tcp' ? tcp : ws;
  const other = transport === 'tcp' ? ws : tcp;
  if (used.status !== 'ok' && other.status === 'ok') {
    const switchTo = transport === 'tcp' ? 'websocket' : 'tcp';
    print({
      name: 'Recommendation',
      status: 'warn',
      detail: `this network blocks the configured transport (${transport}) but ${switchTo} works`,
      fix: `Set DATABASE_TRANSPORT=${switchTo} in .env and restart npm run dev.`,
    });
  } else if (used.status !== 'ok') {
    const https = await httpsReachable(process.env.DATABASE_URL);
    print({
      name: 'Neon over HTTPS (443)',
      status: 'fail',
      detail: https
        ? 'plain HTTPS is reachable, but neither PostgreSQL (5432) nor the WebSocket upgrade gets through'
        : 'not reachable either — no internet path to Neon from this network',
      fix: 'Use another network (phone hotspot); see docs/development.md → "Neon connectivity".',
    });
  }
  return 0;
}

async function depsUp(): Promise<number> {
  loadEnv();
  const docker = await dockerAvailable();
  print(docker);
  if (docker.status !== 'ok') return 1;
  const conflicts = await depsPortsOwnedByUs();
  conflicts.forEach(print);
  if (conflicts.length > 0) return 1;
  try {
    const npm = npmCommand(['run', 'auth:init-env', '-w', 'backend', '--', '--check']);
    await run(npm.command, npm.args, { cwd: REPO_ROOT, windowsHide: true });
  } catch {
    print({
      name: 'Keycloak settings',
      status: 'fail',
      detail: 'OIDC/Keycloak keys missing in .env',
      fix: 'Run: npm run auth:init-env',
    });
    return 1;
  }
  console.log('Starting Redis and Keycloak (project "educomply") and waiting until healthy…');
  return new Promise((resolve) => {
    const child = spawn(
      'docker',
      [
        'compose',
        '-p',
        COMPOSE_PROJECT,
        'up',
        '-d',
        '--wait',
        '--wait-timeout',
        '180',
        'redis',
        'keycloak',
      ],
      { cwd: REPO_ROOT, stdio: 'inherit', windowsHide: true },
    );
    child.once('exit', (code) => {
      if (code === 0) console.log(`${ICON.ok} Redis and Keycloak are healthy.`);
      else
        console.log(
          `${ICON.fail} Dependencies did not become healthy. Check: docker compose logs keycloak`,
        );
      resolve(code ?? 1);
    });
  });
}

/** Runs `docker compose -p educomply …` with inherited output; resolves to the exit code. */
function compose(args: string[]): Promise<number> {
  const child = spawn('docker', ['compose', '-p', COMPOSE_PROJECT, ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });
  return new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1)));
}

/**
 * Builds and starts the complete application in containers (profile "app"). It uses the
 * same ports as `npm run dev` (OIDC callbacks depend on 5173), so it refuses while
 * `npm run dev` or anything else holds them — it never stops other processes itself.
 */
async function dockerUp(): Promise<number> {
  loadEnv();
  console.log('EduComply Docker stack — preflight checks');
  const docker = await dockerAvailable();
  print(docker);
  if (docker.status !== 'ok') return 1;
  const results: CheckResult[] = [await checkEnv(), ...(await depsPortsOwnedByUs())];

  const session = readSession();
  if (session && isAlive(session.supervisorPid)) {
    results.push({
      name: 'npm run dev',
      status: 'fail',
      detail: `running (pid ${session.supervisorPid}) on the same ports 5173/3000`,
      fix: 'Stop it first: Ctrl+C in its terminal, or npm run dev:stop',
    });
  }
  for (const service of ['frontend', 'backend'] as const) {
    const i = await inspectPort(service);
    const ownStack =
      i.containers.length > 0 &&
      i.containers.every((c) => c.project === COMPOSE_PROJECT) &&
      i.owners.length === 0;
    if (!i.probe.inUse || ownStack) {
      results.push({
        name: `Port ${i.port} (${service})`,
        status: 'ok',
        detail: ownStack ? 'held by this Docker stack (will be updated)' : 'free',
      });
    } else results.push(explainConflict(i));
  }
  results.forEach(print);
  if (results.some((r) => r.status === 'fail')) {
    console.log(`\n${ICON.fail} Not starting: fix the problem(s) above.`);
    return 1;
  }

  console.log('\nBuilding and starting redis, keycloak, backend, frontend (project "educomply")…');
  const code = await compose([
    '--profile',
    'app',
    'up',
    '-d',
    '--build',
    '--wait',
    '--wait-timeout',
    '300',
  ]);
  if (code !== 0) {
    console.log(`${ICON.fail} The stack did not become healthy. Check: npm run docker:logs`);
    return code;
  }
  console.log(`${ICON.ok} EduComply is running in Docker:`);
  console.log(`    Portal    http://localhost:${PORTS.frontend}`);
  console.log(`    API       http://localhost:${PORTS.backend}/api/v1/health`);
  console.log(`    Keycloak  http://localhost:${PORTS.keycloak}`);
  console.log('  Check: npm run dev:health   Stop: npm run docker:stop');
  return 0;
}

/** Stops only the application containers; Redis and Keycloak (and all volumes) are kept. */
function dockerStop(): Promise<number> {
  return compose(['--profile', 'app', 'stop', 'frontend', 'backend']);
}

async function depsStop(): Promise<number> {
  // `stop` (not `down -v`): containers and the Keycloak volume are kept; other projects untouched.
  // Includes the app containers (profile "app"), which cannot run without Redis and Keycloak.
  const child = spawn('docker', ['compose', '-p', COMPOSE_PROJECT, '--profile', 'app', 'stop'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });
  return new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1)));
}

async function stop(): Promise<number> {
  const includeUnmanaged = flag('include-unmanaged');
  const all = await listProcesses();
  const session = readSession();
  let stopped = 0;

  if (session) {
    const pids = [session.supervisorPid, ...session.children.map((c) => c.pid)];
    for (const pid of pids) {
      const proc = all.find((p) => p.pid === pid);
      // Guard against pid reuse: stop only processes whose command line is still EduComply's.
      if (proc && classifyProcess(proc) !== 'other' && isAlive(pid)) {
        await stopTree(pid);
        stopped++;
      } else if (
        proc &&
        isAlive(pid) &&
        /^(cmd|npm|node)/i.test(proc.name) &&
        /run dev -w (backend|frontend)/.test(proc.command)
      ) {
        await stopTree(pid);
        stopped++;
      }
    }
    clearSession();
  }

  const fresh = await listProcesses();
  // Never touch this command's own process chain (npm → tsx → node running dev:stop).
  const self = new Set(ancestors(process.pid, fresh).map((p) => p.pid));
  const remaining = fresh.filter((p) => classifyProcess(p) !== 'other' && !self.has(p.pid));
  const unmanaged = remaining.filter(
    (p) => decideOwnership(p, remaining, null).kind === 'unmanaged-educomply',
  );
  if (unmanaged.length > 0) {
    if (includeUnmanaged) {
      for (const p of unmanaged) {
        await stopTree(p.pid);
        stopped++;
      }
    } else {
      console.log('EduComply dev processes not started by `npm run dev` (left running):');
      for (const p of unmanaged)
        console.log(`  pid ${p.pid} — ${p.command.replace(/\s+/g, ' ').slice(0, 120)}`);
      console.log(
        '  → Stop them in their terminals, or approve: npm run dev:stop -- --include-unmanaged',
      );
    }
  }
  console.log(
    stopped > 0
      ? `${ICON.ok} Stopped ${stopped} EduComply process tree(s).`
      : 'No managed EduComply dev servers were running.',
  );
  return 0;
}

async function health(): Promise<number> {
  const get = async (name: string, url: string) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      const body = await res.text();
      const ok = res.ok;
      print({
        name,
        status: ok ? 'ok' : 'fail',
        detail: /^\s*</.test(body)
          ? `HTTP ${res.status} (HTML page)`
          : `HTTP ${res.status} ${body.replace(/\s+/g, ' ').slice(0, 200)}`,
      });
      return ok;
    } catch (err) {
      const e = err as { name?: string; cause?: { code?: string } };
      print({
        name,
        status: 'fail',
        detail: `not reachable (${e.name === 'TimeoutError' ? 'TIMEOUT' : (e.cause?.code ?? 'ERROR')})`,
        fix: 'Start the app: npm run dev',
      });
      return false;
    }
  };
  const results = [
    await get('API liveness', `http://localhost:${PORTS.backend}/api/v1/health`),
    await get(
      'API readiness (PostgreSQL + Redis)',
      `http://localhost:${PORTS.backend}/api/v1/ready`,
    ),
    await get('Frontend', `http://localhost:${PORTS.frontend}/`),
    await get('Frontend → API proxy', `http://localhost:${PORTS.frontend}/api/v1/health`),
  ];
  return results.every(Boolean) ? 0 : 1;
}

const commands: Record<string, () => Promise<number>> = {
  dev,
  doctor,
  'deps-up': depsUp,
  'deps-stop': depsStop,
  stop,
  health,
  'docker-up': dockerUp,
  'docker-stop': dockerStop,
};

const handler = commands[command];
if (!handler) {
  console.error(`Unknown command "${command}". Use: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
handler()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`${ICON.fail} ${(err as Error).message}`);
    process.exit(1);
  });
