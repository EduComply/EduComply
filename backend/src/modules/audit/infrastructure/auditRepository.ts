import { createHash } from 'node:crypto';
import type { AuditEvent, Prisma } from '../../../generated/prisma/client.js';
import type { DbClient } from '../../../shared/infrastructure/database/prisma.js';
import type { AuditActionName } from '../domain/auditActions.js';

export interface RecordAuditEventInput {
  action: AuditActionName;
  /** Acting user; null for system or trusted-operator actions. */
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  reason?: string;
  /** Small, non-sensitive context. Never include tokens, passwords or raw IP addresses. */
  metadata?: Prisma.InputJsonObject;
  requestId?: string;
  /** Raw client IP; stored only as a SHA-256 hash. */
  ip?: string;
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

/**
 * Appends an audit event. Pass the transaction client so the event is written
 * in the same transaction as the change it records (API Design §9).
 */
export function recordAuditEvent(db: DbClient, input: RecordAuditEventInput): Promise<AuditEvent> {
  return db.auditEvent.create({
    data: {
      action: input.action,
      actorId: input.actorId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      reason: input.reason ?? null,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      requestId: input.requestId ?? null,
      ipHash: input.ip ? hashIp(input.ip) : null,
    },
  });
}
