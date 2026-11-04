import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { config } from '@/config';
import type { NavItem } from '@/navigation';

interface AppShellProps {
  /** Portal root, e.g. "/learner" or "/admin". */
  basePath: string;
  portalLabel: string;
  nav: NavItem[];
}

/** Sidebar + top bar layout shared by the learner and admin portals (Figma layout). */
export function AppShell({ basePath, portalLabel, nav }: AppShellProps) {
  const { pathname } = useLocation();
  const current = nav.find((item) => pathname.startsWith(`${basePath}/${item.path}`));

  return (
    <div className="shell">
      <aside className="sidebar" aria-label={`${portalLabel} navigation`}>
        <NavLink to={basePath} className="brand">
          <span className="brand-mark" aria-hidden="true">
            ✓
          </span>
          {config.appName}
        </NavLink>
        <nav>
          <ul className="nav">
            {nav.map((item) => (
              <li key={item.path}>
                <NavLink to={`${basePath}/${item.path}`}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">{portalLabel}</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{current?.label ?? portalLabel}</h1>
          <span className="badge badge-neutral">Not signed in</span>
        </header>
        <main className="content" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
