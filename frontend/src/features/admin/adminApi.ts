import type { Role } from '@/auth/session';
import { apiRequest, queryString } from '@/lib/api';

/** User as returned by GET /users and GET /users/{id} (backend userView). */
export interface AdminUser {
  id: string;
  displayName: string;
  email: string;
  roles: Role[];
  userType: string;
  department: string | null;
  institutionalId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Cursor page envelope (Initial API Design §3). */
export interface Page<T> {
  data: T[];
  page: { nextCursor: string | null; limit: number };
}

/** GET /audit-events item. */
export interface AuditEvent {
  id: string;
  at: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  metadata: unknown;
  requestId: string | null;
  ipHash: string | null;
}

export const ROLES: Role[] = ['LEARNER', 'ADMIN', 'REVIEWER'];

export function listUsers(
  params: { q?: string; role?: Role; limit?: number; cursor?: string },
  signal?: AbortSignal,
): Promise<Page<AdminUser>> {
  return apiRequest('GET', `/users${queryString(params)}`, signal ? { signal } : {});
}

export function getUser(id: string, signal?: AbortSignal): Promise<AdminUser> {
  return apiRequest('GET', `/users/${encodeURIComponent(id)}`, signal ? { signal } : {});
}

/** PATCH /users/{id}/roles — ADMIN only, CSRF-protected, audited server-side. */
export function changeUserRole(
  id: string,
  role: Role,
  reason: string,
  csrfToken: string,
): Promise<AdminUser> {
  return apiRequest('PATCH', `/users/${encodeURIComponent(id)}/roles`, {
    body: { roles: [role], reason },
    csrfToken,
  });
}

export function listAuditEvents(
  params: { limit?: number; cursor?: string; targetId?: string; actorId?: string; action?: string },
  signal?: AbortSignal,
): Promise<Page<AuditEvent>> {
  return apiRequest('GET', `/audit-events${queryString(params)}`, signal ? { signal } : {});
}

/** Human-readable audit action names. */
export const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.login_denied': 'Sign-in denied',
  'user.created': 'Account created',
  'identity.linked': 'Institutional identity linked',
  'user.role_changed': 'Role changed',
};

export function describeEvent(event: AuditEvent): string {
  const label = ACTION_LABELS[event.action] ?? event.action;
  const meta = event.metadata as { from?: string; to?: string } | null;
  if (event.action === 'user.role_changed' && meta?.from && meta.to) {
    return `${label}: ${meta.from} → ${meta.to}`;
  }
  return label;
}
