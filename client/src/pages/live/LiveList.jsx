import { Link } from 'react-router-dom';
import { useUpcomingLiveQuery } from '../../services/api.js';
import { Empty, ErrorBox, Spinner, StatusBadge } from '../../components/ui.jsx';
import { formatDateTime } from '../../utils/format.js';

export default function LiveList() {
  const { data, isLoading, error } = useUpcomingLiveQuery(undefined, { pollingInterval: 20000 });
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <h1>Live classes</h1>
      {data.items.length === 0 && <Empty title="Nothing scheduled">Live classes for your courses show up here.</Empty>}
      <div className="stack">
        {data.items.map((l) => (
          <div className="card pad row between wrap" key={l.id}>
            <div>
              <div className="row"><strong>{l.title}</strong> <StatusBadge status={l.status} /></div>
              <div className="small muted">{l.course?.title} · {formatDateTime(l.scheduledAt)} · {l.durationMin} min</div>
              {l.description && <p className="small">{l.description}</p>}
            </div>
            <Link className={`btn ${l.status === 'live' ? 'btn-primary' : ''}`} to={`/live/${l.id}`}>
              {l.status === 'live' ? 'Join now' : 'Open'}
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}
