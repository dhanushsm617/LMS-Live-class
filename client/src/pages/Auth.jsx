import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { errMsg, useLoginMutation, useRegisterMutation } from '../services/api.js';
import { ErrorBox } from '../components/ui.jsx';

export default function Auth({ mode }) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const location = useLocation();
  const [search] = useSearchParams();
  const [login, { isLoading: loggingIn }] = useLoginMutation();
  const [register, { isLoading: registering }] = useRegisterMutation();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: search.get('role') === 'instructor' ? 'instructor' : 'student' });
  const [error, setError] = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (isRegister) await register(form).unwrap();
      else await login({ email: form.email, password: form.password }).unwrap();
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      const fields = err?.data?.errors && Object.values(err.data.errors).flat().join(' ');
      setError(fields || errMsg(err));
    }
  };

  return (
    <div className="auth card pad stack">
      <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
      <form className="stack" onSubmit={submit}>
        {isRegister && (
          <label>Full name<input required autoComplete="name" value={form.name} onChange={(e) => set({ name: e.target.value })} /></label>
        )}
        <label>Email<input required type="email" autoComplete="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></label>
        <label>
          Password
          <input required type="password" minLength={isRegister ? 8 : 1} autoComplete={isRegister ? 'new-password' : 'current-password'} value={form.password} onChange={(e) => set({ password: e.target.value })} />
        </label>
        {isRegister && (
          <fieldset className="role-pick">
            <legend>I want to…</legend>
            <label className="check"><input type="radio" name="role" checked={form.role === 'student'} onChange={() => set({ role: 'student' })} /> Learn</label>
            <label className="check"><input type="radio" name="role" checked={form.role === 'instructor'} onChange={() => set({ role: 'instructor' })} /> Teach</label>
          </fieldset>
        )}
        <ErrorBox>{error}</ErrorBox>
        <button className="btn btn-primary block" disabled={loggingIn || registering}>
          {loggingIn || registering ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p className="muted small">
        {isRegister ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/register">Create an account</Link></>}
      </p>
      {!isRegister && (
        <details className="small muted">
          <summary>Demo accounts (password: Password123!)</summary>
          <ul className="plain">
            <li>student@lms.test – student</li>
            <li>priya@lms.test – instructor (revenue data)</li>
            <li>admin@lms.test – admin</li>
          </ul>
        </details>
      )}
    </div>
  );
}
