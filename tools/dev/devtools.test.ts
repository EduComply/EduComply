/**
 * Development-environment tooling tests. MOCKED process lists, Docker output and fetch;
 * real sockets only on private ephemeral ports (never 5173/3000/6379/8080). Nothing here
 * inspects, signals or stops processes that the test did not start itself.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkKeycloak, checkRedis, parseDockerPs, parsePublishedPorts } from './deps.js';
import { checkEnv, missingKeys, REQUIRED_KEYS } from './env.js';
import { diagnoseDatabase, maskHost } from './neon.js';
import { probePort, parseLsofListeners, parseNetstatListeners } from './ports.js';
import { explainConflict, inspectPort } from './preflight.js';
import {
  classifyProcess,
  decideOwnership,
  isAlive,
  parsePsProcesses,
  parseWindowsProcesses,
  type DevSession,
  type ProcessInfo,
} from './processes.js';
import { Supervisor } from './supervisor.js';

const ROOT = 'C:\\Users\\dev\\EduComply';
const VITE: ProcessInfo = {
  pid: 200,
  ppid: 150,
  name: 'node.exe',
  command: `"node" "${ROOT}\\node_modules\\.bin\\..\\vite\\bin\\vite.js"`,
};
const NPM_WEB: ProcessInfo = {
  pid: 150,
  ppid: 100,
  name: 'cmd.exe',
  command: 'cmd.exe /s /c "npm run dev -w frontend"',
};
const SUPERVISOR: ProcessInfo = {
  pid: 100,
  ppid: 50,
  name: 'node.exe',
  command: `node ${ROOT}\\node_modules\\tsx\\dist\\cli.mjs tools/dev/cli.ts dev`,
};
const BACKEND: ProcessInfo = {
  pid: 300,
  ppid: 1,
  name: 'node.exe',
  command: `"node" "${ROOT}\\node_modules\\.bin\\..\\tsx\\dist\\cli.mjs" watch --clear-screen=false src/server.ts`,
};
const OTHER_VITE: ProcessInfo = {
  pid: 400,
  ppid: 1,
  name: 'node.exe',
  command: '"node" "C:\\Users\\dev\\habit-tracker\\node_modules\\vite\\bin\\vite.js"',
};
const session = (supervisorPid: number): DevSession => ({
  supervisorPid,
  startedAt: '2026-11-04T10:00:00Z',
  repoRoot: ROOT,
  children: [{ name: 'web', pid: 150 }],
});

async function listen(host = '127.0.0.1'): Promise<net.Server> {
  const server = net.createServer((s) => s.destroy());
  await new Promise<void>((r) => server.listen(0, host, r));
  return server;
}
const portOf = (s: net.Server) => (s.address() as net.AddressInfo).port;

afterEach(() => vi.restoreAllMocks());

describe('port conflict detection', () => {
  it('detects a listener on an ephemeral port and reports a free port as free', async () => {
    const server = await listen();
    const port = portOf(server);
    expect(await probePort(port)).toMatchObject({ inUse: true, ipv4: true });
    await new Promise((r) => server.close(r));
    expect((await probePort(port)).inUse).toBe(false);
  });

  it('detects an IPv6-only listener (what netstat misses on Windows)', async () => {
    let server: net.Server;
    try {
      server = await listen('::1');
    } catch {
      return; // IPv6 loopback unavailable on this machine
    }
    const result = await probePort(portOf(server));
    expect(result).toMatchObject({ inUse: true, ipv6: true, ipv4: false });
    await new Promise((r) => server.close(r));
  });

  it('parses netstat and lsof listener output', () => {
    const netstat = [
      '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       38840',
      '  TCP    [::1]:5173             [::]:0                 LISTENING       36292',
      '  TCP    127.0.0.1:2000         127.0.0.1:5173         ESTABLISHED     1',
    ].join('\n');
    expect(parseNetstatListeners(netstat)).toEqual([
      { port: 3000, pid: 38840, address: '0.0.0.0:3000' },
      { port: 5173, pid: 36292, address: '[::1]:5173' },
    ]);
    expect(parseLsofListeners('p123\nn127.0.0.1:5173\np9\nn*:3000')).toEqual([
      { port: 5173, pid: 123, address: '127.0.0.1:5173' },
      { port: 3000, pid: 9, address: '*:3000' },
    ]);
  });

  it('names the Docker container that publishes a port and gives a targeted, approval-only fix', async () => {
    const inspection = await inspectPort('frontend', {
      probe: async (port) => ({ port, inUse: true, ipv4: true, ipv6: false }),
      containers: async () => [
        {
          name: 'habit-tracker-frontend',
          project: 'habit-tracker',
          state: 'running',
          status: 'Up',
          hostPorts: [5173],
        },
      ],
      processes: async () => [
        { pid: 5364, ppid: 1, name: 'com.docker.backend.exe', command: 'com.docker.backend' },
      ],
      listeners: async () => [{ port: 5173, pid: 5364, address: '0.0.0.0:5173' }],
      session: null,
    });
    const report = explainConflict(inspection);
    expect(report.detail).toContain(
      'Docker container "habit-tracker-frontend" (compose project "habit-tracker")',
    );
    expect(report.fix).toContain('docker stop habit-tracker-frontend');
    expect(report.fix).toContain('needs your approval');
    expect(inspection.owners).toEqual([]); // Docker's proxy process is not reported as the owner
  });
});

describe('process ownership', () => {
  it('positively identifies EduComply dev processes by repository path and entry point', () => {
    expect(classifyProcess(VITE, ROOT)).toBe('educomply-frontend');
    expect(classifyProcess(BACKEND, ROOT)).toBe('educomply-backend');
    expect(classifyProcess(SUPERVISOR, ROOT)).toBe('educomply-supervisor');
    expect(classifyProcess(OTHER_VITE, ROOT)).toBe('other'); // another project's Vite
    expect(classifyProcess({ command: 'C:\\Windows\\explorer.exe' }, ROOT)).toBe('other');
  });

  it('marks processes of a dead `npm run dev` session as orphans (safe to stop)', () => {
    const all = [SUPERVISOR, NPM_WEB, VITE];
    const owner = decideOwnership(VITE, all, session(100), () => false, ROOT);
    expect(owner.kind).toBe('orphan');
  });

  it('never treats a process of a running session as an orphan', () => {
    const owner = decideOwnership(
      VITE,
      [SUPERVISOR, NPM_WEB, VITE],
      session(100),
      () => true,
      ROOT,
    );
    expect(owner).toMatchObject({ kind: 'running-session', supervisorPid: 100 });
  });

  it('EduComply processes started elsewhere need approval; other apps are foreign', () => {
    expect(decideOwnership(BACKEND, [BACKEND], session(100), () => false, ROOT).kind).toBe(
      'unmanaged-educomply',
    );
    expect(decideOwnership(OTHER_VITE, [OTHER_VITE], null, () => false, ROOT).kind).toBe('foreign');
  });

  it('parses Windows and POSIX process listings', () => {
    const win = parseWindowsProcesses(
      JSON.stringify({
        ProcessId: 7,
        ParentProcessId: 1,
        Name: 'node.exe',
        CommandLine: 'node x',
        Started: '2026-11-04T17:54:54',
      }),
    );
    expect(win).toEqual([
      { pid: 7, ppid: 1, name: 'node.exe', command: 'node x', startedAt: '2026-11-04T17:54:54' },
    ]);
    expect(parsePsProcesses('  12     1 node /repo/node_modules/vite/bin/vite.js')).toEqual([
      { pid: 12, ppid: 1, name: 'node', command: '/repo/node_modules/vite/bin/vite.js' },
    ]);
  });

  it('isAlive reports this process alive and a nonexistent pid dead', () => {
    expect(isAlive(process.pid)).toBe(true);
    expect(isAlive(2 ** 30)).toBe(false);
  });
});

describe('Docker output parsing', () => {
  it('extracts host ports and the compose project', () => {
    expect(parsePublishedPorts('0.0.0.0:5173->5173/tcp, [::]:5173->5173/tcp')).toEqual([5173]);
    expect(parsePublishedPorts('127.0.0.1:8080->8080/tcp')).toEqual([8080]);
    const [c] = parseDockerPs(
      JSON.stringify({
        Names: 'educomply-redis-1',
        Labels: 'com.docker.compose.project=educomply,com.docker.compose.service=redis',
        State: 'running',
        Status: 'Up (healthy)',
        Ports: '127.0.0.1:6379->6379/tcp',
      }),
    );
    expect(c).toMatchObject({ name: 'educomply-redis-1', project: 'educomply', hostPorts: [6379] });
  });
});

describe('dependency checks', () => {
  it('Redis unavailable → fail within the timeout with a remediation', async () => {
    const server = await listen();
    const port = portOf(server);
    await new Promise((r) => server.close(r)); // nothing listens now
    const started = Date.now();
    const result = await checkRedis(`redis://127.0.0.1:${port}`, 1_500);
    expect(result.status).toBe('fail');
    expect(result.fix).toContain('npm run dev:deps');
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('Keycloak unavailable or timing out → fail; wrong issuer → fail', async () => {
    const issuer = 'http://localhost:8080/realms/educomply';
    const refused = vi.fn(async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }) as unknown as typeof fetch;
    expect(await checkKeycloak(issuer, 500, refused)).toMatchObject({
      status: 'fail',
      detail: 'not reachable (ECONNREFUSED)',
    });

    const hang = vi.fn(
      (_: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('t'), { name: 'TimeoutError' })),
          ),
        ),
    ) as unknown as typeof fetch;
    expect(await checkKeycloak(issuer, 50, hang)).toMatchObject({
      status: 'fail',
      detail: 'not reachable (TIMEOUT)',
    });

    const wrong = vi.fn(
      async () => new Response(JSON.stringify({ issuer: 'http://evil' })),
    ) as unknown as typeof fetch;
    expect((await checkKeycloak(issuer, 500, wrong)).detail).toContain('does not match');

    const ok = vi.fn(
      async () => new Response(JSON.stringify({ issuer })),
    ) as unknown as typeof fetch;
    expect((await checkKeycloak(issuer, 500, ok)).status).toBe('ok');
  });
});

describe('Neon / PostgreSQL diagnosis (bounded, no credentials printed)', () => {
  it('a port that accepts TCP but never answers the TLS request → ssl_stalled within the timeout', async () => {
    const sockets: net.Socket[] = [];
    const silent = net.createServer((s) => sockets.push(s)); // accepts, never answers (like a blocking proxy)
    await new Promise<void>((r) => silent.listen(0, '127.0.0.1', r));
    const started = Date.now();
    const result = await diagnoseDatabase(
      `postgresql://u:secret@127.0.0.1:${portOf(silent)}/db?sslmode=require`,
      {
        timeoutMs: 300,
      },
    );
    expect(result.diagnosis).toBe('ssl_stalled');
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(JSON.stringify(result)).not.toContain('secret');
    sockets.forEach((s) => s.destroy());
    silent.close();
  });

  it('a server that refuses TLS → ssl_refused', async () => {
    const noTls = net.createServer((s) => s.once('data', () => s.write('N')));
    await new Promise<void>((r) => noTls.listen(0, '127.0.0.1', r));
    const result = await diagnoseDatabase(`postgresql://u:p@127.0.0.1:${portOf(noTls)}/db`, {
      timeoutMs: 1_000,
    });
    expect(result.diagnosis).toBe('ssl_refused');
    await new Promise((r) => noTls.close(r));
  });

  it('closed port → tcp_refused; unknown host → dns_error; bad URL → invalid_url', async () => {
    const server = await listen();
    const port = portOf(server);
    await new Promise((r) => server.close(r));
    expect(
      (await diagnoseDatabase(`postgresql://u:p@127.0.0.1:${port}/db`, { timeoutMs: 1_000 }))
        .diagnosis,
    ).toBe('tcp_refused');
    expect(
      (await diagnoseDatabase('postgresql://u:p@db.educomply.invalid/db', { timeoutMs: 3_000 }))
        .diagnosis,
    ).toBe('dns_error');
    expect((await diagnoseDatabase('mysql://x', {})).diagnosis).toBe('invalid_url');
    expect((await diagnoseDatabase(undefined, {})).diagnosis).toBe('not_configured');
  });

  it('abbreviates host names in reports', () => {
    expect(maskHost('ep-example-host-a1b2c3d4-pooler.c-2.eu-central-1.aws.neon.tech')).toBe(
      'ep-example-h…neon.tech',
    );
  });
});

describe('environment validation', () => {
  it('reports missing keys by name only', async () => {
    expect(missingKeys({ DATABASE_URL: 'x' })).toEqual(
      REQUIRED_KEYS.filter((k) => k !== 'DATABASE_URL'),
    );
    const result = await checkEnv({ DATABASE_URL: 'postgresql://u:topsecret@h/db' });
    expect(result.status).toBe('fail');
    expect(result.detail).toContain('missing in .env');
    expect(JSON.stringify(result)).not.toContain('topsecret');
  });

  it('runs the backend validator and reports invalid variables without values', async () => {
    const env = Object.fromEntries(REQUIRED_KEYS.map((k) => [k, 'x'])) as NodeJS.ProcessEnv;
    env.DATABASE_URL = 'mysql://u:topsecret@h/db';
    const result = await checkEnv(env);
    expect(result).toMatchObject({ status: 'fail' });
    expect(result.detail).toContain('DATABASE_URL');
    expect(JSON.stringify(result)).not.toContain('topsecret');
  });
});

describe('supervisor (startup failure and graceful shutdown)', () => {
  const fakeChild = (name: string, script: string) => ({
    name,
    command: process.execPath,
    args: ['-e', script],
    cwd: process.cwd(),
  });

  it('stops every child process tree and removes the session file on shutdown', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ec-dev-')), 'session.json');
    const sup = new Supervisor({
      repoRoot: process.cwd(),
      sessionFile: file,
      handleSignals: false,
      treeSnapshotMs: 60_000,
      log: () => undefined,
      children: [
        fakeChild('api', 'setInterval(() => {}, 1000)'),
        fakeChild('web', 'setInterval(() => {}, 1000)'),
      ],
    });
    sup.start();
    expect(existsSync(file)).toBe(true);
    const recorded = JSON.parse(readFileSync(file, 'utf8')) as DevSession;
    expect(recorded.supervisorPid).toBe(process.pid);
    expect(recorded.children.map((c) => c.name)).toEqual(['api', 'web']);
    const pids = sup.pids();
    expect(pids.every((p) => isAlive(p))).toBe(true);

    expect(await sup.stop(0)).toBe(0);
    await new Promise((r) => setTimeout(r, 300));
    expect(pids.some((p) => isAlive(p))).toBe(false);
    expect(existsSync(file)).toBe(false);
  });

  it('when one service crashes at startup, the others are stopped and the exit code is non-zero', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ec-dev-')), 'session.json');
    const lines: string[] = [];
    const sup = new Supervisor({
      repoRoot: process.cwd(),
      sessionFile: file,
      handleSignals: false,
      treeSnapshotMs: 60_000,
      log: (l) => lines.push(l),
      children: [
        fakeChild('api', 'process.exit(3)'),
        fakeChild('web', 'setInterval(() => {}, 1000)'),
      ],
    });
    sup.start();
    const webPid = sup.pids()[1]!;
    expect(await sup.done).toBe(3);
    await new Promise((r) => setTimeout(r, 300));
    expect(isAlive(webPid)).toBe(false);
    expect(lines.some((l) => l.includes('exited (code 3)'))).toBe(true);
  });

  it('stops a child that spawned its own grandchild (whole tree, as npm → node does)', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ec-dev-')), 'session.json');
    const grandchildScript =
      "const {spawn}=require('child_process');const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log('GRANDCHILD '+g.pid);setInterval(()=>{},1000)";
    const lines: string[] = [];
    const sup = new Supervisor({
      repoRoot: process.cwd(),
      sessionFile: file,
      handleSignals: false,
      treeSnapshotMs: 60_000,
      log: (l) => lines.push(l),
      children: [fakeChild('api', grandchildScript)],
    });
    sup.start();
    let grandchild = 0;
    for (let i = 0; i < 50 && !grandchild; i++) {
      await new Promise((r) => setTimeout(r, 100));
      grandchild = Number(
        lines.find((l) => l.includes('GRANDCHILD'))?.split('GRANDCHILD ')[1] ?? 0,
      );
    }
    expect(isAlive(grandchild)).toBe(true);
    await sup.stop(0);
    await new Promise((r) => setTimeout(r, 500));
    expect(isAlive(grandchild)).toBe(false);
  });
});

describe('unrelated processes are never signalled', () => {
  it('a foreign process listening on a port is reported, not stopped', async () => {
    const victim = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });
    try {
      const inspection = await inspectPort('backend', {
        probe: async (port) => ({ port, inUse: true, ipv4: true, ipv6: false }),
        containers: async () => [],
        processes: async () => [
          { pid: victim.pid!, ppid: 1, name: 'node.exe', command: 'node some-other-app.js' },
        ],
        listeners: async () => [{ port: 3000, pid: victim.pid!, address: '0.0.0.0:3000' }],
        session: null,
      });
      expect(inspection.owners).toEqual([expect.objectContaining({ kind: 'foreign' })]);
      const report = explainConflict(inspection);
      expect(report.fix).toContain('EduComply will not stop it');
      expect(isAlive(victim.pid!)).toBe(true);
    } finally {
      victim.kill();
    }
  });
});
