import { config } from '@/config';

/** RFC 9457 problem body returned by the API on errors (Initial API Design §8). */
export interface Problem {
  type: string;
  title: string;
  status: number;
  /** Stable machine-readable code, e.g. VALIDATION_FAILED, RATE_LIMITED. */
  code: string;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: { path: string; message: string }[];
}

export class ApiError extends Error {
  constructor(public readonly problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }

  get status(): number {
    return this.problem.status;
  }
}

export interface RequestOptions {
  body?: unknown;
  /** Required for POST/PUT/PATCH/DELETE: the session's CSRF token (from GET /me). */
  csrfToken?: string;
  signal?: AbortSignal;
}

/**
 * Same-origin JSON request. The HttpOnly session cookie is sent automatically;
 * state-changing requests carry the CSRF token in X-CSRF-Token (Initial API Design §4).
 */
export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.csrfToken) headers['X-CSRF-Token'] = options.csrfToken;

  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    method,
    credentials: 'include',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Problem | null;
    throw new ApiError(
      body ?? { type: 'about:blank', title: res.statusText, status: res.status, code: 'UNKNOWN' },
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>('GET', path, signal ? { signal } : {});
}

/** Builds "?a=1&b=x" from defined, non-empty values. */
export function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export interface HealthStatus {
  status: 'ok';
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

export const getHealth = (signal?: AbortSignal) => apiGet<HealthStatus>('/health', signal);
