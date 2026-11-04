import { Link } from 'react-router-dom';
import { Card, DemoNotice, ProgressBar, StatTile } from '@/components/ui';
import { firstName, formatDateTime, isoDay } from '@/lib/format';
import {
  courseStatus,
  demoAssessments,
  demoCalendarEvents,
  demoCourses,
  overallProgress,
} from '../demoData';
import { useUser } from '../useUser';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Small month grid (Figma "Training calendar" card). */
function MiniCalendar({ today }: { today: Date }) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const eventDays = new Set(
    demoCalendarEvents
      .map((e) => new Date(`${e.date}T00:00:00`))
      .filter((d) => d.getFullYear() === year && d.getMonth() === month)
      .map((d) => d.getDate()),
  );
  const monthName = today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <>
      <p className="month-label">{monthName}</p>
      <table className="mini-calendar" aria-label={`${monthName} calendar`}>
        <thead>
          <tr>
            {WEEKDAYS.map((d, i) => (
              <th key={i} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, w) => (
            <tr key={w}>
              {week.map((day, i) => (
                <td
                  key={i}
                  className={[
                    day === today.getDate() ? 'is-today' : '',
                    day && eventDays.has(day) ? 'has-event' : '',
                  ].join(' ')}
                >
                  {day && <span>{day}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Figma frame 1:2 "EduComply / Dashboard". */
export function DashboardPage() {
  const user = useUser();
  const inProgress = demoCourses.filter((c) => courseStatus(c) === 'IN_PROGRESS');
  const completed = demoCourses.filter((c) => courseStatus(c) === 'COMPLETED');
  const pending = demoAssessments.filter((a) => a.status === 'PENDING');
  const resume = [...inProgress].sort((a, b) => b.progress - a.progress)[0];
  const overall = overallProgress();
  const today = new Date();
  const upcoming = demoCalendarEvents.filter((e) => e.date >= isoDay(today)).slice(0, 3);

  return (
    <>
      <section className="welcome-banner" aria-labelledby="welcome-title">
        <div>
          <h2 id="welcome-title">Welcome back, {firstName(user.displayName)}!</h2>
          <p>
            Continue your training and stay on track.
            {user.lastLoginAt && (
              <span className="sr-only"> Last sign-in {formatDateTime(user.lastLoginAt)}.</span>
            )}
          </p>
        </div>
        {resume && (
          <Link className="btn btn-primary" to={`/learner/training/${resume.id}`}>
            Continue Learning
          </Link>
        )}
      </section>

      <div style={{ marginTop: 25 }}>
        <DemoNotice>
          Course assignments, progress and assessments below are sample content until the course and
          assessment services arrive (Sprints 2–4). Your name and sign-in are real.
        </DemoNotice>
      </div>

      <div className="stat-grid dashboard-stats">
        <StatTile
          label={`${demoCourses.length} Assigned courses`}
          value={demoCourses.length}
          tone="info"
        />
        <StatTile
          label={`${inProgress.length} In progress`}
          value={inProgress.length}
          tone="success"
        />
        <StatTile label={`${completed.length} Completed`} value={completed.length} tone="success" />
        <StatTile
          label={`${pending.length} Pending assessment${pending.length === 1 ? '' : 's'}`}
          value={pending.length}
          tone="danger"
        />
      </div>

      <div className="grid-2">
        <Card title="Continue learning">
          {inProgress.length === 0 ? (
            <p className="muted">Nothing in progress. Start a course from My Training.</p>
          ) : (
            inProgress.map((course) => (
              <div className="continue-row" key={course.id}>
                <div>
                  <p className="course-name">{course.title}</p>
                  <ProgressBar
                    value={course.progress}
                    label={`${course.title} progress`}
                    showValue={false}
                  />
                </div>
                <Link
                  className="btn btn-primary"
                  to={`/learner/training/${course.id}`}
                  aria-label={`Resume ${course.title}`}
                >
                  Resume
                </Link>
              </div>
            ))
          )}
        </Card>

        <Card title="Overall progress" className="overall-card">
          <p className="overall-value" aria-hidden="true">
            {overall}%
          </p>
          <ProgressBar
            value={overall}
            label="Overall training progress"
            showValue={false}
            tone="success"
          />
        </Card>

        <Card title="Pending training activities">
          {pending.length === 0 ? (
            <p className="muted">No pending activities.</p>
          ) : (
            <ul className="activity-list">
              {pending.map((a) => (
                <li key={a.id}>
                  <span>{a.title}</span>
                  <Link to={`/learner/assessments/${a.id}`}>Start</Link>
                </li>
              ))}
              {upcoming.map((e) => (
                <li key={`${e.date}-${e.title}`} className="muted">
                  <span>{e.title}</span>
                  <span>
                    {new Date(`${e.date}T00:00:00`).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Training calendar" actions={<Link to="/learner/calendar">Open</Link>}>
          <MiniCalendar today={today} />
        </Card>
      </div>
    </>
  );
}
