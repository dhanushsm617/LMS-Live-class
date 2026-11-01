import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useRevenueQuery } from '../../services/api.js';
import { Empty, ErrorBox, Spinner } from '../../components/ui.jsx';
import { formatDate, formatMoney, monthLabel } from '../../utils/format.js';

const Stat = ({ label, value, hint }) => (
  <div className="card pad stat">
    <div className="small muted">{label}</div>
    <div className="stat-value">{value}</div>
    {hint && <div className="small muted">{hint}</div>}
  </div>
);

export default function Revenue() {
  const { data, isLoading, error } = useRevenueQuery(12);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const cur = data.currency;
  const money = (v) => formatMoney(v, cur);
  const chart = data.monthly.map((m) => ({ ...m, label: monthLabel(m.month), rupees: m.earnings / 100 }));

  return (
    <>
      <div className="row between wrap">
        <h1>Revenue</h1>
        <Link to="/teach" className="btn btn-ghost">← Teaching</Link>
      </div>

      <div className="grid-4">
        <Stat label="Your earnings (all time)" value={money(data.totals.earnings)} hint={`after ${money(data.totals.fees)} platform fees`} />
        <Stat label="This month" value={money(data.thisMonth.earnings)} hint={`${data.thisMonth.sales} sale${data.thisMonth.sales === 1 ? '' : 's'}`} />
        <Stat label="Total sales" value={data.totals.sales} hint={`${money(data.totals.gross)} gross`} />
        <Stat label="Paying students" value={data.totals.students} />
      </div>

      <h2>Earnings, last 12 months</h2>
      <div className="card pad" style={{ height: 320 }}>
        {data.totals.sales === 0 ? (
          <Empty title="No sales yet">Publish a paid course to start earning.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} />
              <YAxis tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(v, _n, p) => [`₹${Number(v).toLocaleString('en-IN')} (${p.payload.sales} sales)`, 'Earnings']} />
              <Bar dataKey="rupees" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <h2>By course</h2>
      <div className="card">
        <table className="table">
          <thead><tr><th>Course</th><th>Sales</th><th>Gross</th><th>Platform fee</th><th>Your earnings</th></tr></thead>
          <tbody>
            {data.byCourse.map((c) => (
              <tr key={c.courseId}><td>{c.title}</td><td>{c.sales}</td><td>{money(c.gross)}</td><td className="muted">{money(c.fees)}</td><td><strong>{money(c.earnings)}</strong></td></tr>
            ))}
            {data.byCourse.length === 0 && <tr><td colSpan="5" className="muted">No sales yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Recent sales</h2>
      <div className="card">
        <table className="table">
          <thead><tr><th>Date</th><th>Student</th><th>Course</th><th>Amount</th><th>You earn</th></tr></thead>
          <tbody>
            {data.recent.map((r) => (
              <tr key={r.id}><td>{formatDate(r.paidAt)}</td><td>{r.student}</td><td>{r.course}</td><td>{money(r.amount)}</td><td>{money(r.earnings)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
