import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Role } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { Icon } from '@/components/icons';
import { formatDateTime } from '@/lib/format';
import { listUsers, ROLES, type AdminUser } from '../adminApi';
import { AccountStatus, RoleBadge } from '../components';
import { errorMessage, useResource } from '../useResource';

export interface UserTableProps {
  /** Fixed role filter (Learners page) — hides the role selector. */
  fixedRole?: Role;
  columns: Array<'role' | 'status' | 'lastLogin' | 'learnerId' | 'training'>;
  emptyTitle: string;
}

/** Searchable, paginated table of real users from GET /users. */
export function UserTable({ fixedRole, columns, emptyTitle }: UserTableProps) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | ''>(fixedRole ?? '');
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);

  const users = useResource(`users|${query}|${role}|${cursor ?? ''}`, (signal) =>
    listUsers(
      {
        ...(query ? { q: query } : {}),
        ...(role ? { role } : {}),
        limit: 25,
        ...(cursor ? { cursor } : {}),
      },
      signal,
    ),
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setCursors([]);
    setQuery(draft.trim());
  };

  return (
    <>
      <form className="toolbar" role="search" onSubmit={submit}>
        <div className="search-field">
          <Icon name="search" size={18} />
          <label htmlFor="user-search" className="sr-only">
            Search by name or email
          </label>
          <input
            id="user-search"
            className="input"
            type="search"
            placeholder="Search by name or email"
            value={draft}
            maxLength={100}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        {!fixedRole && (
          <>
            <label htmlFor="user-role" className="sr-only">
              Filter by role
            </label>
            <select
              id="user-role"
              className="select"
              value={role}
              onChange={(e) => {
                setCursors([]);
                setRole(e.target.value as Role | '');
              }}
            >
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0) + r.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </>
        )}
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {users.status === 'loading' && <LoadingState label="Loading users…" />}
      {users.status === 'error' && (
        <ErrorState
          title="Users could not be loaded"
          message={errorMessage(users.error)}
          action={
            <button type="button" className="btn btn-secondary" onClick={users.reload}>
              Try again
            </button>
          }
        />
      )}
      {users.status === 'ok' &&
        (users.data.data.length === 0 ? (
          <EmptyState
            icon="user"
            title={emptyTitle}
            message={
              query ? `No results for “${query}”.` : 'Users appear after their first sign-in.'
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">Users</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    {columns.includes('learnerId') && <th scope="col">Learner ID</th>}
                    {columns.includes('role') && <th scope="col">Role</th>}
                    {columns.includes('status') && <th scope="col">Status</th>}
                    {columns.includes('lastLogin') && <th scope="col">Last sign-in</th>}
                    {columns.includes('training') && <th scope="col">Assigned training</th>}
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.data.map((u: AdminUser) => (
                    <tr key={u.id}>
                      <td className="strong">{u.displayName}</td>
                      <td>{u.email}</td>
                      {columns.includes('learnerId') && (
                        <td>{u.institutionalId ?? <span className="muted">Not provided</span>}</td>
                      )}
                      {columns.includes('role') && (
                        <td>
                          {u.roles.map((r) => (
                            <RoleBadge key={r} role={r} />
                          ))}
                        </td>
                      )}
                      {columns.includes('status') && (
                        <td>
                          <AccountStatus active={u.isActive} />
                        </td>
                      )}
                      {columns.includes('lastLogin') && (
                        <td>
                          {u.lastLoginAt ? (
                            formatDateTime(u.lastLoginAt)
                          ) : (
                            <span className="muted">Never</span>
                          )}
                        </td>
                      )}
                      {columns.includes('training') && (
                        <td className="muted">Enrolments arrive in Sprint 2</td>
                      )}
                      <td>
                        <Link to={`/admin/users/${u.id}`} aria-label={`View ${u.displayName}`}>
                          View
                        </Link>
                      </td>
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
                Page {cursors.length + 1} · {users.data.data.length} shown
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!users.data.page.nextCursor}
                onClick={() => {
                  const next = users.data.page.nextCursor;
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

/** ADMIN: all users (real data from GET /users). */
export function UsersPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">All users</h2>
          <p className="muted page-description">
            Everyone who has signed in to EduComply. Roles are changed on the user’s page and every
            change is audited.
          </p>
        </div>
      </div>
      <UserTable columns={['role', 'status', 'lastLogin']} emptyTitle="No users found" />
    </>
  );
}
