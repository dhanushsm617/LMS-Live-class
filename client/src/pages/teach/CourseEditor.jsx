import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  api, errMsg, useAddLessonMutation, useCancelLiveMutation, useCourseStudentsQuery, useDeleteLessonMutation, useDeleteQuizMutation,
  useEndLiveMutation, useManageCourseQuery, useReorderLessonsMutation, useScheduleLiveMutation, useStartLiveMutation,
  useSubmitCourseMutation, useUpdateCourseMutation, useUpdateLessonMutation,
} from '../../services/api.js';
import { uploadVideo } from '../../services/upload.js';
import QuizEditor from '../../components/QuizEditor.jsx';
import { ErrorBox, ProgressBar, Spinner, StatusBadge } from '../../components/ui.jsx';
import { formatDateTime, formatDuration } from '../../utils/format.js';

/* One lesson row: rename, preview toggle, reorder, delete and video upload with live processing status. */
function LessonRow({ lesson, index, total, onMove }) {
  const [updateLesson] = useUpdateLessonMutation();
  const [deleteLesson] = useDeleteLessonMutation();
  const dispatch = useDispatch();
  const fileRef = useRef(null);
  const [uploadPct, setUploadPct] = useState(null);
  const [err, setErr] = useState(null);
  const status = lesson.video.status;

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(null);
    setUploadPct(0);
    try {
      await uploadVideo(lesson.id, file, setUploadPct);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setUploadPct(null);
      dispatch(api.util.invalidateTags(['Manage']));
    }
  };

  return (
    <li className="lesson-row">
      <div className="row between wrap">
        <div className="row">
          <div className="stack-tight">
            <button className="btn btn-ghost sm" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label="Move up">▲</button>
            <button className="btn btn-ghost sm" disabled={index === total - 1} onClick={() => onMove(index, 1)} aria-label="Move down">▼</button>
          </div>
          <div>
            <strong>{lesson.title}</strong> <span className="small muted">· {lesson.section}</span>
            <div className="small muted">
              <StatusBadge status={status} />{' '}
              {status === 'processing' && `Encoding ${lesson.video.progress}%`}
              {status === 'ready' && `${formatDuration(lesson.video.durationSec)} · ${lesson.video.renditions.join(', ')}`}
              {status === 'failed' && <span className="danger">{lesson.video.error}</span>}
            </div>
          </div>
        </div>
        <div className="row wrap">
          <label className="check small"><input type="checkbox" checked={lesson.isPreview} onChange={(e) => updateLesson({ id: lesson.id, isPreview: e.target.checked })} /> Free preview</label>
          <input ref={fileRef} type="file" accept="video/*" hidden onChange={onFile} />
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploadPct !== null || status === 'processing'}>
            {status === 'none' ? 'Upload video' : 'Replace video'}
          </button>
          <button className="btn btn-ghost danger" onClick={() => window.confirm(`Delete “${lesson.title}” and its video?`) && deleteLesson(lesson.id)}>Delete</button>
        </div>
      </div>
      {uploadPct !== null && <><ProgressBar value={uploadPct} label="Upload progress" /><div className="small muted">Uploading… {uploadPct}%</div></>}
      {status === 'processing' && <ProgressBar value={lesson.video.progress} label="Encoding progress" />}
      <ErrorBox>{err}</ErrorBox>
    </li>
  );
}

export default function CourseEditor() {
  const { courseId } = useParams();
  // Poll while any video is queued/processing so the instructor sees status change without reloading
  const [poll, setPoll] = useState(0);
  const { data, isLoading, error } = useManageCourseQuery(courseId, { pollingInterval: poll });
  const [updateCourse] = useUpdateCourseMutation();
  const [submitCourse, { isLoading: submitting }] = useSubmitCourseMutation();
  const [addLesson] = useAddLessonMutation();
  const [reorder] = useReorderLessonsMutation();
  const [deleteQuiz] = useDeleteQuizMutation();
  const [scheduleLive] = useScheduleLiveMutation();
  const [startLive] = useStartLiveMutation();
  const [endLive] = useEndLiveMutation();
  const [cancelLive] = useCancelLiveMutation();
  const { data: students } = useCourseStudentsQuery(courseId);

  const [msg, setMsg] = useState(null);
  const [lessonForm, setLessonForm] = useState({ title: '', section: 'Lessons' });
  const [quizEditing, setQuizEditing] = useState(null); // null | 'new' | quiz
  const [liveForm, setLiveForm] = useState({ title: '', scheduledAt: '', durationMin: 60 });

  const busy = data?.lessons.some((l) => ['queued', 'processing'].includes(l.video.status));
  useEffect(() => setPoll(busy ? 3000 : 0), [busy]);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const { course, lessons, quizzes, liveClasses } = data;
  const locked = ['pending'].includes(course.status);

  const run = async (fn, okText) => {
    setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ tone: 'ok', text: okText });
    } catch (e) {
      const fields = e?.data?.errors && Object.values(e.data.errors).flat().join(' · ');
      setMsg({ tone: 'error', text: fields || errMsg(e) });
    }
  };

  const move = (index, dir) => {
    const ids = lessons.map((l) => l.id);
    [ids[index], ids[index + dir]] = [ids[index + dir], ids[index]];
    run(() => reorder({ courseId, ids }).unwrap());
  };

  return (
    <>
      <div className="row between wrap">
        <div>
          <Link to="/teach" className="small">← All courses</Link>
          <h1 className="h-sm">{course.title} <StatusBadge status={course.status} /></h1>
          {course.reviewNote && <div className="alert alert-warn">Admin feedback: {course.reviewNote}</div>}
        </div>
        <div className="row">
          {['draft', 'rejected'].includes(course.status) && (
            <button className="btn btn-primary" disabled={submitting} onClick={() => run(() => submitCourse(courseId).unwrap(), 'Submitted for review. An admin will publish it shortly.')}>Submit for review</button>
          )}
          {course.status === 'published' && <Link className="btn" to={`/courses/${course.slug}`}>View public page</Link>}
        </div>
      </div>
      {msg && <div className={`alert alert-${msg.tone}`} role="status">{msg.text}</div>}
      {locked && <div className="alert alert-warn">This course is awaiting admin review.</div>}

      <h2>Lessons</h2>
      <div className="card pad">
        <ul className="plain">
          {lessons.length === 0 && <li className="muted">No lessons yet – add the first one below.</li>}
          {lessons.map((l, i) => <LessonRow key={l.id} lesson={l} index={i} total={lessons.length} onMove={move} />)}
        </ul>
        <form className="row wrap top-gap" onSubmit={(e) => { e.preventDefault(); run(async () => { await addLesson({ courseId, ...lessonForm }).unwrap(); setLessonForm({ ...lessonForm, title: '' }); }); }}>
          <input required className="grow" placeholder="New lesson title" value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} />
          <input placeholder="Section" value={lessonForm.section} onChange={(e) => setLessonForm({ ...lessonForm, section: e.target.value })} />
          <button className="btn btn-primary">Add lesson</button>
        </form>
        <p className="small muted">Videos are encoded in the background (FFmpeg → HLS, 360p/720p/1080p) – you can leave this page while they process.</p>
      </div>

      <h2>Quizzes</h2>
      {quizEditing ? (
        <QuizEditor courseId={courseId} lessons={lessons} quiz={quizEditing === 'new' ? null : quizEditing} onClose={() => setQuizEditing(null)} />
      ) : (
        <div className="card pad stack">
          {quizzes.length === 0 && <span className="muted">No quizzes yet.</span>}
          {quizzes.map((q) => (
            <div className="row between" key={q._id}>
              <span><strong>{q.title}</strong> <span className="small muted">· {q.questions.length} questions · pass {q.passPercent}%{q.required ? ' · required' : ''}</span></span>
              <span className="row">
                <button className="btn" onClick={() => setQuizEditing(q)}>Edit</button>
                <button className="btn btn-ghost danger" onClick={() => window.confirm('Delete this quiz and all attempts?') && deleteQuiz(q._id)}>Delete</button>
              </span>
            </div>
          ))}
          <div><button className="btn" onClick={() => setQuizEditing('new')}>+ New quiz</button></div>
        </div>
      )}

      <h2>Live classes</h2>
      <div className="card pad stack">
        {liveClasses.length === 0 && <span className="muted">No live classes scheduled.</span>}
        {liveClasses.filter((l) => l.status !== 'cancelled').map((l) => (
          <div className="row between wrap" key={l._id}>
            <span><strong>{l.title}</strong> <StatusBadge status={l.status} /> <span className="small muted">{formatDateTime(l.scheduledAt)} · {l.durationMin} min</span></span>
            <span className="row">
              {l.status === 'scheduled' && <button className="btn" onClick={() => run(() => startLive(l._id).unwrap())}>Go live</button>}
              {l.status === 'live' && (
                <>
                  <Link className="btn btn-primary" to={`/live/${l._id}`}>Open room</Link>
                  <button className="btn btn-ghost danger" onClick={() => run(() => endLive(l._id).unwrap())}>End</button>
                </>
              )}
              {l.status === 'scheduled' && <button className="btn btn-ghost danger" onClick={() => run(() => cancelLive(l._id).unwrap())}>Cancel</button>}
            </span>
          </div>
        ))}
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); run(async () => { await scheduleLive({ courseId, title: liveForm.title, scheduledAt: new Date(liveForm.scheduledAt).toISOString(), durationMin: Number(liveForm.durationMin) }).unwrap(); setLiveForm({ title: '', scheduledAt: '', durationMin: 60 }); }, 'Live class scheduled'); }}>
          <input required className="grow" placeholder="Class title" value={liveForm.title} onChange={(e) => setLiveForm({ ...liveForm, title: e.target.value })} />
          <input required type="datetime-local" aria-label="Start time" value={liveForm.scheduledAt} onChange={(e) => setLiveForm({ ...liveForm, scheduledAt: e.target.value })} />
          <input type="number" min="5" max="480" aria-label="Duration in minutes" style={{ width: 90 }} value={liveForm.durationMin} onChange={(e) => setLiveForm({ ...liveForm, durationMin: e.target.value })} />
          <button className="btn">Schedule</button>
        </form>
      </div>

      <h2>Settings</h2>
      <CourseSettings course={course} onSave={(body) => run(() => updateCourse({ id: courseId, ...body }).unwrap(), 'Saved')} />

      <h2>Students ({students?.items.length ?? 0})</h2>
      <div className="card">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Progress</th><th>Status</th></tr></thead>
          <tbody>
            {students?.items.map((s) => <tr key={s.id}><td>{s.name}</td><td className="muted">{s.email}</td><td style={{ minWidth: 140 }}><ProgressBar value={s.percent} /></td><td>{s.status === 'completed' ? '🎓 Completed' : `${s.percent}%`}</td></tr>)}
            {students?.items.length === 0 && <tr><td colSpan="4" className="muted">No students yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CourseSettings({ course, onSave }) {
  const [form, setForm] = useState({ title: course.title, subtitle: course.subtitle || '', description: course.description, price: course.price / 100 });
  return (
    <form className="card pad stack" onSubmit={(e) => { e.preventDefault(); onSave({ ...form, price: Math.round(Number(form.price) * 100) }); }}>
      <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>Subtitle<input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></label>
      <label>Description<textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <label>Price (₹, 0 = free)<input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
      <div><button className="btn">Save changes</button></div>
    </form>
  );
}
