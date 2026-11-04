import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/authContext';
import { Icon } from '@/components/icons';
import { config } from '@/config';
import { initials } from '@/lib/format';
import type { NavItem } from '@/navigation';
import bellIcon from '@/assets/figma/bell-icon.svg';
import logo from '@/assets/figma/educomply-logo.png';
import logoutIcon from '@/assets/figma/logout-icon.svg';

interface AppShellProps {
  /** Portal root, e.g. "/learner" or "/admin". */
  basePath: string;
  portalLabel: string;
  nav: NavItem[];
  /** Top-bar titles for nested pages that are not sidebar items. */
  pageTitles?: Array<{ pattern: RegExp; title: string }>;
  /** Optional label under the logo, e.g. "Administrator". */
  badge?: string;
}

/**
 * Figma "Layout / Sidebar + Header": gradient sidebar (logo, navigation, Log out) and a
 * top bar (page title, Search, Notifications, avatar). Below 960 px the sidebar becomes an
 * off-canvas drawer opened by the menu button.
 */
export function AppShell({ basePath, portalLabel, nav, pageTitles = [], badge }: AppShellProps) {
  const { pathname } = useLocation();
  const { state, signOut } = useAuth();
  // Open state is tied to the path it was opened on, so navigating closes it automatically.
  const [navOpenAt, setNavOpenAt] = useState<string | null>(null);
  const [notificationsOpenAt, setNotificationsOpenAt] = useState<string | null>(null);
  const navOpen = navOpenAt === pathname;
  const notificationsOpen = notificationsOpenAt === pathname;
  const setNavOpen = (open: boolean) => setNavOpenAt(open ? pathname : null);
  const setNotificationsOpen = (open: boolean) => setNotificationsOpenAt(open ? pathname : null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebarId = useId();
  const notificationsId = useId();

  const current = nav.find((item) => pathname.startsWith(`${basePath}/${item.path}`));
  const title =
    pageTitles.find((t) => t.pattern.test(pathname))?.title ?? current?.label ?? portalLabel;
  const user = state.status === 'authenticated' ? state.user : null;

  useEffect(() => {
    document.title = `${title} · ${config.appName}`;
  }, [title]);

  // Escape closes the drawer / popover and returns focus to the menu button.
  useEffect(() => {
    if (!navOpen && !notificationsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (navOpen) menuButton.current?.focus();
      setNavOpenAt(null);
      setNotificationsOpenAt(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const handleSignOut = () => {
    setSigningOut(true);
    setSignOutFailed(false);
    signOut().catch(() => {
      setSigningOut(false);
      setSignOutFailed(true);
    });
  };

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside id={sidebarId} className="sidebar" aria-label={`${portalLabel} navigation`}>
        <Link to={`${basePath}/dashboard`} className="sidebar-logo">
          <img src={logo} alt={config.appName} />
        </Link>
        {badge && <p className="sidebar-badge">{badge}</p>}
        <button
          type="button"
          className="sidebar-close"
          aria-label="Close menu"
          onClick={() => {
            setNavOpen(false);
            menuButton.current?.focus();
          }}
        >
          <Icon name="close" />
        </button>
        <nav aria-label={portalLabel}>
          <ul className="nav">
            {nav.map((item) => (
              <li key={item.path}>
                <NavLink to={`${basePath}/${item.path}`}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <button
          type="button"
          className="logout-button"
          onClick={handleSignOut}
          disabled={signingOut || !user}
        >
          <span>{signingOut ? 'Logging out…' : 'Log out'}</span>
          <img src={logoutIcon} alt="" width={26} height={26} />
        </button>
        {signOutFailed && (
          <p role="alert" className="badge badge-danger" style={{ marginTop: 8 }}>
            Log out failed. Try again.
          </p>
        )}
      </aside>
      <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setNavOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button
            ref={menuButton}
            type="button"
            className="menu-button"
            aria-label="Open menu"
            aria-controls={sidebarId}
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <Icon name="menu" size={24} />
          </button>
          <h1>{title}</h1>
          <div className="topbar-actions">
            <Link className="topbar-link" to={`${basePath}/training`} aria-label="Search training">
              <Icon name="search" size={16} className="label" />
              <span className="label">Search</span>
            </Link>
            <div className="notifications">
              <button
                type="button"
                className="topbar-link"
                aria-expanded={notificationsOpen}
                aria-controls={notificationsId}
                onClick={() => setNotificationsOpen(!notificationsOpen)}
              >
                <img src={bellIcon} alt="" width={20} height={20} />
                <span className="label">Notifications</span>
              </button>
              {notificationsOpen && (
                <div
                  id={notificationsId}
                  className="popover"
                  role="dialog"
                  aria-label="Notifications"
                >
                  <p>
                    <strong>No notifications.</strong>
                  </p>
                  <p className="muted">
                    Assignment and deadline notifications arrive in a later sprint.
                  </p>
                </div>
              )}
            </div>
            {user && (
              <Link
                to={`${basePath}/profile`}
                className="avatar"
                aria-label={`${user.displayName} (${user.roles.join(', ')}) — view profile`}
                title={`${user.displayName} · ${user.roles.join(', ')}`}
              >
                {initials(user.displayName)}
              </Link>
            )}
          </div>
        </header>
        <main className="content" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
