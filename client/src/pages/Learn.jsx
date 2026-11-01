import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { errMsg, useCompleteLessonMutation, useCourseLearnQuery, useSavePositionMutation } from '../services/api.js';
import VideoPlayer from '../components/VideoPlayer.jsx';
import QuizRunner from '../components/QuizRunner.jsx';
import { Badge, ErrorBox, ProgressBar, Spinner } from '../components/ui.jsx';
import { formatDuration } from '../utils/format.js';

export default function Learn() {
  const { courseId } = useParams();
  const [search, setSearch] = useSearchParams();
  const { data, isLoading, error } = useCourseLearnQuery(courseId);
  const [savePosition] = useSavePositionMutation();
  const [completeLesson, { isLoading: completing }] = useCompleteLessonMutation();
  const [notice, setNotice] = useState(null);

  const lessons = data?.lessons || [];
  const quizzes = data?.quizzes || [];
  const lessonParam = search.get('lesson');
  const quizParam = search.get('quiz');

  // Resume where the learner left off: explicit selection > last watched > first unfinished > first lesson
  const activeLesson = useMemo(() => {
    if (quizParam) return null;
    return (
      lessons.find((l) => l.id === lessonParam) ||
      lessons.find((l) => l.id === data?.enrollment?.lastLesson) ||
      lessons.find((l) => !l.completed) ||
      lessons[0] ||
      null
    );
  }, [lessons, lessonParam, quizParam, data?.enrollment?.lastLesson]);

  const sections = useMemo(
    () =>
      lessons.reduce((acc, l) => {
        (acc[l.section] ||= []).push(l);
        return acc;
      }, {}),
    [lessons]
  );

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;

  const select = (kind, id) => {
    setNotice(null);
    setSearch({ [kind]: id }, { replace: true });
  };

  const markComplete = async () => {
    setNotice(null);
    try {
      const res = await completeLesson({ courseId, lessonId: activeLesson.id }).unwrap();
      const idx = lessons.findIndex((l) => l.id === activeLesson.id);
      const next = lessons[idx + 1];
      if (res.certificate) setNotice({ tone: 'ok', text: '🎓 Course complete! Your certificate is ready below.' });
      else if (next) select('lesson', next.id);
    } catch (e) {
      setNotice({ tone: 'warn', text: errMsg(e) });
    }
  };

  const enrollment = data.enrollment;
  const activeQuiz = quizParam ? quizzes.find((q) => q.id === quizParam) : null;

  return (
    <div className="learn">
      <section>
        <div className="row between wrap">
          <h1 className="h-sm">{data.course.title}</h1>
          <Link to="/my-learning" className="btn btn-ghost">← My learning</Link>
        </div>

        {enrollment?.status === 'completed' && enrollment.certificate && (
          <div className="alert alert-ok row between wrap">
            <span>🎓 You completed this course.</span>
            <a className="btn btn-primary" href={`/api/certificates/${enrollment.certificate}/download`}>Download certificate (PDF)</a>
          </div>
        )}
        {notice && <div className={`alert alert-${notice.tone}`} role="status">{notice.text}</div>}

        {activeQuiz && <QuizRunner key={activeQuiz.id} quizId={activeQuiz.id} />}

        {!activeQuiz && activeLesson && (
          <>
            {activeLesson.video.status === 'ready' ? (
              <VideoPlayer
                key={activeLesson.id}
                lessonId={activeLesson.id}
                startAt={activeLesson.position}
                onProgress={(seconds) => enrollment && savePosition({ courseId, lessonId: activeLesson.id, seconds })}
                onEnded={() => enrollment && !activeLesson.completed && markComplete()}
              />
            ) : (
              <div className="card pad center muted">
                {activeLesson.video.status === 'none' ? 'This lesson has no video yet.' : 'This video is still being processed – check back soon.'}
              </div>
            )}
            <div className="row between wrap">
              <div>
                <h2 className="h-sm">{activeLesson.title}</h2>
                <p className="muted">{activeLesson.description}</p>
              </div>
              {enrollment &&
                (activeLesson.completed ? (
                  <Badge tone="green">✓ Completed</Badge>
                ) : (
                  <button className="btn btn-primary" onClick={markComplete} disabled={completing}>
                    {completing ? 'Saving…' : 'Mark as complete'}
                  </button>
                ))}
            </div>
          </>
        )}
        {!activeQuiz && !activeLesson && <div className="card pad center muted">This course has no lessons yet.</div>}
      </section>

      <aside className="card side">
        {enrollment && (
          <div className="pad">
            <ProgressBar value={enrollment.percent} label="Course progress" />
            <div className="small muted">{enrollment.percent}% complete</div>
          </div>
        )}
        {Object.entries(sections).map(([name, items]) => (
          <div key={name}>
            <div className="section-title">{name}</div>
            <ul className="plain">
              {items.map((l) => (
                <li key={l.id}>
                  <button className={`lesson-btn ${!quizParam && activeLesson?.id === l.id ? 'active' : ''}`} onClick={() => select('lesson', l.id)}>
                    <span className={`tick ${l.completed ? 'done' : ''}`} aria-hidden="true">{l.completed ? '✓' : ''}</span>
                    <span className="grow">{l.title}</span>
                    <span className="small muted">{formatDuration(l.video.durationSec)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {quizzes.length > 0 && (
          <div>
            <div className="section-title">Quizzes</div>
            <ul className="plain">
              {quizzes.map((q) => (
                <li key={q.id}>
                  <button className={`lesson-btn ${quizParam === q.id ? 'active' : ''}`} onClick={() => select('quiz', q.id)} disabled={!enrollment}>
                    <span className={`tick ${q.passed ? 'done' : ''}`} aria-hidden="true">{q.passed ? '✓' : '?'}</span>
                    <span className="grow">{q.title}{q.required ? '' : ' (optional)'}</span>
                    <span className="small muted">{q.bestPercent !== null ? `${q.bestPercent}%` : `${q.questionCount} Q`}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
