import { lookup } from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';

/**
 * Classified outcome of a database connectivity diagnosis. Each stage is bounded by a
 * timeout, nothing retries forever, TLS certificates are always verified, and only
 * error codes (never URLs, hosts' credentials or passwords) are reported.
 */
export type DbDiagnosis =
  | 'ok'
  | 'not_configured'
  | 'invalid_url'
  | 'dns_error'
  | 'tcp_timeout'
  | 'tcp_refused'
  | 'ssl_stalled'
  | 'ssl_refused'
  | 'tls_failed'
  | 'auth_failed'
  | 'database_missing'
  | 'compute_unavailable'
  | 'query_timeout'
  | 'error';

export interface DbResult {
  diagnosis: DbDiagnosis;
  stage: string;
  latencyMs: number;
  code?: string;
  /** Host shown abbreviated, e.g. "ep-example-h…neon.tech" (no credentials). */
  host?: string;
}

export const DIAGNOSIS_HELP: Record<DbDiagnosis, string> = {
  ok: 'Connected, TLS verified and query succeeded.',
  not_configured: 'DATABASE_URL / DIRECT_URL is not set in .env.',
  invalid_url: 'The connection string is not a valid postgresql:// URL.',
  dns_error: 'The database host name could not be resolved. Check internet access / DNS.',
  tcp_timeout:
    'TCP port 5432 did not answer. This network probably blocks outbound PostgreSQL (5432). Use another network (e.g. phone hotspot).',
  tcp_refused: 'The host refused port 5432. Check the host name in .env.',
  ssl_stalled:
    'TCP 5432 opened but the PostgreSQL TLS handshake never answered. A firewall/proxy on this network is intercepting PostgreSQL. Use another network.',
  ssl_refused: 'The server refused TLS. Neon requires TLS — check sslmode in .env.',
  tls_failed:
    'TLS certificate verification failed. Do not disable verification; check the system clock and network proxy.',
  auth_failed:
    'Password authentication failed. Copy a fresh connection string from the Neon console into .env.',
  database_missing:
    'The database name in the connection string does not exist on this Neon branch.',
  compute_unavailable:
    'Neon reports the compute endpoint as disabled/suspended or over quota. Check the project in the Neon console.',
  query_timeout:
    'Connected but the test query did not finish in time (Neon cold start or overload). Retry shortly.',
  error: 'Unexpected database error. See the code shown.',
};

export function maskHost(host: string): string {
  return host.length <= 16 ? host : `${host.slice(0, 12)}…${host.slice(-9)}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(code), { code })), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** PostgreSQL SSLRequest: Int32 length 8, Int32 code 80877103. Server answers 'S' or 'N'. */
const SSL_REQUEST = Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]);

/** Opens TCP, sends SSLRequest and completes a certificate-verified TLS handshake. */
async function tlsHandshake(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<{ stage: string; code?: string }> {
  const socket = await withTimeout(
    new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect({ host, port });
      s.once('connect', () => resolve(s));
      s.once('error', reject);
    }),
    timeoutMs,
    'TCP_TIMEOUT',
  ).catch((err: NodeJS.ErrnoException) => {
    throw Object.assign(err, { stage: 'tcp' });
  });

  try {
    const answer = await withTimeout(
      new Promise<string>((resolve, reject) => {
        socket.once('data', (d: Buffer) => resolve(d.subarray(0, 1).toString()));
        socket.once('error', reject);
        socket.once('close', () =>
          reject(Object.assign(new Error('closed'), { code: 'ECONNRESET' })),
        );
        socket.write(SSL_REQUEST);
      }),
      timeoutMs,
      'SSL_TIMEOUT',
    );
    if (answer !== 'S')
      throw Object.assign(new Error('ssl refused'), { code: 'SSL_REFUSED', stage: 'ssl' });

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const secure = tls.connect({ socket, servername: host, rejectUnauthorized: true });
        secure.once('secureConnect', () => {
          secure.end();
          resolve();
        });
        secure.once('error', reject);
      }),
      timeoutMs,
      'TLS_TIMEOUT',
    ).catch((err: NodeJS.ErrnoException) => {
      throw Object.assign(err, { stage: 'tls' });
    });
    return { stage: 'tls' };
  } catch (err) {
    const e = err as { stage?: string };
    if (!e.stage) Object.assign(err as object, { stage: 'ssl' });
    throw err;
  } finally {
    socket.destroy();
  }
}

export interface DiagnoseOptions {
  /** Per-stage timeout. */
  timeoutMs?: number;
  /** Run SELECT 1 with the real credentials (needs the `pg` package). */
  query?: boolean;
}

/** Diagnoses a postgresql:// URL stage by stage. Never prints the URL. */
export async function diagnoseDatabase(
  url: string | undefined,
  options: DiagnoseOptions = {},
): Promise<DbResult> {
  const timeoutMs = options.timeoutMs ?? 6_000;
  const started = Date.now();
  const result = (
    diagnosis: DbDiagnosis,
    stage: string,
    extra: Partial<DbResult> = {},
  ): DbResult => ({
    diagnosis,
    stage,
    latencyMs: Date.now() - started,
    ...extra,
  });

  if (!url) return result('not_configured', 'config');
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!/^postgres(ql)?:$/.test(parsed.protocol)) throw new Error('protocol');
  } catch {
    return result('invalid_url', 'config');
  }
  const host = parsed.hostname;
  const port = Number(parsed.port || 5432);
  const shown = maskHost(host);

  try {
    await withTimeout(lookup(host), timeoutMs, 'DNS_TIMEOUT');
  } catch (err) {
    return result('dns_error', 'dns', {
      code: (err as NodeJS.ErrnoException).code ?? 'DNS',
      host: shown,
    });
  }

  try {
    await tlsHandshake(host, port, timeoutMs);
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stage?: string };
    const code = e.code ?? 'ERROR';
    if (e.stage === 'tcp') {
      return result(code === 'ECONNREFUSED' ? 'tcp_refused' : 'tcp_timeout', 'tcp', {
        code,
        host: shown,
      });
    }
    if (code === 'SSL_REFUSED') return result('ssl_refused', 'ssl', { code, host: shown });
    if (e.stage === 'tls' && code !== 'TLS_TIMEOUT')
      return result('tls_failed', 'tls', { code, host: shown });
    return result('ssl_stalled', 'ssl', { code, host: shown });
  }

  if (options.query === false) return result('ok', 'tls', { host: shown });

  const pg = (await import('pg')).default;
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.query('SELECT 1');
    return result('ok', 'query', { host: shown });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const message = (e.message ?? '').toLowerCase();
    if (e.code === '28P01' || e.code === '28000')
      return result('auth_failed', 'auth', { code: e.code, host: shown });
    if (e.code === '3D000')
      return result('database_missing', 'auth', { code: e.code, host: shown });
    if (
      /endpoint .*(disabled|suspended)|compute time quota|exceeded the data transfer quota/.test(
        message,
      )
    ) {
      return result('compute_unavailable', 'auth', { code: e.code ?? 'NEON', host: shown });
    }
    if (/timeout/.test(message))
      return result('query_timeout', 'query', { code: 'TIMEOUT', host: shown });
    return result('error', 'query', { code: e.code ?? 'ERROR', host: shown });
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Is HTTPS (443) to the same host reachable? Used to explain port-5432 blocking. */
export async function httpsReachable(url: string | undefined, timeoutMs = 4_000): Promise<boolean> {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return withTimeout(
    new Promise<boolean>((resolve) => {
      const s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: true });
      s.once('secureConnect', () => {
        s.end();
        resolve(true);
      });
      s.once('error', () => resolve(false));
    }),
    timeoutMs,
    'TIMEOUT',
  ).catch(() => false);
}
