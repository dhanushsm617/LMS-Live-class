import { Link, useParams } from 'react-router-dom';
import { useMyCertificatesQuery, useVerifyCertificateQuery } from '../services/api.js';
import { Empty, ErrorBox, Spinner } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';

export function Certificates() {
  const { data, isLoading, error } = useMyCertificatesQuery();
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <h1>My certificates</h1>
      {data.items.length === 0 && <Empty title="No certificates yet">Finish every lesson and pass the required quizzes to earn one.</Empty>}
      <div className="grid-cards">
        {data.items.map((c) => (
          <div key={c.id} className="card pad stack cert">
            <div className="cert-seal" aria-hidden="true">🎓</div>
            <h3>{c.courseTitle}</h3>
            <p className="muted small">Issued {formatDate(c.issuedAt)} · {c.instructorName}</p>
            <code className="small">{c.code}</code>
            <div className="row">
              <a className="btn btn-primary" href={`/api/certificates/${c.id}/download`}>Download PDF</a>
              <Link className="btn" to={`/verify/${c.code}`}>Public link</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Public page – employers can paste a certificate code to confirm it is genuine. */
export function VerifyCertificate() {
  const { code } = useParams();
  const { data, isLoading, error } = useVerifyCertificateQuery(code);
  if (isLoading) return <Spinner label="Verifying…" />;
  if (error || !data?.valid) {
    return (
      <div className="card pad auth stack">
        <h1>Certificate not found</h1>
        <p className="muted">We couldn’t find a certificate with code <code>{code}</code>. Check the code and try again.</p>
      </div>
    );
  }
  return (
    <div className="card pad auth stack">
      <div className="alert alert-ok">✓ This certificate is valid</div>
      <h1 className="h-sm">{data.studentName}</h1>
      <p>completed <strong>{data.courseTitle}</strong></p>
      <p className="muted small">Instructor: {data.instructorName} · Issued {formatDate(data.issuedAt)}</p>
      <code className="small">{data.code}</code>
    </div>
  );
}
