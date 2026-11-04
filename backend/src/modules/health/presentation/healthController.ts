import type { RequestHandler } from 'express';
import { getHealth } from '../application/getHealth.js';
import { getReadiness, type ReadinessChecks } from '../application/getReadiness.js';

export interface HealthControllerDeps {
  version: string;
  checks: ReadinessChecks;
  checkTimeoutMs?: number;
}

export function healthController({ version, checks, checkTimeoutMs }: HealthControllerDeps) {
  /** GET /health — liveness: the process is running. Never touches dependencies. */
  const liveness: RequestHandler = (_req, res) => {
    res.set('Cache-Control', 'no-store').json(getHealth(version));
  };

  /** GET /ready — readiness: 200 when PostgreSQL and Redis are reachable, otherwise 503. */
  const readiness: RequestHandler = async (_req, res) => {
    const result = await getReadiness(checks, checkTimeoutMs);
    res
      .status(result.status === 'ready' ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json(result);
  };

  return { liveness, readiness };
}
