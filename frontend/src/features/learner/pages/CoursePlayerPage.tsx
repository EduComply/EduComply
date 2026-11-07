import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DemoNotice, EmptyState } from '@/components/ui';
import { Icon } from '@/components/icons';
import { formatClock } from '@/lib/format';
import { findCourse } from '../demoData';
import { VideoPlayer } from '../VideoPlayer';

/** Figma frame 1:4 "EduComply / Video Learning" — prototype player with course outline. */
export function CoursePlayerPage() {
  const { courseId } = useParams();
  const course = findCourse(courseId);
  const startAt = course ? Math.min(course.completedLessons, course.lessons.length - 1) : 0;
  const [index, setIndex] = useState(startAt);
  // Lessons watched during this visit only (not saved; progress tracking is Sprint 3).
  const [watched, setWatched] = useState<Set<number>>(
    () => new Set(Array.from({ length: course?.completedLessons ?? 0 }, (_, i) => i)),
  );

  if (!course) {
    return (
      <EmptyState
        title="Course not found"
        message="This course is not in your assigned training."
        action={
          <Link className="btn btn-primary" to="/learner/training">
            Back to My Training
          </Link>
        }
      />
    );
  }

  const lesson = course.lessons[index]!;
  const isLast = index === course.lessons.length - 1;

  return (
    <>
      <Link className="back-link" to="/learner/training">
        <Icon name="arrowLeft" size={16} /> My Training
      </Link>
      <div className="player-layout">
        <div>
          <VideoPlayer
            key={lesson.id}
            title={lesson.title}
            onEnded={() => setWatched((w) => new Set(w).add(index))}
          />
          <section className="lesson-panel" aria-labelledby="lesson-title">
            <h2 id="lesson-title">{lesson.title}</h2>
            <p className="lesson-meta">
              {course.title} · Lesson {index + 1} of {course.lessons.length}
            </p>
            <p className="lesson-desc">{lesson.description}</p>
            <div style={{ marginTop: 16 }}>
              <DemoNotice>
                This course and its lessons are samples. The prototype video can be skipped freely
                and viewing is not recorded. Secure, server-validated viewing progress is
                implemented in Sprint 3.
              </DemoNotice>
            </div>
            <div className="lesson-actions">
              {index > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIndex(index - 1)}
                >
                  Previous lesson
                </button>
              )}
              {!isLast && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setIndex(index + 1)}
                >
                  Next lesson
                </button>
              )}
            </div>
          </section>
        </div>

        <aside className="content-panel" aria-labelledby="content-title">
          <h2 id="content-title">Course content</h2>
          <ol className="lesson-list">
            {course.lessons.map((l, i) => (
              <li key={l.id}>
                <button
                  type="button"
                  aria-current={i === index ? 'true' : undefined}
                  onClick={() => setIndex(i)}
                >
                  <span aria-hidden="true">{watched.has(i) ? '✓' : '○'}</span>
                  <span>
                    {l.title}
                    <span className="sr-only">
                      {watched.has(i) ? ', watched' : ', not watched'}
                    </span>
                  </span>
                  <span className="lesson-duration">{formatClock(l.durationSec)}</span>
                </button>
              </li>
            ))}
          </ol>
          {course.assessmentId ? (
            <Link
              className="btn btn-primary btn-block"
              to={`/learner/assessments/${course.assessmentId}`}
            >
              Take assessment
            </Link>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>
              No assessment is attached to this demonstration course.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
