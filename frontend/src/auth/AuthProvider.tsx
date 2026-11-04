import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthState } from './authContext';
import { fetchMe, logout } from './session';

export interface AuthProviderProps {
  children: ReactNode;
  /** Navigation hook (replaced in tests). */
  navigate?: (url: string) => void;
}

/** Source of truth for the signed-in user: the API session, read from GET /me. */
export function AuthProvider({
  children,
  navigate = (url) => window.location.assign(url),
}: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const user = await fetchMe();
      setState(user ? { status: 'authenticated', user } : { status: 'anonymous' });
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchMe()
      .then((user) => {
        if (active) setState(user ? { status: 'authenticated', user } : { status: 'anonymous' });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    if (state.status !== 'authenticated') return;
    const idpLogoutUrl = await logout(state.user.csrfToken);
    setState({ status: 'anonymous' });
    // Ends the Keycloak session too; Keycloak returns to the portal home page.
    navigate(idpLogoutUrl ?? '/');
  }, [state, navigate]);

  const value = useMemo(() => ({ state, refresh, signOut }), [state, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
