export interface HealthStatus {
  status: 'ok';
  service: 'educomply-api';
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

/**
 * Use case: report liveness. Dependency checks (PostgreSQL, Redis) are added
 * when those adapters arrive in the database and backend-core branches.
 */
export function getHealth(version: string, now: Date = new Date()): HealthStatus {
  return {
    status: 'ok',
    service: 'educomply-api',
    version,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: now.toISOString(),
  };
}
