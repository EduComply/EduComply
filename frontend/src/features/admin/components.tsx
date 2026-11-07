import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { Role } from '@/auth/session';
import { Icon } from '@/components/icons';

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`pill role-${role.toLowerCase()}`}>{role}</span>;
}

export function AccountStatus({ active }: { active: boolean }) {
  return (
    <span className={`pill ${active ? 'pill-passed' : 'pill-locked'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

/** Marks functionality that belongs to a later sprint (nothing is simulated). */
export function FutureFeature({ sprint, children }: { sprint: number; children: ReactNode }) {
  return (
    <div className="future-note" role="note">
      <Icon name="clock" />
      <p>
        <strong>Available in Sprint {sprint}.</strong> {children}
      </p>
    </div>
  );
}

/**
 * Accessible confirmation dialog: focus moves to the dialog, Escape or Cancel closes it,
 * Tab stays inside, and focus returns to the opener on close.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelButton.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !busy) {
      e.stopPropagation();
      onCancel();
    }
    if (e.key === 'Tab' && dialog.current) {
      const focusable = dialog.current.querySelectorAll<HTMLElement>('button:not([disabled])');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <button
            ref={cancelButton}
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
