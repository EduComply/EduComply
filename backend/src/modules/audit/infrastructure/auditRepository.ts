import { createHash, createHmac } from 'node:crypto';
import { env } from '../../../config/env.js';
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
  /** Raw client IP; stored only as a keyed hash (see hashIp). */
  ip?: string;
}

/**
 * Pseudonymises a client IP for the audit log: HMAC-SHA-256 with AUDIT_IP_HASH_KEY, so the
 * value cannot be reversed by hashing every possible address. Equal IPs still give equal
 * values (useful for investigations). Without a key (development only; production requires
 * one) a plain SHA-256 is used. Either way the result is 64 hex characters (char(64)).
 */
export function hashIp(ip: string, key: string | undefined = env.AUDIT_IP_HASH_KEY): string {
  return key
    ? createHmac('sha256', key).update(ip).digest('hex')
    : createHash('sha256').update(ip).digest('hex');
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
