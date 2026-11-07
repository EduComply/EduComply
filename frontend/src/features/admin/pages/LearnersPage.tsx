import { FutureFeature } from '../components';
import { UserTable } from './UsersPage';

/**
 * ADMIN: learner-focused view of the real user list (role = LEARNER) with learner columns.
 * Training assignment and progress columns fill in when enrolments exist (Sprint 2).
 */
export function LearnersPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Learner accounts</h2>
          <p className="muted page-description">
            Users with the learner role. Open a learner to see their account and activity.
          </p>
        </div>
      </div>
      <FutureFeature sprint={2}>
        Course assignment, enrolment status and training progress per learner will appear here once
        the enrolment API exists. Bulk CSV enrolment is a later enhancement.
      </FutureFeature>
      <UserTable
        fixedRole="LEARNER"
        columns={['learnerId', 'status', 'lastLogin', 'training']}
        emptyTitle="No learners yet"
      />
    </>
  );
}
