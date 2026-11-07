import { useAuth } from '@/auth/authContext';
import { AppShell } from '@/components/layout/AppShell';
import { adminNav, adminPageTitles } from '@/navigation';

/**
 * Admin portal shell: the learner portal's AppShell (same Figma sidebar, top bar, drawer)
 * with navigation filtered to the signed-in role. Rendered inside <RequireAuth roles>.
 */
export function AdminLayout() {
  const { state } = useAuth();
  const roles = state.status === 'authenticated' ? state.user.roles : [];
  const nav = adminNav.filter((item) => item.roles.some((r) => roles.includes(r)));
  const badge = roles.includes('ADMIN') ? 'Administrator' : 'Reviewer';
  return (
    <AppShell
      basePath="/admin"
      portalLabel="Admin portal"
      nav={nav}
      pageTitles={adminPageTitles}
      badge={badge}
    />
  );
}
