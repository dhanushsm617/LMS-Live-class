import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { errMsg, useCheckoutMutation, useEnrollFreeMutation, useGetCourseQuery } from '../services/api.js';
import { selectUser } from '../features/auth/authSlice.js';
import { Thumb } from '../components/CourseCard.jsx';
import { ErrorBox, ProgressBar, Spinner } from '../components/ui.jsx';
import { formatDuration, formatMoney } from '../utils/format.js';

export default function CourseDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const { data, isLoading, error } = useGetCourseQuery(slug);
  const [enrollFree, { isLoading: enrolling }] = useEnrollFreeMutation();
  const [checkout, { isLoading: paying }] = useCheckoutMutation();
  const [actionError, setActionError] = useState(null);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const { course, lessons, quizCount, upcomingLiveClasses, access, enrollment } = data;
  const isFree = course.price === 0;
  const canLearn = access === 'enrolled' || access === 'owner' || access === 'admin';

  const buy = async () => {
    setActionError(null);
    if (!user) return navigate('/login', { state: { from: `/courses/${course.slug}` } });
    try {
      if (isFree) {
        await enrollFree(course.id).unwrap();
        navigate(`/learn/${course.id}`);
        return;
      }
      const res = await checkout(course.id).unwrap();
      if (res.mode === 'stripe') window.location.assign(res.url);
      else navigate(`/checkout/mock/${res.paymentId}`, { state: { amount: res.amount, currency: res.currency, courseTitle: res.courseTitle } });
    } catch (e) {
      setActionError(errMsg(e));
    }
  };

  const sections = lessons.reduce((acc, l) => {
    (acc[l.section] ||= []).push(l);
    return acc;
  }, {});

  return (
    <div className="detail">
      <div>
        <div className="small muted">{course.category} · {course.level}</div>
        <h1>{course.title}</h1>
        <p className="lead">{course.subtitle}</p>
        <p className="muted">
          By <strong>{course.instructor?.name}</strong> · {course.lessonCount} lessons
          {course.durationSec ? ` · ${formatDuration(course.durationSec)}` : ''} · {course.enrollmentCount} learners
        </p>

        <h2>About this course</h2>
        <p className="prewrap">{course.description}</p>

        <h2>Curriculum</h2>
        {Object.entries(sections).map(([name, items]) => (
          <div className="card section" key={name}>
            <div className="section-title">{name}</div>
            <ul className="plain">
              {items.map((l) => (
                <li key={l.id} className="row between">
                  <span>{l.title}</span>
                  <span className="small muted">
                    {l.isPreview && <span className="badge badge-blue">Free preview</span>} {formatDuration(l.durationSec)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {quizCount > 0 && <p className="muted">Includes {quizCount} auto-graded quiz{quizCount > 1 ? 'zes' : ''} and a verifiable certificate on completion.</p>}

        <h2>Your instructor</h2>
        <div className="card pad">
          <strong>{course.instructor?.name}</strong>
          <p className="muted">{course.instructor?.bio}</p>
        </div>
      </div>

      <aside className="card buy-box">
        <Thumb course={course} />
        <div className="pad stack">
          <div className="price big">{isFree ? 'Free' : formatMoney(course.price, course.currency)}</div>
          {enrollment && (
            <>
              <ProgressBar value={enrollment.percent} />
              <span className="small muted">{enrollment.percent}% complete</span>
            </>
          )}
          {canLearn ? (
            <Link className="btn btn-primary block" to={`/learn/${course.id}`}>{enrollment?.percent ? 'Continue learning' : 'Go to course'}</Link>
          ) : (
            <button className="btn btn-primary block" onClick={buy} disabled={enrolling || paying}>
              {enrolling || paying ? 'Please wait…' : isFree ? 'Enroll for free' : 'Buy now'}
            </button>
          )}
          <ErrorBox>{actionError}</ErrorBox>
          <ul className="plain small muted">
            <li>✓ {course.lessonCount} on-demand video lessons</li>
            {quizCount > 0 && <li>✓ {quizCount} graded quiz{quizCount > 1 ? 'zes' : ''}</li>}
            {upcomingLiveClasses > 0 && <li>✓ {upcomingLiveClasses} upcoming live class{upcomingLiveClasses > 1 ? 'es' : ''}</li>}
            <li>✓ Certificate of completion</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
