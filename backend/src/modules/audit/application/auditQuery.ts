import type { Page } from '../../users/application/userAdmin.js';

export interface AuditEventQuery {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  limit: number;
  cursor?: string;
}

/** Audit event as returned by GET /audit-events (newest first). */
export interface AuditEventView {
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

/** Port for reading the append-only audit log. */
export interface AuditQueryService {
  list(query: AuditEventQuery): Promise<Page<AuditEventView>>;
}
