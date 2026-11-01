import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectAuthReady, selectUser } from '../features/auth/authSlice.js';
import { Spinner } from './ui.jsx';

/** Guards a group of routes. `roles` is optional; an empty list means "any signed-in user". */
export default function ProtectedRoute({ roles = [] }) {
  const user = useSelector(selectUser);
  const ready = useSelector(selectAuthReady);
  const location = useLocation();

  if (!ready) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles.length && !roles.includes(user.role)) {
    return (
      <div className="empty">
        <h3>You don’t have access to this page</h3>
        <p className="muted">This area is for {roles.join(' / ')} accounts.</p>
      </div>
    );
  }
  return <Outlet />;
}
