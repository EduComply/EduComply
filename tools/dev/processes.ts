import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { REPO_ROOT, SESSION_FILE } from './config.js';
import { parseLsofListeners, parseNetstatListeners } from './ports.js';

const run = promisify(execFile);

export interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  command: string;
  startedAt?: string;
}

export type ProcessKind =
  'educomply-frontend' | 'educomply-backend' | 'educomply-supervisor' | 'other';

const norm = (s: string) => s.replace(/\\+/g, '/').toLowerCase();

/**
 * Identifies EduComply dev processes POSITIVELY: the command line must reference this
 * repository's path AND a known dev entry point. Anything else is "other" and is never
 * stopped automatically.
 */
export function classifyProcess(
  proc: Pick<ProcessInfo, 'command'>,
  repoRoot = REPO_ROOT,
): ProcessKind {
  const cmd = norm(proc.command);
  if (!cmd.includes(norm(repoRoot))) return 'other';
  if (cmd.includes('tools/dev/cli.ts')) return 'educomply-supervisor';
  if (cmd.includes('/vite/bin/vite.js')) return 'educomply-frontend';
  if (cmd.includes('/tsx/') && (cmd.includes('src/server.ts') || cmd.includes('backend'))) {
    return 'educomply-backend';
  }
  if (cmd.includes('/concurrently/')) return 'educomply-supervisor';
  return 'other';
}

/** Parses PowerShell `Get-CimInstance Win32_Process | ConvertTo-Json` output. */
export function parseWindowsProcesses(json: string): ProcessInfo[] {
  if (!json.trim()) return [];
  const raw = JSON.parse(json) as unknown;
  const list = (Array.isArray(raw) ? raw : [raw]) as Array<Record<string, unknown>>;
  return list.map((p) => ({
    pid: Number(p.ProcessId),
    ppid: Number(p.ParentProcessId),
    name: String(p.Name ?? ''),
    command: String(p.CommandLine ?? ''),
    ...(p.Started ? { startedAt: String(p.Started) } : {}),
  }));
}

/** Parses `ps -eo pid=,ppid=,comm=,args=` output. */
export function parsePsProcesses(output: string): ProcessInfo[] {
  return output
    .split(/\r?\n/)
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), name: m[3]!, command: m[4]! }));
}

/** Lists processes (node only on Windows, to stay fast). */
export async function listProcesses(): Promise<ProcessInfo[]> {
  if (process.platform === 'win32') {
    const script =
      'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | ' +
      'Select-Object ProcessId,ParentProcessId,Name,CommandLine,' +
      "@{n='Started';e={$_.CreationDate.ToString('s')}} | ConvertTo-Json -Compress";
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        timeout: 15_000,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    return parseWindowsProcesses(stdout);
  }
  const { stdout } = await run('ps', ['-eo', 'pid=,ppid=,comm=,args='], { timeout: 10_000 });
  return parsePsProcesses(stdout);
}

/** pid listening on each port (IPv6-only listeners may be missing on Windows). */
export async function listListeners(): Promise<
  Array<{ port: number; pid: number; address: string }>
> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await run('netstat', ['-ano', '-p', 'TCP'], {
        timeout: 10_000,
        windowsHide: true,
      });
      const v6 = await run('netstat', ['-ano', '-p', 'TCPv6'], {
        timeout: 10_000,
        windowsHide: true,
      })
        .then((r) => r.stdout)
        .catch(() => '');
      return parseNetstatListeners(`${stdout}\n${v6.replace(/TCPv6/g, 'TCP')}`);
    }
    const { stdout } = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], {
      timeout: 10_000,
    });
    return parseLsofListeners(stdout);
  } catch {
    return [];
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Stops a process tree. Only ever called for positively identified EduComply processes. */
export async function stopTree(pid: number): Promise<void> {
  if (!isAlive(pid)) return;
  if (process.platform === 'win32') {
    // taskkill /T stops the whole npm → cmd → node chain (plain kill leaves grandchildren).
    await run('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }).catch(
      () => undefined,
    );
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM'); // process group (children are spawned detached)
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

// ── Session file ─────────────────────────────────────────────────────

export interface DevSession {
  supervisorPid: number;
  startedAt: string;
  repoRoot: string;
  children: Array<{ name: string; pid: number }>;
}

export function readSession(file = SESSION_FILE): DevSession | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as DevSession;
  } catch {
    return null;
  }
}

export function writeSession(session: DevSession, file = SESSION_FILE): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(session, null, 2));
}

export function clearSession(file = SESSION_FILE): void {
  rmSync(file, { force: true });
}

// ── Ownership decisions ──────────────────────────────────────────────

export type Ownership =
  /** EduComply dev process from a session whose supervisor is gone: safe to stop. */
  | { kind: 'orphan'; process: ProcessInfo }
  /** Belongs to an EduComply `npm run dev` that is still running. */
  | { kind: 'running-session'; process: ProcessInfo; supervisorPid: number }
  /** EduComply dev process not started by `npm run dev` (e.g. another terminal). Needs approval. */
  | { kind: 'unmanaged-educomply'; process: ProcessInfo }
  /** Any other application. Never stopped by the tooling. */
  | { kind: 'foreign'; process: ProcessInfo };

/** Walks up the parent chain to find the session root (supervisor) for a process. */
export function ancestors(pid: number, all: ProcessInfo[]): ProcessInfo[] {
  const byPid = new Map(all.map((p) => [p.pid, p]));
  const chain: ProcessInfo[] = [];
  let current = byPid.get(pid);
  for (let i = 0; current && i < 12; i++) {
    chain.push(current);
    current = byPid.get(current.ppid);
  }
  return chain;
}

export function decideOwnership(
  proc: ProcessInfo,
  all: ProcessInfo[],
  session: DevSession | null,
  alive: (pid: number) => boolean = isAlive,
  repoRoot = REPO_ROOT,
): Ownership {
  if (classifyProcess(proc, repoRoot) === 'other') return { kind: 'foreign', process: proc };
  const chainPids = new Set(ancestors(proc.pid, all).map((p) => p.pid));
  if (session) {
    const ours =
      chainPids.has(session.supervisorPid) || session.children.some((c) => chainPids.has(c.pid));
    if (ours) {
      return alive(session.supervisorPid)
        ? { kind: 'running-session', process: proc, supervisorPid: session.supervisorPid }
        : { kind: 'orphan', process: proc };
    }
  }
  return { kind: 'unmanaged-educomply', process: proc };
}
