import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { DemoNotice, EmptyState } from '@/components/ui';
import { Icon } from '@/components/icons';
import { findAssessment, scoreAnswers } from '../demoData';

/** Figma frame 1:7 "EduComply / Assessment Results" — demonstration result. */
export function ResultPage() {
  const { assessmentId } = useParams();
  const location = useLocation();
  const assessment = findAssessment(assessmentId);
  const answers = (location.state as { answers?: number[] } | null)?.answers;
  const [reviewing, setReviewing] = useState(false);

  if (!assessment || !answers || answers.length === 0) {
    return (
      <EmptyState
        title="No result to show"
        message="Results are shown right after you complete a demonstration assessment. They are not saved."
        action={
          <Link className="btn btn-primary" to="/learner/assessments">
            Go to assessments
          </Link>
        }
      />
    );
  }

  const result = scoreAnswers(assessment, answers);
  const tone = result.passed ? 'pass' : 'fail';

  return (
    <>
      <DemoNotice>
        Demonstration result calculated in your browser. It is not a graded attempt and is not
        recorded.
      </DemoNotice>
      <section className="results-panel" aria-labelledby="result-title">
        <h2 id="result-title">{assessment.title} — Results</h2>
        <p className={`score ${tone}`}>{result.percent}%</p>
        <p className={`verdict ${tone}`}>{result.passed ? 'PASSED' : 'NOT PASSED'}</p>
        <p className="score-summary">
          {`${result.correct} correct  ·  ${result.total - result.correct} incorrect  ·  Pass mark ${assessment.passMark}%`}
        </p>

        <div className="results-actions">
          <Link className="btn btn-primary" to="/learner/dashboard">
            Back to Dashboard
          </Link>
          <button
            type="button"
            className="btn btn-success"
            aria-expanded={reviewing}
            aria-controls="answer-review"
            onClick={() => setReviewing((v) => !v)}
          >
            {reviewing ? 'Hide Answers' : 'Review Answers'}
          </button>
        </div>

        {reviewing && (
          <ol id="answer-review" className="review-list">
            {assessment.questions.map((question, i) => {
              const chosen = answers[i];
              const right = chosen === question.correct;
              return (
                <li key={question.id}>
                  <strong>
                    {i + 1}. {question.text}
                  </strong>
                  <p className={`result-line ${right ? 'correct' : 'incorrect'}`}>
                    <Icon name={right ? 'check' : 'x'} size={16} />
                    Your answer: {chosen === undefined ? 'No answer' : question.options[chosen]}
                    <span className="sr-only">{right ? ' (correct)' : ' (incorrect)'}</span>
                  </p>
                  {!right && (
                    <p className="result-line">
                      Correct answer: {question.options[question.correct]}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <p style={{ marginTop: 32 }}>
          <Link to={`/learner/assessments/${assessment.id}`}>Retake demonstration</Link> ·{' '}
          <Link to="/learner/assessments">All assessments</Link>
        </p>
      </section>
    </>
  );
}
