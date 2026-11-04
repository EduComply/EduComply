import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DemoNotice, EmptyState, ProgressBar } from '@/components/ui';
import { findAssessment } from '../demoData';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Figma frame 1:6 "EduComply / Interactive Assessment" — demonstration quiz. */
export function QuizPage() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const assessment = findAssessment(assessmentId);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | undefined>>([]);
  const [warning, setWarning] = useState<string | null>(null);

  if (!assessment) {
    return (
      <EmptyState
        title="Assessment not found"
        action={
          <Link className="btn btn-primary" to="/learner/assessments">
            Back to assessments
          </Link>
        }
      />
    );
  }

  const total = assessment.questions.length;
  const question = assessment.questions[index]!;
  const isLast = index === total - 1;
  const answeredCount = answers.filter((a) => a !== undefined).length;

  const submit = () => {
    const missing = assessment.questions.findIndex((_, i) => answers[i] === undefined);
    if (missing >= 0) {
      setWarning(`Answer every question before submitting. Question ${missing + 1} is unanswered.`);
      setIndex(missing);
      return;
    }
    navigate(`/learner/assessments/${assessment.id}/result`, { state: { answers } });
  };

  return (
    <>
      <DemoNotice>
        This is a demonstration quiz. It is scored in your browser and nothing is saved.
      </DemoNotice>
      <section className="quiz-panel" aria-labelledby="quiz-title">
        <h2 id="quiz-title">{assessment.title}</h2>
        <div className="quiz-body">
          <p className="quiz-count" aria-live="polite">
            Question {index + 1} of {total}
          </p>
          <ProgressBar
            value={((index + 1) / total) * 100}
            label={`Question ${index + 1} of ${total}`}
            showValue={false}
          />

          <fieldset className="quiz-question" key={question.id}>
            <legend>{question.text}</legend>
            {question.options.map((option, i) => (
              <label className="answer" key={option}>
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={i}
                  checked={answers[index] === i}
                  onChange={() => {
                    setWarning(null);
                    setAnswers((prev) => {
                      const next = [...prev];
                      next[index] = i;
                      return next;
                    });
                  }}
                />
                <span className="letter" aria-hidden="true">
                  {LETTERS[i]}
                </span>
                <span>{option}</span>
              </label>
            ))}
          </fieldset>

          {warning && (
            <p role="alert" className="badge badge-danger">
              {warning}
            </p>
          )}

          <div className="quiz-nav">
            <nav aria-label="Questions" className="question-dots">
              {assessment.questions.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  className={answers[i] !== undefined ? 'answered' : ''}
                  aria-current={i === index ? 'step' : undefined}
                  aria-label={`Question ${i + 1}${answers[i] !== undefined ? ', answered' : ''}`}
                  onClick={() => setIndex(i)}
                >
                  {i + 1}
                </button>
              ))}
            </nav>
            <div className="page-actions">
              {index > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIndex(index - 1)}
                >
                  Previous
                </button>
              )}
              {isLast ? (
                <button type="button" className="btn btn-success" onClick={submit}>
                  Submit ({answeredCount}/{total} answered)
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setIndex(index + 1)}
                >
                  Next question
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
