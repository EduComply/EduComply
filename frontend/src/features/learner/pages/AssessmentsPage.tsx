import { Link } from 'react-router-dom';
import { DemoNotice } from '@/components/ui';
import { demoAssessments, findCourse } from '../demoData';

/** Figma frame 1:5 "EduComply / Assessments". */
export function AssessmentsPage() {
  return (
    <>
      <h2 className="section-title">Your assessments</h2>
      <DemoNotice>
        Demonstration assessments: answers are scored in your browser and never saved. Real attempts
        with server-side grading arrive in Sprint 4.
      </DemoNotice>
      <ul className="assessment-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {demoAssessments.map((a) => {
          const course = findCourse(a.courseId);
          const passed = a.status === 'PASSED';
          return (
            <li key={a.id}>
              <article className="assessment-card" aria-labelledby={`assessment-${a.id}`}>
                <h3 id={`assessment-${a.id}`}>{a.title}</h3>
                <p className="meta">
                  {a.questions.length} questions · {a.minutes} minutes
                  {course && <> · {course.title}</>}
                </p>
                <div className="row">
                  <span className={`pill ${passed ? 'pill-passed' : 'pill-pending'}`}>
                    {passed ? 'Passed (demo)' : 'Pending'}
                  </span>
                  {passed ? (
                    <Link
                      className="btn btn-success"
                      to={`/learner/assessments/${a.id}/result`}
                      state={{ answers: a.demoAnswers ?? [] }}
                      aria-label={`View result: ${a.title}`}
                    >
                      View Result
                    </Link>
                  ) : (
                    <Link
                      className="btn btn-primary"
                      to={`/learner/assessments/${a.id}`}
                      aria-label={`Start assessment: ${a.title}`}
                    >
                      Start assessment
                    </Link>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </>
  );
}
