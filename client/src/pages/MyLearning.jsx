import { Link } from 'react-router-dom';
import { useMyEnrollmentsQuery } from '../services/api.js';
import CourseCard from '../components/CourseCard.jsx';
import { Empty, ErrorBox, Spinner } from '../components/ui.jsx';

export default function MyLearning() {
  const { data, isLoading, error } = useMyEnrollmentsQuery();
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;

  const active = data.items.filter((e) => e.status !== 'completed');
  const done = data.items.filter((e) => e.status === 'completed');

  return (
    <>
      <h1>My learning</h1>
      {data.items.length === 0 && (
        <Empty title="You haven’t enrolled in anything yet">
          <Link to="/">Browse the catalog</Link> to find your first course.
        </Empty>
      )}
      {active.length > 0 && <h2>In progress</h2>}
      <div className="grid-cards">
        {active.map((e) => <CourseCard key={e.id} course={e.course} progress={e.percent} to={`/learn/${e.course.id}`} />)}
      </div>
      {done.length > 0 && <h2>Completed</h2>}
      <div className="grid-cards">
        {done.map((e) => (
          <div key={e.id} className="stack">
            <CourseCard course={e.course} progress={100} to={`/learn/${e.course.id}`} />
            {e.certificate && <a className="btn" href={`/api/certificates/${e.certificate.id}/download`}>🎓 Download certificate</a>}
          </div>
        ))}
      </div>
    </>
  );
}
