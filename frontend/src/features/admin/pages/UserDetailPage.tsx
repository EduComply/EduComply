import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/authContext';
import type { Role } from '@/auth/session';
import { Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { Icon } from '@/components/icons';
import { formatDateTime, initials } from '@/lib/format';
import avatarCircle from '@/assets/figma/avatar-circle.svg';
import {
  changeUserRole,
  describeEvent,
  getUser,
  listAuditEvents,
  ROLES,
  type AdminUser,
} from '../adminApi';
import { AccountStatus, ConfirmDialog, RoleBadge } from '../components';
import { errorMessage, useResource } from '../useResource';
import { ApiError } from '@/lib/api';

const ROLE_HELP: Record<Role, string> = {
  LEARNER: 'Completes assigned training and assessments.',
  ADMIN: 'Manages users, content, enrolments and settings.',
  REVIEWER: 'Reviews monitoring flags, reports and the audit log.',
};

function RoleChangeForm({
  user,
  onChanged,
}: {
  user: AdminUser;
  onChanged: (u: AdminUser) => void;
}) {
  const { state, refresh } = useAuth();
  const current = user.roles[0]!;
  const [role, setRole] = useState<Role>(current);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const me = state.status === 'authenticated' ? state.user : null;
  const isSelf = me?.id === user.id;
  const valid = role !== current && reason.trim().length >= 5;

  if (isSelf) {
    return (
      <p className="muted">
        You cannot change your own role. Another administrator must make this change.
      </p>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (valid) setConfirming(true);
  };

  const confirm = async () => {
    if (!me) return;
    setBusy(true);
    try {
      const updated = await changeUserRole(user.id, role, reason.trim(), me.csrfToken);
      setSuccess(
        `Role changed from ${current} to ${updated.roles[0]}. The change is recorded in the audit log.`,
      );
      setReason('');
      onChanged(updated);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.status === 401) void refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <form onSubmit={submit} className="role-form" noValidate>
      <fieldset className="role-options">
        <legend className="sr-only">Role</legend>
        {ROLES.map((r) => (
          <label key={r} className="answer role-option">
            <input
              type="radio"
              name="role"
              value={r}
              checked={role === r}
              onChange={() => {
                setRole(r);
                setSuccess(null);
              }}
            />
            <span>
              <span>
                <strong>{r}</strong>
                {r === current && <span className="muted"> (current)</span>}
              </span>
              <span className="muted role-help">{ROLE_HELP[r]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label htmlFor="role-reason" className="field-label">
        Reason for the change <span className="muted">(required, recorded in the audit log)</span>
      </label>
      <textarea
        id="role-reason"
        className="input textarea"
        value={reason}
        maxLength={500}
        rows={3}
        onChange={(e) => setReason(e.target.value)}
        aria-describedby="role-reason-hint"
      />
      <p id="role-reason-hint" className="muted field-hint">
        At least 5 characters, e.g. “Sprint 1 reviewer for monitoring flags”.
      </p>
      {error && (
        <p role="alert" className="alert alert-error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="alert alert-success">
          {success}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
        Change role…
      </button>

      {confirming && (
        <ConfirmDialog
          title="Confirm role change"
          confirmLabel={`Make ${role}`}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void confirm()}
        >
          <p>
            Change <strong>{user.displayName}</strong> from <strong>{current}</strong> to{' '}
            <strong>{role}</strong>?
          </p>
          {role === 'ADMIN' && (
            <p className="alert alert-warning">
              Administrators can manage all users and change roles. Grant only to trusted staff.
            </p>
          )}
          <p className="muted">Reason: “{reason.trim()}”</p>
        </ConfirmDialog>
      )}
    </form>
  );
}

/** ADMIN: user detail from GET /users/{id}, activity from GET /audit-events, role change. */
export function UserDetailPage() {
  const { userId = '' } = useParams();
  const [updated, setUpdated] = useState<AdminUser | null>(null);
  const user = useResource(`user|${userId}`, (signal) => getUser(userId, signal));
  const activity = useResource(`user-activity|${userId}|${updated?.updatedAt ?? ''}`, (signal) =>
    listAuditEvents({ targetId: userId, limit: 10 }, signal),
  );

  const back = (
    <Link className="back-link" to="/admin/users">
      <Icon name="arrowLeft" size={16} /> Users
    </Link>
  );

  if (user.status === 'loading') return <LoadingState label="Loading user…" />;
  if (user.status === 'error') {
    const notFound = user.error instanceof ApiError && user.error.status === 404;
    return (
      <>
        {back}
        {notFound ? (
          <EmptyState title="User not found" message="The user does not exist or was removed." />
        ) : (
          <ErrorState
            title="User could not be loaded"
            message={errorMessage(user.error)}
            action={
              <button type="button" className="btn btn-secondary" onClick={user.reload}>
                Try again
              </button>
            }
          />
        )}
      </>
    );
  }

  const u = updated?.id === user.data.id ? updated : user.data;

  return (
    <>
      {back}
      <div className="profile-layout">
        <Card className="profile-card" title="Account">
          <div className="avatar-large" aria-hidden="true">
            <img src={avatarCircle} alt="" width={110} height={110} />
            <span>{initials(u.displayName)}</span>
          </div>
          <p className="profile-name">{u.displayName}</p>
          <p className="profile-email">{u.email}</p>
          <div className="badge-row">
            {u.roles.map((r) => (
              <RoleBadge key={r} role={r} />
            ))}
            <AccountStatus active={u.isActive} />
          </div>
        </Card>

        <div className="stack">
          <Card title="Details">
            <dl className="details-grid">
              <div>
                <dt>User type</dt>
                <dd>{u.userType.charAt(0) + u.userType.slice(1).toLowerCase()}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd className={u.department ? '' : 'unavailable'}>
                  {u.department ?? 'Not provided'}
                </dd>
              </div>
              <div>
                <dt>Learner ID</dt>
                <dd className={u.institutionalId ? '' : 'unavailable'}>
                  {u.institutionalId ?? 'Not provided'}
                </dd>
              </div>
              <div>
                <dt>Last sign-in</dt>
                <dd>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(u.createdAt)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDateTime(u.updatedAt)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Role">
            <RoleChangeForm user={u} onChanged={setUpdated} />
          </Card>

          <Card title="Recent account activity">
            {activity.status === 'loading' && <LoadingState label="Loading activity…" />}
            {activity.status === 'error' && (
              <p className="muted">Activity unavailable: {errorMessage(activity.error)}</p>
            )}
            {activity.status === 'ok' &&
              (activity.data.data.length === 0 ? (
                <p className="muted">No recorded activity for this user.</p>
              ) : (
                <ul className="activity-feed">
                  {activity.data.data.map((e) => (
                    <li key={e.id}>
                      <span className="activity-what">{describeEvent(e)}</span>
                      <span className="muted">
                        {formatDateTime(e.at)}
                        {e.reason ? ` · “${e.reason}”` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ))}
          </Card>
        </div>
      </div>
    </>
  );
}
