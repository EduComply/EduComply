import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/authContext';
import { ApiError } from '@/lib/api';

type Result<T> =
  | { key: string; status: 'ok'; data: T }
  | { key: string; status: 'error'; error: ApiError | Error };

export type ResourceState<T> =
  { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; error: ApiError | Error };

/**
 * Loads data for `key` (refetches when the key changes). A 401 means the server session
 * ended, so the AuthProvider re-checks /me and the route guard shows "session expired".
 */
export function useResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): ResourceState<T> & { reload: () => void } {
  const { refresh } = useAuth();
  const [result, setResult] = useState<Result<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${key}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => setResult({ key: requestKey, status: 'ok', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) void refresh();
        setResult({
          key: requestKey,
          status: 'error',
          error: error instanceof Error ? error : new Error('Request failed'),
        });
      });
    return () => controller.abort();
    // `load` is recreated by callers each render; the key captures its inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  if (!result || result.key !== requestKey) return { status: 'loading', reload };
  if (result.status === 'ok') return { status: 'ok', data: result.data, reload };
  return { status: 'error', error: result.error, reload };
}

/** Friendly message for an API failure; never exposes internals. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.problem.code) {
      case 'FORBIDDEN':
        return 'You do not have permission for this action.';
      case 'CSRF_INVALID':
        return 'Your security token expired. Reload the page and try again.';
      case 'SESSION_EXPIRED':
        return 'Your session has expired. Sign in again.';
      case 'SELF_ROLE_CHANGE':
        return 'You cannot change your own role. Ask another administrator.';
      case 'LAST_ADMIN':
        return 'This is the last active administrator and cannot be demoted.';
      case 'NOT_FOUND':
        return 'The user was not found.';
      case 'VALIDATION_FAILED':
        return error.problem.errors?.map((e) => e.message).join(' ') || 'Please check the form.';
      case 'RATE_LIMITED':
        return 'Too many requests. Wait a moment and try again.';
      default:
        return error.problem.detail ?? 'The request failed. Try again.';
    }
  }
  return 'The service could not be reached. Try again.';
}
