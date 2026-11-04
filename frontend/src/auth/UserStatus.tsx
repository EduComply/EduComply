import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './authContext';
import { loginUrl } from './session';

/** Top-bar session indicator: signed-in user with sign-out, or a sign-in link. */
export function UserStatus() {
  const { state, signOut } = useAuth();
  const { pathname, search } = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);

  if (state.status === 'loading') {
    return <span className="muted">Checking session…</span>;
  }
  if (state.status === 'error') {
    return <span className="badge badge-danger">Session service unavailable</span>;
  }
  if (state.status === 'anonymous') {
    return (
      <div className="user-status">
        <span className="badge badge-neutral">Not signed in</span>
        <a className="btn btn-primary" href={loginUrl(`${pathname}${search}`)}>
          Sign in
        </a>
      </div>
    );
  }

  const { user } = state;
  return (
    <div className="user-status">
      <span className="user-name" title={user.email}>
        {user.displayName}
      </span>
      <span className="badge badge-neutral">{user.roles.join(', ')}</span>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={signingOut}
        onClick={() => {
          setSigningOut(true);
          setFailed(false);
          signOut().catch(() => {
            setFailed(true);
            setSigningOut(false);
          });
        }}
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
      {failed && (
        <span role="alert" className="badge badge-danger">
          Sign-out failed
        </span>
      )}
    </div>
  );
}
