import { useState } from 'react';
import { errMsg, useGetQuizQuery, useSubmitAttemptMutation } from '../services/api.js';
import { Badge, ErrorBox, Spinner } from './ui.jsx';

/** Student-facing quiz: answer → submit → instant auto-graded feedback. */
export default function QuizRunner({ quizId, onFinished }) {
  const { data, isLoading, error } = useGetQuizQuery(quizId);
  const [submit, { isLoading: submitting }] = useSubmitAttemptMutation();
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  if (isLoading) return <Spinner label="Loading quiz…" />;
  if (error) return <ErrorBox error={error} />;
  const { quiz, attempts = 0 } = data;
  const exhausted = quiz.maxAttempts > 0 && attempts >= quiz.maxAttempts && !result;

  const toggle = (q, idx) =>
    setAnswers((a) => {
      const cur = a[q._id] || [];
      if (q.type === 'multiple') return { ...a, [q._id]: cur.includes(idx) ? cur.filter((i) => i !== idx) : [...cur, idx] };
      return { ...a, [q._id]: [idx] };
    });

  const allAnswered = quiz.questions.every((q) => (answers[q._id] || []).length > 0);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    try {
      const body = { quizId, answers: quiz.questions.map((q) => ({ question: q._id, selected: answers[q._id] || [] })) };
      const res = await submit(body).unwrap();
      setResult(res);
      onFinished?.(res);
    } catch (err) {
      setSubmitError(errMsg(err));
    }
  };

  const reviewFor = (qid) => result?.review.find((r) => r.question === qid);

  return (
    <form className="card pad quiz" onSubmit={onSubmit}>
      <div className="row between">
        <h2>{quiz.title}</h2>
        <Badge tone="blue">Pass mark {quiz.passPercent}%</Badge>
      </div>
      {quiz.description && <p className="muted">{quiz.description}</p>}
      <p className="small muted">
        {quiz.questions.length} questions · attempt {attempts + 1}
        {quiz.maxAttempts > 0 ? ` of ${quiz.maxAttempts}` : ''}
      </p>

      {result && (
        <div className={`alert ${result.attempt.passed ? 'alert-ok' : 'alert-warn'}`} role="status">
          <strong>{result.attempt.passed ? 'Passed! ' : 'Not passed yet. '}</strong>
          You scored {result.attempt.score}/{result.attempt.maxScore} ({result.attempt.percent}%).
          {!result.attempt.passed && result.attemptsLeft !== 0 && ' Review the feedback and try again.'}
          {result.certificate && <> 🎓 Course complete – your certificate is ready.</>}
        </div>
      )}

      {quiz.questions.map((q, qi) => {
        const rev = reviewFor(q._id);
        return (
          <fieldset key={q._id} className={`question ${rev ? (rev.correct ? 'q-right' : 'q-wrong') : ''}`} disabled={!!result}>
            <legend>
              {qi + 1}. {q.prompt}{' '}
              <span className="small muted">({q.points} pt{q.points > 1 ? 's' : ''}{q.type === 'multiple' ? ' · select all that apply' : ''})</span>
            </legend>
            {q.options.map((o, oi) => {
              const checked = (answers[q._id] || []).includes(oi);
              const isCorrectOpt = rev?.correctOptions?.includes(oi);
              return (
                <label key={oi} className={`option ${isCorrectOpt ? 'opt-correct' : ''}`}>
                  <input
                    type={q.type === 'multiple' ? 'checkbox' : 'radio'}
                    name={`q-${q._id}`}
                    checked={checked}
                    onChange={() => toggle(q, oi)}
                  />
                  <span>{o.text}</span>
                </label>
              );
            })}
            {rev && (
              <p className="small feedback">
                {rev.correct ? '✓ Correct. ' : '✗ Not quite. '}
                {rev.explanation}
              </p>
            )}
          </fieldset>
        );
      })}

      <ErrorBox>{submitError}</ErrorBox>
      {exhausted && <ErrorBox>You have used all attempts for this quiz.</ErrorBox>}
      <div className="row">
        {!result ? (
          <button className="btn btn-primary" disabled={!allAnswered || submitting || exhausted}>
            {submitting ? 'Grading…' : 'Submit answers'}
          </button>
        ) : (
          !result.attempt.passed &&
          result.attemptsLeft !== 0 && (
            <button type="button" className="btn btn-primary" onClick={() => { setResult(null); setAnswers({}); }}>
              Try again
            </button>
          )
        )}
        {!allAnswered && !result && <span className="small muted">Answer every question to submit.</span>}
      </div>
    </form>
  );
}
