import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthState } from './authContext';
import { fetchMe, logout } from './session';

export interface AuthProviderProps {
  children: ReactNode;
  /** Navigation hook (replaced in tests). */
  navigate?: (url: string) => void;
}

/**
 * Source of truth for the signed-in user: the API session, read from GET /me.
 * The session is re-checked when the tab regains focus, so an expired server session
 * (8 h idle, logout elsewhere) is noticed and protected pages stop showing content.
 */
export function AuthProvider({
  children,
  navigate = (url) => window.location.assign(url),
}: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const wasAuthenticated = useRef(false);

  const apply = useCallback((user: Awaited<ReturnType<typeof fetchMe>>) => {
    if (user) {
      wasAuthenticated.current = true;
      setState({ status: 'authenticated', user });
    } else {
      // Signed in earlier in this tab and now 401: the server session expired.
      setState({ status: 'anonymous', expired: wasAuthenticated.current });
      wasAuthenticated.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await fetchMe());
    } catch {
      setState({ status: 'error' });
    }
  }, [apply]);

  useEffect(() => {
    let active = true;
    fetchMe()
      .then((user) => {
        if (active) apply(user);
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [apply]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && wasAuthenticated.current) void refresh();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    if (state.status !== 'authenticated') return;
    const idpLogoutUrl = await logout(state.user.csrfToken);
    wasAuthenticated.current = false;
    setState({ status: 'anonymous', expired: false });
    // Ends the Keycloak session too; Keycloak returns to the portal home page.
    navigate(idpLogoutUrl ?? '/');
  }, [state, navigate]);

  const value = useMemo(() => ({ state, refresh, signOut }), [state, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
