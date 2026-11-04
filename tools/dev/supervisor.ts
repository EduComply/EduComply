import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  clearSession,
  isAlive,
  listProcesses,
  stopTree,
  writeSession,
  type DevSession,
} from './processes.js';

export interface ChildSpec {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  color?: number;
}

export interface SupervisorOptions {
  children: ChildSpec[];
  sessionFile?: string;
  repoRoot: string;
  log?: (line: string) => void;
  /** Delay before recording the full process tree (for orphan identification). */
  treeSnapshotMs?: number;
  /** Install Ctrl+C / terminal-close handlers (disabled in tests). */
  handleSignals?: boolean;
}

/**
 * Runs the dev servers as one unit: prefixed output, a session file recording every pid,
 * and whole-tree shutdown on Ctrl+C, terminal close or when any child exits. Replaces
 * `concurrently -k`, which on Windows left npm → cmd → node grandchildren running.
 */
export class Supervisor {
  private readonly procs = new Map<string, ChildProcess>();
  private stopping: Promise<number> | undefined;
  private exitCode = 0;
  private resolveDone!: (code: number) => void;
  readonly done = new Promise<number>((r) => (this.resolveDone = r));

  constructor(private readonly options: SupervisorOptions) {}

  private log(line: string) {
    (this.options.log ?? ((l: string) => process.stdout.write(`${l}\n`)))(line);
  }

  private session(extra: Array<{ name: string; pid: number }> = []): DevSession {
    return {
      supervisorPid: process.pid,
      startedAt: new Date().toISOString(),
      repoRoot: this.options.repoRoot,
      children: [
        ...[...this.procs.entries()].map(([name, p]) => ({ name, pid: p.pid ?? 0 })),
        ...extra,
      ],
    };
  }

  start(): void {
    for (const spec of this.options.children) {
      const child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        // No shell: arguments stay escaped and the pid is the real child (clean tree kill).
        detached: process.platform !== 'win32', // own process group → kill(-pid) on POSIX
        windowsHide: true,
      });
      this.procs.set(spec.name, child);
      const prefix = `\u001b[${spec.color ?? 36}m[${spec.name}]\u001b[0m `;
      for (const stream of [child.stdout, child.stderr]) {
        if (stream) createInterface({ input: stream }).on('line', (l) => this.log(prefix + l));
      }
      child.once('exit', (code, signal) => {
        if (this.stopping) return;
        this.log(`${prefix}exited (${signal ?? `code ${code}`}); stopping the other services…`);
        this.exitCode = code === 0 ? 1 : (code ?? 1);
        void this.stop(this.exitCode);
      });
    }
    writeSession(this.session(), this.options.sessionFile);

    // Record descendants (npm → cmd → node) so a later run can recognise orphans.
    const snapshot = setTimeout(() => {
      void listProcesses()
        .then((all) => {
          const roots = new Set([...this.procs.values()].map((p) => p.pid));
          const tree: Array<{ name: string; pid: number }> = [];
          let added = true;
          const seen = new Set<number>(roots as Set<number>);
          while (added) {
            added = false;
            for (const p of all) {
              if (seen.has(p.ppid) && !seen.has(p.pid)) {
                seen.add(p.pid);
                tree.push({ name: `descendant:${p.name}`, pid: p.pid });
                added = true;
              }
            }
          }
          if (!this.stopping) writeSession(this.session(tree), this.options.sessionFile);
        })
        .catch(() => undefined);
    }, this.options.treeSnapshotMs ?? 8_000);
    snapshot.unref();

    const onSignal = (signal: string) => {
      this.log(`\n${signal} received — stopping EduComply dev servers…`);
      void this.stop(0);
    };
    if (this.options.handleSignals !== false) {
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) {
        process.once(signal, () => onSignal(signal));
      }
    }
  }

  /** Stops every child tree, removes the session file, resolves `done`. Idempotent. */
  stop(code = 0): Promise<number> {
    this.stopping ??= (async () => {
      await Promise.all(
        [...this.procs.values()].map(async (p) => {
          if (p.pid && isAlive(p.pid)) await stopTree(p.pid);
        }),
      );
      clearSession(this.options.sessionFile);
      this.log('All EduComply dev servers stopped.');
      this.resolveDone(code);
      return code;
    })();
    return this.stopping;
  }

  pids(): number[] {
    return [...this.procs.values()].map((p) => p.pid ?? 0);
  }
}
