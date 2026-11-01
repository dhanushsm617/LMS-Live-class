import { useState } from 'react';
import { errMsg, useCreateQuizMutation, useUpdateQuizMutation } from '../services/api.js';
import { ErrorBox } from './ui.jsx';

const blankQuestion = () => ({
  prompt: '',
  type: 'single',
  points: 1,
  explanation: '',
  options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }],
});

/** Instructor quiz builder (create or edit). */
export default function QuizEditor({ courseId, lessons = [], quiz, onClose }) {
  const [create, { isLoading: creating }] = useCreateQuizMutation();
  const [update, { isLoading: updating }] = useUpdateQuizMutation();
  const [error, setError] = useState(null);
  const [form, setForm] = useState(() =>
    quiz
      ? {
          title: quiz.title,
          description: quiz.description || '',
          lesson: quiz.lesson || '',
          passPercent: quiz.passPercent,
          maxAttempts: quiz.maxAttempts,
          required: quiz.required,
          questions: quiz.questions.map((q) => ({ prompt: q.prompt, type: q.type, points: q.points, explanation: q.explanation || '', options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) })),
        }
      : { title: '', description: '', lesson: '', passPercent: 60, maxAttempts: 0, required: true, questions: [blankQuestion()] }
  );

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setQ = (qi, patch) => set({ questions: form.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });
  const setOpt = (qi, oi, patch) =>
    setQ(qi, { options: form.questions[qi].options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });

  const changeType = (qi, type) => {
    if (type === 'truefalse') setQ(qi, { type, options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }] });
    else setQ(qi, { type });
  };

  const markCorrect = (qi, oi) => {
    const q = form.questions[qi];
    if (q.type === 'multiple') setOpt(qi, oi, { isCorrect: !q.options[oi].isCorrect });
    else setQ(qi, { options: q.options.map((o, i) => ({ ...o, isCorrect: i === oi })) });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const body = { ...form, lesson: form.lesson || undefined, passPercent: Number(form.passPercent), maxAttempts: Number(form.maxAttempts), questions: form.questions.map((q) => ({ ...q, points: Number(q.points) })) };
    try {
      if (quiz) await update({ id: quiz._id, ...body }).unwrap();
      else await create({ courseId, ...body }).unwrap();
      onClose();
    } catch (err) {
      const fieldErrors = err?.data?.errors && Object.values(err.data.errors).flat().join(' · ');
      setError(fieldErrors || errMsg(err));
    }
  };

  return (
    <form className="card pad stack" onSubmit={submit}>
      <h3>{quiz ? 'Edit quiz' : 'New quiz'}</h3>
      <div className="grid-2">
        <label>Title<input required value={form.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label>
          Show after lesson (optional)
          <select value={form.lesson} onChange={(e) => set({ lesson: e.target.value })}>
            <option value="">End of course</option>
            {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </label>
        <label>Pass mark (%)<input type="number" min="1" max="100" value={form.passPercent} onChange={(e) => set({ passPercent: e.target.value })} /></label>
        <label>Max attempts (0 = unlimited)<input type="number" min="0" max="50" value={form.maxAttempts} onChange={(e) => set({ maxAttempts: e.target.value })} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={form.required} onChange={(e) => set({ required: e.target.checked })} /> Students must pass this quiz to complete the course</label>

      {form.questions.map((q, qi) => (
        <fieldset key={qi} className="question">
          <legend>Question {qi + 1}</legend>
          <label>Prompt<input required value={q.prompt} onChange={(e) => setQ(qi, { prompt: e.target.value })} /></label>
          <div className="grid-2">
            <label>
              Type
              <select value={q.type} onChange={(e) => changeType(qi, e.target.value)}>
                <option value="single">Single choice</option>
                <option value="multiple">Multiple choice</option>
                <option value="truefalse">True / false</option>
              </select>
            </label>
            <label>Points<input type="number" min="1" max="10" value={q.points} onChange={(e) => setQ(qi, { points: e.target.value })} /></label>
          </div>
          {q.options.map((o, oi) => (
            <div className="row" key={oi}>
              <input
                type={q.type === 'multiple' ? 'checkbox' : 'radio'}
                name={`correct-${qi}`}
                checked={o.isCorrect}
                onChange={() => markCorrect(qi, oi)}
                aria-label={`Option ${oi + 1} is correct`}
              />
              <input required className="grow" placeholder={`Option ${oi + 1}`} value={o.text} readOnly={q.type === 'truefalse'} onChange={(e) => setOpt(qi, oi, { text: e.target.value })} />
              {q.type !== 'truefalse' && q.options.length > 2 && (
                <button type="button" className="btn btn-ghost" onClick={() => setQ(qi, { options: q.options.filter((_, i) => i !== oi) })}>✕</button>
              )}
            </div>
          ))}
          {q.type !== 'truefalse' && q.options.length < 8 && (
            <button type="button" className="btn btn-ghost" onClick={() => setQ(qi, { options: [...q.options, { text: '', isCorrect: false }] })}>+ Add option</button>
          )}
          <label>Explanation shown after answering<input value={q.explanation} onChange={(e) => setQ(qi, { explanation: e.target.value })} /></label>
          {form.questions.length > 1 && (
            <button type="button" className="btn btn-ghost danger" onClick={() => set({ questions: form.questions.filter((_, i) => i !== qi) })}>Remove question</button>
          )}
        </fieldset>
      ))}
      <button type="button" className="btn" onClick={() => set({ questions: [...form.questions, blankQuestion()] })}>+ Add question</button>

      <ErrorBox>{error}</ErrorBox>
      <div className="row">
        <button className="btn btn-primary" disabled={creating || updating}>{creating || updating ? 'Saving…' : 'Save quiz'}</button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}
