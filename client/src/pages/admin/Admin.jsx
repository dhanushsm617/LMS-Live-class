import { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  errMsg, useAdminCoursesQuery, useAdminStatsQuery, useAdminUsersQuery, useReviewCourseMutation, useUpdateUserMutation,
} from '../../services/api.js';
import { selectUser } from '../../features/auth/authSlice.js';
import { ErrorBox, Spinner, StatusBadge } from '../../components/ui.jsx';
import { formatMoney } from '../../utils/format.js';

export default function Admin() {
  const me = useSelector(selectUser);
  const { data: stats } = useAdminStatsQuery();
  const [courseFilter, setCourseFilter] = useState('pending');
  const { data: courses, isLoading: loadingCourses } = useAdminCoursesQuery(courseFilter);
  const [q, setQ] = useState('');
  const { data: users } = useAdminUsersQuery({ q: q || undefined });
  const [review] = useReviewCourseMutation();
  const [updateUser] = useUpdateUserMutation();
  const [err, setErr] = useState(null);

  const act = async (fn) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errMsg(e));
    }
  };

  const reject = (id) => {
    const note = window.prompt('What should the instructor fix?');
    if (note) act(() => review({ id, action: 'reject', note }).unwrap());
  };

  return (
    <>
      <h1>Admin</h1>
      {stats && (
        <div className="grid-4">
          <div className="card pad stat"><div className="small muted">Users</div><div className="stat-value">{stats.users}</div></div>
          <div className="card pad stat"><div className="small muted">Published courses</div><div className="stat-value">{stats.publishedCourses}</div></div>
          <div className="card pad stat"><div className="small muted">Awaiting review</div><div className="stat-value">{stats.pendingCourses}</div></div>
          <div className="card pad stat"><div className="small muted">Platform revenue</div><div className="stat-value">{formatMoney(stats.platformRevenue)}</div><div className="small muted">of {formatMoney(stats.gross)} gross</div></div>
        </div>
      )}
      <ErrorBox>{err}</ErrorBox>

      <div className="row between wrap">
        <h2>Courses</h2>
        <select aria-label="Filter courses" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
          <option value="pending">Pending review</option>
          <option value="published">Published</option>
          <option value="rejected">Rejected</option>
          <option value="draft">Drafts</option>
          <option value="">All</option>
        </select>
      </div>
      <div className="card">
        {loadingCourses ? <Spinner /> : (
          <table className="table">
            <thead><tr><th>Course</th><th>Instructor</th><th>Status</th><th>Lessons</th><th /></tr></thead>
            <tbody>
              {courses?.items.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.title}</strong></td>
                  <td>{c.instructor?.name}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td>{c.lessonCount}</td>
                  <td className="row">
                    {['pending', 'rejected', 'draft'].includes(c.status) && <button className="btn btn-primary" onClick={() => act(() => review({ id: c.id, action: 'approve' }).unwrap())}>Approve</button>}
                    {c.status === 'pending' && <button className="btn btn-ghost danger" onClick={() => reject(c.id)}>Reject</button>}
                    {c.status === 'published' && <button className="btn btn-ghost" onClick={() => act(() => review({ id: c.id, action: 'unpublish' }).unwrap())}>Unpublish</button>}
                  </td>
                </tr>
              ))}
              {courses?.items.length === 0 && <tr><td colSpan="5" className="muted">Nothing here.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="row between wrap">
        <h2>Users</h2>
        <input type="search" placeholder="Search name or email" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th></tr></thead>
          <tbody>
            {users?.items.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="muted">{u.email}</td>
                <td>
                  <select aria-label={`Role for ${u.name}`} value={u.role} disabled={u.id === me.id} onChange={(e) => act(() => updateUser({ id: u.id, role: e.target.value }).unwrap())}>
                    <option value="student">student</option><option value="instructor">instructor</option><option value="admin">admin</option>
                  </select>
                </td>
                <td><input type="checkbox" aria-label={`${u.name} active`} checked={u.isActive} disabled={u.id === me.id} onChange={(e) => act(() => updateUser({ id: u.id, isActive: e.target.checked }).unwrap())} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {users && <div className="pad small muted">Showing {users.items.length} of {users.total}</div>}
      </div>
    </>
  );
}
