import { config } from '@/config';

/** RFC 9457 problem body returned by the API on errors. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
}

export class ApiError extends Error {
  constructor(public readonly problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Problem | null;
    throw new ApiError(body ?? { type: 'about:blank', title: res.statusText, status: res.status });
  }
  return (await res.json()) as T;
}

export interface HealthStatus {
  status: 'ok';
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

export const getHealth = (signal?: AbortSignal) => apiGet<HealthStatus>('/health', signal);
