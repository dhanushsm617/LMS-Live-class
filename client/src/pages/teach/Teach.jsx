import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errMsg, useCreateCourseMutation, useTeachingCoursesQuery } from '../../services/api.js';
import { Empty, ErrorBox, Spinner, StatusBadge } from '../../components/ui.jsx';
import { formatMoney } from '../../utils/format.js';

export default function Teach() {
  const { data, isLoading, error } = useTeachingCoursesQuery();
  const [createCourse, { isLoading: creating }] = useCreateCourseMutation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState(null);
  const [form, setForm] = useState({ title: '', subtitle: '', description: '', category: 'Web Development', level: 'beginner', price: 0 });

  const create = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      const { course } = await createCourse({ ...form, price: Math.round(Number(form.price) * 100) }).unwrap();
      navigate(`/teach/courses/${course.id}`);
    } catch (err) {
      const fields = err?.data?.errors && Object.values(err.data.errors).flat().join(' · ');
      setFormError(fields || errMsg(err));
    }
  };

  return (
    <>
      <div className="row between wrap">
        <h1>Teaching</h1>
        <div className="row">
          <Link className="btn" to="/teach/revenue">Revenue dashboard</Link>
          <button className="btn btn-primary" onClick={() => setOpen((o) => !o)}>{open ? 'Close' : '+ New course'}</button>
        </div>
      </div>

      {open && (
        <form className="card pad stack" onSubmit={create}>
          <label>Title<input required minLength={5} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>Subtitle<input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></label>
          <label>Description<textarea required minLength={20} rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="grid-3">
            <label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
            <label>
              Level
              <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label>Price (₹, 0 = free)<input type="number" min="0" step="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
          </div>
          <ErrorBox>{formError}</ErrorBox>
          <div className="row"><button className="btn btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Create draft'}</button></div>
        </form>
      )}

      {isLoading && <Spinner />}
      <ErrorBox error={error} />
      {data?.items.length === 0 && <Empty title="No courses yet">Create your first course draft, add lessons and upload videos.</Empty>}
      <div className="card">
        <table className="table">
          <thead><tr><th>Course</th><th>Status</th><th>Lessons</th><th>Learners</th><th>Price</th><th /></tr></thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.title}</strong>
                  {c.reviewNote && <div className="small danger">Admin feedback: {c.reviewNote}</div>}
                </td>
                <td><StatusBadge status={c.status} /></td>
                <td>{c.lessonCount}</td>
                <td>{c.enrollmentCount}</td>
                <td>{c.price === 0 ? 'Free' : formatMoney(c.price, c.currency)}</td>
                <td><Link className="btn" to={`/teach/courses/${c.id}`}>Manage</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
