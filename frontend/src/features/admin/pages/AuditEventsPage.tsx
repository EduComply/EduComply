import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/authContext';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import {
  ACTION_LABELS,
  describeEvent,
  listAuditEvents,
  listUsers,
  type AdminUser,
} from '../adminApi';
import { errorMessage, useResource } from '../useResource';

/**
 * ADMIN and REVIEWER: the append-only audit log from GET /audit-events (newest first,
 * cursor pagination, filter by action). Read-only; the API enforces the same roles.
 */
export function AuditEventsPage() {
  const { state } = useAuth();
  const me = state.status === 'authenticated' ? state.user : null;
  const isAdmin = me?.roles.includes('ADMIN') ?? false;
  const [action, setAction] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);

  const events = useResource(`audit|${action}|${cursor ?? ''}`, (signal) =>
    listAuditEvents(
      { limit: 25, ...(action ? { action } : {}), ...(cursor ? { cursor } : {}) },
      signal,
    ),
  );
  // Names for actors/targets: ADMIN can read the user list; REVIEWERs see short ids.
  const users = useResource(isAdmin ? 'audit-users' : 'audit-users-skip', (signal) =>
    isAdmin ? listUsers({ limit: 100 }, signal) : Promise.resolve(null),
  );
  const names = new Map<string, string>();
  if (users.status === 'ok' && users.data) {
    for (const u of users.data.data as AdminUser[]) names.set(u.id, u.displayName);
  }
  if (me) names.set(me.id, me.displayName);
  const who = (id: string | null) =>
    id ? (names.get(id) ?? `${id.slice(0, 8)}…`) : <span className="muted">System</span>;

  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Audit log</h2>
          <p className="muted page-description">
            Sign-ins, account creation, identity links and role changes. Entries cannot be edited or
            deleted.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <label htmlFor="audit-action" className="sr-only">
          Filter by action
        </label>
        <select
          id="audit-action"
          className="select"
          value={action}
          onChange={(e) => {
            setCursors([]);
            setAction(e.target.value);
          }}
        >
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {events.status === 'loading' && <LoadingState label="Loading audit events…" />}
      {events.status === 'error' && (
        <ErrorState
          title="Audit events could not be loaded"
          message={errorMessage(events.error)}
          action={
            <button type="button" className="btn btn-secondary" onClick={events.reload}>
              Try again
            </button>
          }
        />
      )}
      {events.status === 'ok' &&
        (events.data.data.length === 0 ? (
          <EmptyState
            icon="shield"
            title="No audit events"
            message={action ? 'No events match this filter.' : 'Events appear as people sign in.'}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">Audit events</caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Event</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Target</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {events.data.data.map((e) => (
                    <tr key={e.id}>
                      <td>{formatDateTime(e.at)}</td>
                      <td className="strong">{describeEvent(e)}</td>
                      <td>{who(e.actorId)}</td>
                      <td>
                        {e.targetType === 'user' && e.targetId && isAdmin ? (
                          <Link to={`/admin/users/${e.targetId}`}>{who(e.targetId)}</Link>
                        ) : (
                          who(e.targetId)
                        )}
                      </td>
                      <td>{e.reason ?? <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="pager" aria-label="Pagination">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={cursors.length === 0}
                onClick={() => setCursors((c) => c.slice(0, -1))}
              >
                Previous
              </button>
              <span className="muted">
                Page {cursors.length + 1} · {events.data.data.length} shown
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!events.data.page.nextCursor}
                onClick={() => {
                  const next = events.data.page.nextCursor;
                  if (next) setCursors((c) => [...c, next]);
                }}
              >
                Next
              </button>
            </nav>
          </>
        ))}
    </>
  );
}
