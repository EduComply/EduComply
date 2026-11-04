import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/authContext';
import { Card, DemoNotice, EmptyState, ErrorState, LoadingState, StatTile } from '@/components/ui';
import { firstName, formatDateTime } from '@/lib/format';
import { demoAssessments, demoCourses } from '@/features/learner/demoData';
import { describeEvent, listAuditEvents, listUsers, type AdminUser } from '../adminApi';
import { errorMessage, useResource } from '../useResource';

const SHORTCUTS = [
  {
    to: '/admin/users',
    title: 'User management',
    text: 'Search users, review accounts and change roles (audited).',
    adminOnly: true,
  },
  {
    to: '/admin/courses',
    title: 'Training management',
    text: 'Courses and training videos. Management arrives in Sprints 2–3.',
    adminOnly: true,
  },
  {
    to: '/admin/question-banks',
    title: 'Assessment management',
    text: 'Question banks and pass marks. Management arrives in Sprint 2.',
    adminOnly: true,
  },
  {
    to: '/admin/reports',
    title: 'Compliance reports',
    text: 'Completion, assessment and monitoring reports arrive in Sprint 6.',
    adminOnly: false,
  },
];

/** Admin overview. Users and recent activity are live; content statistics are demo data. */
export function AdminDashboardPage() {
  const { state } = useAuth();
  const me = state.status === 'authenticated' ? state.user : null;
  const isAdmin = me?.roles.includes('ADMIN') ?? false;

  const users = useResource(isAdmin ? 'users-100' : 'users-skip', (signal) =>
    isAdmin ? listUsers({ limit: 100 }, signal) : Promise.resolve(null),
  );
  const activity = useResource('audit-recent', (signal) => listAuditEvents({ limit: 8 }, signal));

  const names = new Map<string, string>();
  if (users.status === 'ok' && users.data) {
    for (const u of users.data.data as AdminUser[]) names.set(u.id, u.displayName);
  }
  if (me) names.set(me.id, me.displayName);

  const userCount =
    users.status === 'ok' && users.data
      ? `${users.data.data.length}${users.data.page.nextCursor ? '+' : ''}`
      : users.status === 'loading' && isAdmin
        ? '…'
        : '—';
  const activeLearners =
    users.status === 'ok' && users.data
      ? users.data.data.filter((u) => u.isActive && u.roles.includes('LEARNER')).length
      : '—';

  return (
    <>
      <section className="welcome-banner admin-banner" aria-labelledby="admin-welcome">
        <div>
          <h2 id="admin-welcome">Welcome, {me ? firstName(me.displayName) : 'administrator'}</h2>
          <p>Manage users and oversee institutional compliance training.</p>
        </div>
        {isAdmin && (
          <Link className="btn btn-primary" to="/admin/users">
            Manage users
          </Link>
        )}
      </section>

      <h2 className="subsection-title">Live overview</h2>
      <div className="stat-grid">
        <StatTile
          label="Registered users"
          value={userCount}
          hint={isAdmin ? 'From the user database' : 'Visible to administrators'}
          tone="info"
        />
        <StatTile
          label="Active learners"
          value={activeLearners}
          hint="Learner role, active"
          tone="success"
        />
      </div>

      <h2 className="subsection-title">Training content</h2>
      <DemoNotice>
        The figures below describe the sample learner-portal content, not real courses. Course,
        video and assessment management arrive in Sprints 2–4.
      </DemoNotice>
      <div className="stat-grid">
        <StatTile label="Courses (demo)" value={demoCourses.length} tone="neutral" />
        <StatTile
          label="Videos (demo)"
          value={demoCourses.reduce((n, c) => n + c.lessons.length, 0)}
          tone="neutral"
        />
        <StatTile label="Question banks (demo)" value={demoAssessments.length} tone="neutral" />
        <StatTile
          label="Open monitoring flags"
          value="—"
          hint="Monitoring arrives in Sprint 5"
          tone="neutral"
        />
      </div>

      <div className="grid-2 admin-dashboard-grid">
        <Card title="Shortcuts">
          <ul className="shortcut-grid">
            {SHORTCUTS.filter((s) => isAdmin || !s.adminOnly).map((s) => (
              <li key={s.to}>
                <Link to={s.to} className="shortcut">
                  <strong>{s.title}</strong>
                  <span className="muted">{s.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Recent activity">
          {activity.status === 'loading' && <LoadingState label="Loading activity…" />}
          {activity.status === 'error' && (
            <ErrorState
              title="Activity unavailable"
              message={errorMessage(activity.error)}
              action={
                <button type="button" className="btn btn-secondary" onClick={activity.reload}>
                  Try again
                </button>
              }
            />
          )}
          {activity.status === 'ok' &&
            (activity.data.data.length === 0 ? (
              <EmptyState
                title="No activity yet"
                message="Sign-ins and role changes appear here."
              />
            ) : (
              <ul className="activity-feed">
                {activity.data.data.map((e) => (
                  <li key={e.id}>
                    <span className="activity-what">{describeEvent(e)}</span>
                    <span className="muted">
                      {e.actorId ? (names.get(e.actorId) ?? 'User') : 'System'} ·{' '}
                      {formatDateTime(e.at)}
                    </span>
                  </li>
                ))}
              </ul>
            ))}
        </Card>
      </div>
    </>
  );
}
