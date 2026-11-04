/**
 * Which portal a signed-in user may open and where they land after sign-in. Decided on the
 * server from the user's roles in the database (never from the IdP, email or the browser);
 * the frontend only renders what GET /me reports, and every admin API enforces its own role.
 *
 * Landing priority when several roles apply (documented in README → Authentication):
 *   ADMIN → /admin/dashboard, REVIEWER → /admin/dashboard, LEARNER → /learner/dashboard.
 */
export type Portal = 'admin' | 'learner';

/** Roles that may open each portal (the admin portal further restricts pages per role). */
const PORTAL_ROLES: Record<Portal, readonly string[]> = {
  admin: ['ADMIN', 'REVIEWER'],
  learner: ['LEARNER'],
};

const PORTAL_HOME: Record<Portal, string> = {
  admin: '/admin/dashboard',
  learner: '/learner/dashboard',
};

/** Highest-priority role first. */
const LANDING_PRIORITY: ReadonlyArray<{ role: string; portal: Portal }> = [
  { role: 'ADMIN', portal: 'admin' },
  { role: 'REVIEWER', portal: 'admin' },
  { role: 'LEARNER', portal: 'learner' },
];

export function portalsFor(roles: readonly string[]): Portal[] {
  return (Object.keys(PORTAL_ROLES) as Portal[]).filter((p) =>
    PORTAL_ROLES[p].some((r) => roles.includes(r)),
  );
}

/** Default page after sign-in; "/" (the public landing page) for a user without any role. */
export function homePathFor(roles: readonly string[]): string {
  const match = LANDING_PRIORITY.find((entry) => roles.includes(entry.role));
  return match ? PORTAL_HOME[match.portal] : '/';
}

/** Portal a (sanitised, same-origin) path belongs to, or null for public pages. */
export function portalOfPath(path: string): Portal | null {
  const pathname = path.split(/[?#]/, 1)[0] ?? '';
  for (const portal of Object.keys(PORTAL_ROLES) as Portal[]) {
    if (pathname === `/${portal}` || pathname.startsWith(`/${portal}/`)) return portal;
  }
  return null;
}

/**
 * Where to send the browser after a successful callback. A deep link (e.g. a page the user
 * tried to open before signing in) is kept when the user may open that portal; the public
 * landing page or a portal the user may not use is replaced by the user's home page.
 */
export function postLoginPath(returnTo: string, roles: readonly string[]): string {
  const portal = portalOfPath(returnTo);
  if (portal && portalsFor(roles).includes(portal)) return returnTo;
  return homePathFor(roles);
}
