import { useEffect, useState } from 'react';
import { getHealth, type HealthStatus } from '@/lib/api';

type State =
  { kind: 'loading' } | { kind: 'ok'; health: HealthStatus } | { kind: 'error'; message: string };

/** Shows whether the frontend can reach the backend through the Vite proxy. */
export function ApiStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then((health) => setState({ kind: 'ok', health }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unreachable' });
      });
    return () => controller.abort();
  }, []);

  return (
    <p role="status" aria-live="polite">
      API: {state.kind === 'loading' && <span className="muted">checking…</span>}
      {state.kind === 'ok' && (
        <span className="badge badge-success">online · v{state.health.version}</span>
      )}
      {state.kind === 'error' && (
        <span className="badge badge-danger">offline ({state.message})</span>
      )}
    </p>
  );
}
