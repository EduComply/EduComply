import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import toggleKnob from '@/assets/figma/toggle-knob.svg';

/** Reusable presentation components shared by the learner and admin portals. */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h2 className="page-title">{title}</h2>
        {description && <p className="muted page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  className = '',
  as: Tag = 'section',
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: 'section' | 'article' | 'div';
}) {
  return (
    <Tag className={`card ${className}`.trim()}>
      {(title || actions) && (
        <div className="card-header">
          {title && <h3 className="card-title">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </Tag>
  );
}

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function ProgressBar({
  value,
  label,
  showValue = true,
  tone,
}: {
  value: number;
  label: string;
  showValue?: boolean;
  tone?: Tone;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`progress-fill tone-${tone ?? 'info'}`} style={{ width: `${pct}%` }} />
      </div>
      {showValue && <span className="progress-value">{pct}%</span>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'info',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: Tone;
}) {
  return (
    <div className={`stat-tile tone-${tone}`}>
      {icon && (
        <span className="stat-icon">
          <Icon name={icon} />
        </span>
      )}
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        {hint && <p className="stat-hint muted">{hint}</p>}
      </div>
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/** Marks demonstration content so it is never mistaken for real records. */
export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="demo-notice" role="note">
      <Icon name="info" />
      <p>
        <strong>Demonstration data.</strong> {children}
      </p>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
  icon = 'info',
}: {
  title: string;
  message?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      {message && <p className="muted">{message}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  title,
  message,
  action,
}: {
  title: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state error-state" role="alert">
      <span className="empty-icon">
        <Icon name="x" size={28} />
      </span>
      <h3>{title}</h3>
      {message && <p className="muted">{message}</p>}
      {action}
    </div>
  );
}

/** Toggle switch with an accessible name; `role="switch"` exposes on/off to assistive tech. */
export function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <div>
        <label htmlFor={id} className="toggle-label">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="muted toggle-desc">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        className={`toggle ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-thumb" aria-hidden="true">
          <img src={toggleKnob} alt="" width={24} height={24} />
        </span>
      </button>
    </div>
  );
}
