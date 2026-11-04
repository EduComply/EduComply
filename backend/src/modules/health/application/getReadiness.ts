import {
  runCheck,
  type DependencyCheck,
  type DependencyStatus,
} from '../../../shared/infrastructure/dependency.js';

/** Dependencies required to serve traffic. S3 joins in Sprint 3. */
export type DependencyName = 'database' | 'redis';

export type ReadinessChecks = Record<DependencyName, DependencyCheck>;

export interface Readiness {
  status: 'ready' | 'not_ready';
  checks: Record<DependencyName, DependencyStatus>;
}

export const DEFAULT_CHECK_TIMEOUT_MS = 5_000;

/** Use case: ready only when every required dependency is up. Checks run in parallel. */
export async function getReadiness(
  checks: ReadinessChecks,
  timeoutMs = DEFAULT_CHECK_TIMEOUT_MS,
): Promise<Readiness> {
  const names = Object.keys(checks) as DependencyName[];
  const results = await Promise.all(names.map((name) => runCheck(checks[name], timeoutMs)));
  const statuses = Object.fromEntries(names.map((n, i) => [n, results[i]])) as Readiness['checks'];
  return {
    status: results.every((r) => r.status === 'up') ? 'ready' : 'not_ready',
    checks: statuses,
  };
}
