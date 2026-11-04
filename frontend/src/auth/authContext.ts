import { createContext, useContext } from 'react';
import type { Me } from './session';

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: Me }
  | { status: 'anonymous' }
  | { status: 'error' };

interface AuthContextValue {
  state: AuthState;
  /** Re-reads GET /me (e.g. after the session may have changed). */
  refresh(): Promise<void>;
  /** POST /auth/logout with the CSRF token, then continue to the IdP logout page. */
  signOut(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
