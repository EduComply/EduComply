import { COMPOSE_PROJECT, PORTS, type ServiceName } from './config.js';
import { runningContainers, type CheckResult, type ContainerInfo } from './deps.js';
import { probePort, type PortProbe } from './ports.js';
import {
  ancestors,
  classifyProcess,
  decideOwnership,
  listListeners,
  listProcesses,
  readSession,
  type DevSession,
  type Ownership,
  type ProcessInfo,
  type ProcessKind,
} from './processes.js';

const EXPECTED_KIND: Partial<Record<ServiceName, ProcessKind>> = {
  frontend: 'educomply-frontend',
  backend: 'educomply-backend',
};

export interface PortInspection {
  service: ServiceName;
  port: number;
  probe: PortProbe;
  containers: ContainerInfo[];
  owners: Ownership[];
}

/**
 * Inspects a port: who publishes it (Docker) and which processes own it. Owners come from
 * netstat/lsof PIDs plus EduComply processes of the expected kind (Vite's IPv6-only listener
 * is invisible to netstat on Windows, so command-line matching fills the gap).
 */
export async function inspectPort(
  service: ServiceName,
  deps: {
    probe?: typeof probePort;
    containers?: () => Promise<ContainerInfo[]>;
    processes?: () => Promise<ProcessInfo[]>;
    listeners?: typeof listListeners;
    session?: DevSession | null;
  } = {},
): Promise<PortInspection> {
  const port = PORTS[service];
  const probe = await (deps.probe ?? probePort)(port);
  if (!probe.inUse) return { service, port, probe, containers: [], owners: [] };

  const [containers, processes, listeners] = await Promise.all([
    (deps.containers ?? runningContainers)(),
    (deps.processes ?? listProcesses)().catch(() => [] as ProcessInfo[]),
    (deps.listeners ?? listListeners)(),
  ]);
  const session = deps.session === undefined ? readSession() : deps.session;
  const publishing = containers.filter((c) => c.hostPorts.includes(port));

  const candidates = new Map<number, ProcessInfo>();
  for (const l of listeners.filter((l) => l.port === port)) {
    const proc = processes.find((p) => p.pid === l.pid);
    candidates.set(l.pid, proc ?? { pid: l.pid, ppid: 0, name: 'unknown', command: '' });
  }
  const kind = EXPECTED_KIND[service];
  if (kind) {
    for (const p of processes) if (classifyProcess(p) === kind) candidates.set(p.pid, p);
  }
  // Docker Desktop's proxy process owns published ports; the container is the real owner.
  // Only node processes are listed on Windows, so the proxy appears as an unidentified pid.
  const list = [...candidates.values()].filter(
    (p) => !(publishing.length > 0 && (/docker/i.test(p.name + p.command) || p.name === 'unknown')),
  );
  // Report root processes only (e.g. the `tsx watch` watcher, not each server it restarts).
  const roots = list.filter(
    (p) =>
      !ancestors(p.pid, processes)
        .slice(1)
        .some((a) => candidates.has(a.pid)),
  );
  const owners = roots.map((p) => decideOwnership(p, processes, session));
  return { service, port, probe, containers: publishing, owners };
}

const short = (p: ProcessInfo) => {
  const cmd = p.command.replace(/\s+/g, ' ');
  return `pid ${p.pid} ${p.name}${p.startedAt ? ` (started ${p.startedAt.replace('T', ' ')})` : ''}${
    cmd ? ` — ${cmd.length > 110 ? `${cmd.slice(0, 110)}…` : cmd}` : ''
  }`;
};

/** Human explanation + recovery for an occupied application port. */
export function explainConflict(i: PortInspection): CheckResult {
  const where = [i.probe.ipv4 ? '127.0.0.1' : '', i.probe.ipv6 ? '[::1]' : '']
    .filter(Boolean)
    .join(' and ');
  const lines: string[] = [];
  const fixes: string[] = [];
  for (const c of i.containers) {
    lines.push(
      `Docker container "${c.name}" (compose project "${c.project || 'none'}") publishes port ${i.port}.`,
    );
    if (c.project !== COMPOSE_PROJECT) {
      fixes.push(`Stop only that container (needs your approval): docker stop ${c.name}`);
    } else {
      // Our own containerised app (npm run docker:up) uses the same ports as npm run dev.
      fixes.push(
        'The EduComply Docker stack is running. Use it, or stop it first: npm run docker:stop',
      );
    }
  }
  for (const o of i.owners) {
    switch (o.kind) {
      case 'orphan':
        lines.push(
          `Orphaned EduComply ${i.service} from a previous \`npm run dev\`: ${short(o.process)}`,
        );
        break;
      case 'running-session':
        lines.push(
          `EduComply is already running (supervisor pid ${o.supervisorPid}): ${short(o.process)}`,
        );
        fixes.push('Use the terminal where it runs (Ctrl+C to stop), or run: npm run dev:stop');
        break;
      case 'unmanaged-educomply':
        lines.push(
          `EduComply ${i.service} started outside \`npm run dev\` (another terminal?): ${short(o.process)}`,
        );
        fixes.push(
          'Stop it in its terminal (Ctrl+C), or approve stopping it: npm run dev:stop -- --include-unmanaged',
        );
        break;
      case 'foreign':
        lines.push(`Another application: ${short(o.process)}`);
        fixes.push(`Close that application or free port ${i.port}. EduComply will not stop it.`);
        break;
    }
  }
  if (lines.length === 0)
    lines.push('The owning process could not be identified (may need an elevated terminal).');
  return {
    name: `Port ${i.port} (${i.service})`,
    status: 'fail',
    detail: `in use on ${where}. ${lines.join('\n      ')}`,
    fix:
      [...new Set(fixes)].join(' | ') ||
      `Free port ${i.port}; ports are fixed because Keycloak redirects depend on them.`,
  };
}
