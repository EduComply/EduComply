import { Card, DemoNotice, EmptyState } from '@/components/ui';
import { Icon } from '@/components/icons';
import { formatClock } from '@/lib/format';
import {
  courseStatus,
  demoAssessments,
  demoCourses,
  findCourse,
  statusLabel,
} from '@/features/learner/demoData';
import { FutureFeature } from '../components';

function DisabledAction({ label, reason }: { label: string; reason: string }) {
  return (
    <button type="button" className="btn btn-primary" disabled title={reason}>
      {label}
    </button>
  );
}

/** Courses — layout only; course/version management API arrives in Sprint 2. */
export function CoursesPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Course catalogue</h2>
          <p className="muted page-description">Compliance courses, versions and publishing.</p>
        </div>
        <div className="page-actions">
          <DisabledAction label="New course" reason="Available in Sprint 2" />
        </div>
      </div>
      <FutureFeature sprint={2}>
        Creating, editing, publishing and archiving courses (with immutable published versions)
        needs the course management API. The list below shows the sample courses used by the learner
        portal so the layout can be reviewed.
      </FutureFeature>
      <DemoNotice>
        Sample courses from the learner-portal demonstration, not stored courses.
      </DemoNotice>
      <div className="table-wrap">
        <table className="data-table">
          <caption className="sr-only">Sample courses</caption>
          <thead>
            <tr>
              <th scope="col">Course</th>
              <th scope="col">Category</th>
              <th scope="col">Lessons</th>
              <th scope="col">Assessment</th>
              <th scope="col">Learner demo status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {demoCourses.map((c) => (
              <tr key={c.id}>
                <td className="strong">{c.title}</td>
                <td>{c.category}</td>
                <td>{c.lessons.length}</td>
                <td>{c.assessmentId ? 'Yes' : <span className="muted">None</span>}</td>
                <td>{statusLabel[courseStatus(c)]}</td>
                <td>
                  <button type="button" className="btn btn-secondary btn-small" disabled>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Videos — layout and upload placeholder; private S3 + CloudFront delivery is Sprint 3. */
export function VideosPage() {
  const videos = demoCourses.flatMap((c) =>
    c.lessons.map((l) => ({ course: c.title, ...l, key: `${c.id}-${l.id}` })),
  );
  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Training videos</h2>
          <p className="muted page-description">Training videos, captions and processing status.</p>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Upload a training video">
          <div className="upload-zone" aria-disabled="true">
            <Icon name="play" size={28} />
            <p>
              <strong>Uploads are not available yet.</strong>
            </p>
            <p className="muted">
              MP4 video with WebVTT captions. Files will go directly to private storage, never
              through the EduComply API.
            </p>
            <label htmlFor="video-upload" className="btn btn-primary" aria-disabled="true">
              Choose file
            </label>
            <input id="video-upload" type="file" accept="video/mp4" disabled className="sr-only" />
          </div>
        </Card>
        <Card title="Storage and delivery">
          <FutureFeature sprint={3}>
            Videos will be stored in a private Amazon S3 bucket (MinIO locally) and streamed through
            Amazon CloudFront with short-lived signed URLs scoped to one playback session. Upload
            uses pre-signed URLs; storage is not connected in Sprint 1.
          </FutureFeature>
        </Card>
      </div>

      <h2 className="subsection-title">Video library</h2>
      <DemoNotice>
        Every row is a lesson from the sample courses; they all play the same local prototype video.
      </DemoNotice>
      <div className="table-wrap">
        <table className="data-table">
          <caption className="sr-only">Sample video library</caption>
          <thead>
            <tr>
              <th scope="col">Lesson</th>
              <th scope="col">Course</th>
              <th scope="col">Duration</th>
              <th scope="col">Captions</th>
              <th scope="col">Storage</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => (
              <tr key={v.key}>
                <td className="strong">{v.title}</td>
                <td>{v.course}</td>
                <td>{formatClock(v.durationSec)}</td>
                <td>English (sample)</td>
                <td className="muted">Local sample file</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Question banks — overview and question listing; management API arrives in Sprint 2. */
export function QuestionBanksPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Assessment question banks</h2>
          <p className="muted page-description">
            Reusable questions with topics, difficulty and random-selection rules.
          </p>
        </div>
        <div className="page-actions">
          <DisabledAction label="New question bank" reason="Available in Sprint 2" />
        </div>
      </div>
      <FutureFeature sprint={2}>
        Authoring questions, answer feedback, pass marks and retry rules needs the question-bank
        API; server-side grading follows in Sprint 4.
      </FutureFeature>
      <DemoNotice>Banks below are the sample learner-portal quizzes.</DemoNotice>
      <ul className="bank-list">
        {demoAssessments.map((a) => (
          <li key={a.id}>
            <details className="card bank">
              <summary>
                <span className="strong">{a.title}</span>
                <span className="muted">
                  {findCourse(a.courseId)?.title} · {a.questions.length} questions · pass mark{' '}
                  {a.passMark}% · {a.minutes} min
                </span>
              </summary>
              <ol className="question-list">
                {a.questions.map((q) => (
                  <li key={q.id}>
                    {q.text}{' '}
                    <span className="muted">({q.options.length} options, single choice)</span>
                  </li>
                ))}
              </ol>
              <button type="button" className="btn btn-secondary btn-small" disabled>
                Add question (Sprint 2)
              </button>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Monitoring flags — shell only (face-presence monitoring and human review: Sprint 5). */
export function MonitoringPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Monitoring flags</h2>
          <p className="muted page-description">Face-presence flags awaiting human review.</p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Flag status">
        <button type="button" role="tab" aria-selected="true" className="tab active">
          Open
        </button>
        <button type="button" role="tab" aria-selected="false" className="tab" disabled>
          Reviewed
        </button>
        <button type="button" role="tab" aria-selected="false" className="tab" disabled>
          Escalated
        </button>
      </div>
      <Card>
        <EmptyState
          icon="shield"
          title="No monitoring flags"
          message="Monitoring is not active yet, so there is nothing to review."
        />
      </Card>
      <FutureFeature sprint={5}>
        The browser will detect face presence locally and send only event summaries (no recordings).
        Flags never fail a learner automatically: an administrator or reviewer records a decision
        and reason, and every review is audited.
      </FutureFeature>
    </>
  );
}

/** Certificates — shell only (signed PDF certificates and QR verification: Sprint 5). */
export function CertificatesPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Issued certificates</h2>
          <p className="muted page-description">
            Issued certificates, verification and revocation.
          </p>
        </div>
      </div>
      <Card>
        <EmptyState
          icon="check"
          title="No certificates issued"
          message="Certificates are issued automatically when every completion rule is met."
        />
      </Card>
      <FutureFeature sprint={5}>
        Each certificate will carry a unique number, the exact course version and a signed QR
        verification link. Administrators will be able to search, verify and revoke (audited).
      </FutureFeature>
    </>
  );
}

const REPORTS = [
  {
    title: 'Training completion',
    text: 'Completion and overdue status by course, department and learner.',
  },
  { title: 'Assessment results', text: 'Attempts, scores and pass rates per assessment version.' },
  { title: 'Monitoring reviews', text: 'Flags raised, review outcomes and time to review.' },
  { title: 'Audit export', text: 'Security-relevant and administrative actions for a date range.' },
];

/** Reports — shell only; no statistics are shown until real data exists (Sprint 6). */
export function ReportsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Compliance reports</h2>
          <p className="muted page-description">Compliance reporting with CSV and PDF export.</p>
        </div>
      </div>
      <FutureFeature sprint={6}>
        Reports are generated from validated progress, graded attempts and reviewed flags. No
        figures are shown until those records exist.
      </FutureFeature>
      <ul className="report-grid">
        {REPORTS.map((r) => (
          <li key={r.title}>
            <Card title={r.title}>
              <p className="muted">{r.text}</p>
              <div className="page-actions" style={{ marginTop: 18 }}>
                <button type="button" className="btn btn-secondary btn-small" disabled>
                  Export CSV
                </button>
                <button type="button" className="btn btn-secondary btn-small" disabled>
                  Export PDF
                </button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
