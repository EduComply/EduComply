import { useAuth } from '@/auth/authContext';
import type { Me } from '@/auth/session';

/** The signed-in user. Learner pages render inside <RequireAuth>, so a user is always present. */
export function useUser(): Me {
  const { state } = useAuth();
  if (state.status !== 'authenticated') {
    throw new Error('useUser must be used inside <RequireAuth>');
  }
  return state.user;
}
