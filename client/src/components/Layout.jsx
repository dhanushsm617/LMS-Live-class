import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { api, useLogoutMutation } from '../services/api.js';
import { clearUser, selectUser } from '../features/auth/authSlice.js';

export default function Layout() {
  const user = useSelector(selectUser);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [logout] = useLogoutMutation();

  const signOut = async () => {
    await logout().unwrap().catch(() => {});
    dispatch(clearUser());
    dispatch(api.util.resetApiState());
    navigate('/');
  };

  const link = ({ isActive }) => (isActive ? 'active' : undefined);

  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">L</span> LearnHub
          </Link>
          <nav aria-label="Main">
            <NavLink to="/" end className={link}>Courses</NavLink>
            {user && <NavLink to="/my-learning" className={link}>My learning</NavLink>}
            {user && <NavLink to="/live" className={link}>Live classes</NavLink>}
            {user && <NavLink to="/certificates" className={link}>Certificates</NavLink>}
            {(user?.role === 'instructor' || user?.role === 'admin') && <NavLink to="/teach" className={link}>Teach</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin" className={link}>Admin</NavLink>}
          </nav>
          <div className="nav-user">
            {user ? (
              <>
                <span className="muted small">{user.name} · {user.role}</span>
                <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
              </>
            ) : (
              <>
                <Link className="btn btn-ghost" to="/login">Sign in</Link>
                <Link className="btn btn-primary" to="/register">Join free</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="container page">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container muted small">LearnHub · MERN + WebRTC + FFmpeg + CloudFront + BullMQ + Redux Toolkit</div>
      </footer>
    </>
  );
}
