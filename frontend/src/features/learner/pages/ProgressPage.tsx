import { Card, DemoNotice, StatTile } from '@/components/ui';
import { formatDate } from '@/lib/format';
import {
  courseStatus,
  demoAverageScore,
  demoCompletionHistory,
  demoCourses,
  demoPerformance,
  findCourse,
  overallProgress,
  statusLabel,
} from '../demoData';

/** Bar colour bands as drawn in Figma (low → high: red, yellow, orange, lime, green). */
function barColor(score: number): string {
  if (score < 50) return 'var(--ec-chart-1)';
  if (score < 55) return 'var(--ec-chart-3)';
  if (score < 70) return 'var(--ec-chart-2)';
  if (score < 85) return 'var(--ec-chart-4)';
  return 'var(--ec-chart-5)';
}

/** Figma frame 1:8 "EduComply / My Progress". */
export function ProgressPage() {
  const overall = overallProgress();
  const completed = demoCourses.filter((c) => courseStatus(c) === 'COMPLETED').length;
  const max = Math.max(...demoPerformance.map((p) => p.score), 1);

  return (
    <>
      <DemoNotice>
        Progress and scores are sample values. Validated progress (Sprint 3) and graded attempts
        (Sprint 4) will replace them; they are not compliance records.
      </DemoNotice>

      <div className="progress-summary">
        <StatTile label={`${overall}% Overall progress`} value={`${overall}%`} tone="info" />
        <StatTile label={`${completed} Completed Courses`} value={completed} tone="success" />
        <StatTile
          label={`${demoAverageScore}% Average Score`}
          value={`${demoAverageScore}%`}
          tone="success"
        />
      </div>

      <div className="grid-2">
        <Card title="Assessment performance">
          <div
            className="chart"
            role="img"
            aria-label={`Average assessment score by month: ${demoPerformance
              .map((p) => `${p.month} ${p.score}%`)
              .join(', ')}`}
          >
            {demoPerformance.map((p) => (
              <div className="chart-bar" key={p.month}>
                <span
                  className="bar"
                  style={{ height: `${(p.score / max) * 220}px`, background: barColor(p.score) }}
                  title={`${p.month}: ${p.score}%`}
                />
                <span className="label" aria-hidden="true">
                  {p.month}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Completion history">
          {demoCompletionHistory.length === 0 ? (
            <p className="muted">No completed courses yet.</p>
          ) : (
            <ul className="history-list">
              {demoCompletionHistory.map((h) => (
                <li key={h.courseId}>
                  {findCourse(h.courseId)?.title}
                  <span className="when">Completed {formatDate(`${h.completedOn}T00:00:00`)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Course progress" className="stack" as="section">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <caption className="sr-only">Progress for each assigned course</caption>
          <thead>
            <tr style={{ textAlign: 'left', fontSize: 13 }}>
              <th scope="col">Course</th>
              <th scope="col">Status</th>
              <th scope="col">Progress</th>
            </tr>
          </thead>
          <tbody>
            {demoCourses.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--ec-border)' }}>
                <td style={{ padding: '10px 0' }}>{c.title}</td>
                <td>{statusLabel[courseStatus(c)]}</td>
                <td>{c.progress}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
