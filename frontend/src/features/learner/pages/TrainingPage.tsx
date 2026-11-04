import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DemoNotice, EmptyState } from '@/components/ui';
import { Icon } from '@/components/icons';
import { courseStatus, demoCourses, statusLabel, type CourseStatus } from '../demoData';

const ACTION: Record<CourseStatus, string> = {
  NOT_STARTED: 'Start Training',
  IN_PROGRESS: 'Continue Learning',
  COMPLETED: 'Review Training',
};

/** Figma frame 1:3 "EduComply / My Training". */
export function TrainingPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'ALL' | CourseStatus>('ALL');

  const courses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return demoCourses.filter(
      (c) =>
        (status === 'ALL' || courseStatus(c) === status) &&
        (!q || `${c.title} ${c.description} ${c.category}`.toLowerCase().includes(q)),
    );
  }, [query, status]);

  return (
    <>
      <h2 className="section-title">Assigned training courses</h2>
      <DemoNotice>These courses are samples; course assignment arrives in Sprint 2.</DemoNotice>

      <div className="toolbar" role="search">
        <div className="search-field">
          <Icon name="search" size={18} />
          <label htmlFor="course-search" className="sr-only">
            Search courses
          </label>
          <input
            id="course-search"
            className="input"
            type="search"
            placeholder="Search courses"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label htmlFor="course-status" className="sr-only">
          Filter by status
        </label>
        <select
          id="course-status"
          className="select"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="ALL">All courses</option>
          <option value="NOT_STARTED">Not started</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {courses.length} course{courses.length === 1 ? '' : 's'} shown
      </p>

      {courses.length === 0 ? (
        <EmptyState
          icon="search"
          title="No courses match"
          message="Try a different search or status filter."
          action={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setQuery('');
                setStatus('ALL');
              }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <ul className="course-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {courses.map((course) => {
            const s = courseStatus(course);
            return (
              <li key={course.id}>
                <article className="course-card" aria-labelledby={`course-${course.id}`}>
                  <div className="course-thumb" aria-hidden="true">
                    ▶
                  </div>
                  <h3 id={`course-${course.id}`}>{course.title}</h3>
                  <p className="course-meta">
                    {course.category} · {statusLabel[s]}
                  </p>
                  <p className="course-meta">{course.description}</p>
                  <p className="complete-label">{course.progress}% complete</p>
                  <div
                    className="course-progress"
                    role="progressbar"
                    aria-label={`${course.title} progress`}
                    aria-valuenow={course.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    {course.progress > 0 && (
                      <span
                        className={course.progress >= 100 ? 'complete' : ''}
                        style={{ width: `${course.progress}%` }}
                      />
                    )}
                  </div>
                  <Link
                    className="btn btn-teal btn-block"
                    to={`/learner/training/${course.id}`}
                    aria-label={`${ACTION[s]}: ${course.title}`}
                  >
                    {ACTION[s]}
                  </Link>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
