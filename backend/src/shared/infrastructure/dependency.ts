/** Result of probing an external dependency (PostgreSQL, Redis, later S3). */
export interface DependencyStatus {
  status: 'up' | 'down' | 'not_configured';
  latencyMs?: number;
  /** Error code only (e.g. P1001, ECONNREFUSED, TIMEOUT) — never a message or connection detail. */
  code?: string;
}

export type DependencyCheck = () => Promise<DependencyStatus>;

/** Runs a check with a deadline so a hung dependency cannot stall readiness probes. */
export async function runCheck(
  check: DependencyCheck,
  timeoutMs: number,
): Promise<DependencyStatus> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<DependencyStatus>((resolve) => {
    timer = setTimeout(
      () => resolve({ status: 'down', code: 'TIMEOUT', latencyMs: Date.now() - started }),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([
      check().catch((err: unknown) => ({
        status: 'down' as const,
        latencyMs: Date.now() - started,
        code: errorCode(err),
      })),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Extracts a short, safe error code from an unknown error. */
export function errorCode(err: unknown): string {
  const e = err as { code?: unknown; errorCode?: unknown; name?: unknown } | null;
  const code = [e?.code, e?.errorCode, e?.name].find((v) => typeof v === 'string');
  return (code as string | undefined) ?? 'UNKNOWN';
}
