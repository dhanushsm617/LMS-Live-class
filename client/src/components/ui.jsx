import { errMsg } from '../services/api.js';

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="center muted" role="status" aria-live="polite">
    <span className="spinner" aria-hidden="true" /> {label}
  </div>
);

export const ErrorBox = ({ error, children }) =>
  error || children ? (
    <div className="alert alert-error" role="alert">
      {children || errMsg(error)}
    </div>
  ) : null;

export const Empty = ({ title, children }) => (
  <div className="empty">
    <h3>{title}</h3>
    {children && <p className="muted">{children}</p>}
  </div>
);

export const ProgressBar = ({ value = 0, label }) => (
  <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progress'}>
    <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
  </div>
);

export const Badge = ({ tone = 'gray', children }) => <span className={`badge badge-${tone}`}>{children}</span>;

const STATUS_TONE = { published: 'green', pending: 'amber', draft: 'gray', rejected: 'red', archived: 'gray', ready: 'green', processing: 'blue', queued: 'blue', failed: 'red', none: 'gray', live: 'red', scheduled: 'blue', ended: 'gray' };
export const StatusBadge = ({ status }) => <Badge tone={STATUS_TONE[status] || 'gray'}>{status}</Badge>;
