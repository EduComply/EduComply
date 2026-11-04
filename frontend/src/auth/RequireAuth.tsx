import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ErrorState, LoadingState } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAuth } from './authContext';
import { loginUrl, type Role } from './session';

/**
 * Route guard. Content renders only for a valid server session (GET /me). The backend
 * enforces the same rules on every API call; this guard only decides what the UI shows.
 */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { state, refresh } = useAuth();
  const { pathname, search } = useLocation();

  if (state.status === 'loading') {
    return (
      <div className="gate">
        <LoadingState label="Checking your session…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="gate">
        <ErrorState
          title="Sign-in service unavailable"
          message="We could not check your session. Please try again shortly."
          action={
            <button type="button" className="btn btn-primary" onClick={() => void refresh()}>
              Try again
            </button>
          }
        />
      </div>
    );
  }

  if (state.status === 'anonymous') {
    return (
      <div className="gate">
        <div className="card gate-card">
          <span className="gate-icon">
            <Icon name="shield" size={32} />
          </span>
          <h1>{state.expired ? 'Your session has expired' : 'Sign in to continue'}</h1>
          <p className="muted">
            {state.expired
              ? 'For your security you were signed out after a period of inactivity.'
              : 'This area is available to signed-in learners and staff.'}
          </p>
          <a className="btn btn-primary" href={loginUrl(`${pathname}${search}`)}>
            Sign in with institutional account
          </a>
        </div>
      </div>
    );
  }

  if (roles && !state.user.roles.some((r) => roles.includes(r))) {
    return (
      <div className="gate">
        <ErrorState
          title="You don't have access to this area"
          message={`This section requires the ${roles.join(' or ')} role.`}
          action={
            <a className="btn btn-primary" href="/learner/dashboard">
              Go to the learner portal
            </a>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
