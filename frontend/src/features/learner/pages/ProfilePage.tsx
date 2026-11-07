import type { ReactNode } from 'react';
import { Card } from '@/components/ui';
import { formatDateTime, initials } from '@/lib/format';
import avatarCircle from '@/assets/figma/avatar-circle.svg';
import { useUser } from '../useUser';

function Detail({ label, value }: { label: string; value: ReactNode | null | undefined }) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div>
      <dt>{label}</dt>
      <dd className={missing ? 'unavailable' : ''}>
        {missing ? 'Not provided by your institution' : value}
      </dd>
    </div>
  );
}

/** Figma frame 1:9 "EduComply / Profile" — real data from GET /api/v1/me. */
export function ProfilePage() {
  const user = useUser();
  const userType = user.userType.charAt(0) + user.userType.slice(1).toLowerCase();

  return (
    <div className="profile-layout">
      <Card className="profile-card" title="Learner profile">
        <div className="avatar-large" aria-hidden="true">
          <img src={avatarCircle} alt="" width={110} height={110} />
          <span>{initials(user.displayName)}</span>
        </div>
        <p className="profile-name">{user.displayName}</p>
        <p className="profile-email">{user.email}</p>
        <p className="badge badge-neutral">{user.roles.join(', ')}</p>
      </Card>

      <Card
        title="Personal details"
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled
            aria-describedby="profile-source"
            style={{ minWidth: 190 }}
          >
            Edit Profile
          </button>
        }
      >
        <p id="profile-source" className="muted" style={{ marginBottom: 24, fontSize: 13 }}>
          These details come from your institutional account and cannot be edited in EduComply.
        </p>
        <dl className="details-grid">
          <Detail label="Full name" value={user.displayName} />
          <Detail label="Email" value={user.email} />
          <Detail label="User type" value={userType} />
          <Detail label="Department" value={user.department} />
          <Detail label="Learner ID" value={user.institutionalId} />
          <Detail
            label="Last sign-in"
            value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : null}
          />
          <Detail label="Account status" value={user.isActive ? 'Active' : 'Inactive'} />
          <Detail label="Member since" value={formatDateTime(user.createdAt)} />
        </dl>
      </Card>
    </div>
  );
}
