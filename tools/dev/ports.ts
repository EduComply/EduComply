import net from 'node:net';

export interface PortProbe {
  port: number;
  /** True if anything accepts connections on IPv4 or IPv6 loopback. */
  inUse: boolean;
  ipv4: boolean;
  ipv6: boolean;
}

type ConnectResult = 'open' | 'closed' | 'timeout';

function connect(host: string, port: number, timeoutMs: number): Promise<ConnectResult> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (result: ConnectResult) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => done('timeout'), timeoutMs);
    socket.once('connect', () => done('open'));
    socket.once('error', () => done('closed'));
  });
}

/**
 * A free loopback port is refused immediately, so a timeout means something holds the port
 * but is slow to answer (e.g. Docker Desktop's port proxy under load). One longer retry,
 * then a timeout counts as "in use": reporting a busy port as free would let Vite start on
 * [::1] next to a container on 127.0.0.1.
 */
async function canConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const first = await connect(host, port, timeoutMs);
  if (first !== 'timeout') return first === 'open';
  return (await connect(host, port, timeoutMs * 4)) !== 'closed';
}

/**
 * Probes a port by CONNECTING on both 127.0.0.1 and ::1. This is deliberate: on Windows a
 * listener bound only to ::1 (Vite's default for "localhost") is not shown by non-elevated
 * netstat/Get-NetTCPConnection, and a Docker container can hold 0.0.0.0 at the same time —
 * so "localhost:5173" may be split between two applications. Connecting sees both.
 */
export async function probePort(port: number, timeoutMs = 400): Promise<PortProbe> {
  const [ipv4, ipv6] = await Promise.all([
    canConnect('127.0.0.1', port, timeoutMs),
    canConnect('::1', port, timeoutMs),
  ]);
  return { port, inUse: ipv4 || ipv6, ipv4, ipv6 };
}

/** Parses `netstat -ano` (Windows) LISTENING rows → pid per port. Best effort. */
export function parseNetstatListeners(
  output: string,
): Array<{ port: number; pid: number; address: string }> {
  const rows: Array<{ port: number; pid: number; address: string }> = [];
  for (const line of output.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] !== 'TCP' || parts[3] !== 'LISTENING') continue;
    const address = parts[1] ?? '';
    const port = Number(address.slice(address.lastIndexOf(':') + 1));
    const pid = Number(parts[4]);
    if (Number.isInteger(port) && Number.isInteger(pid)) rows.push({ port, pid, address });
  }
  return rows;
}

/** Parses `lsof -nP -iTCP -sTCP:LISTEN -Fpn` (macOS/Linux) → pid per port. */
export function parseLsofListeners(
  output: string,
): Array<{ port: number; pid: number; address: string }> {
  const rows: Array<{ port: number; pid: number; address: string }> = [];
  let pid = 0;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n')) {
      const address = line.slice(1);
      const port = Number(address.slice(address.lastIndexOf(':') + 1));
      if (pid && Number.isInteger(port)) rows.push({ port, pid, address });
    }
  }
  return rows;
}
