import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import type { Page } from '../../users/application/userAdmin.js';
import type {
  AuditEventQuery,
  AuditEventView,
  AuditQueryService,
} from '../application/auditQuery.js';

export class PrismaAuditQuery implements AuditQueryService {
  constructor(private readonly prisma: () => PrismaClient) {}

  async list(query: AuditEventQuery): Promise<Page<AuditEventView>> {
    const where: Prisma.AuditEventWhereInput = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lt: query.to } : {}),
            },
          }
        : {}),
      ...(query.cursor ? { id: { lt: BigInt(query.cursor) } } : {}),
    };
    const rows = await this.prisma().auditEvent.findMany({
      where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit).map((e): AuditEventView => ({
      id: e.id.toString(),
      at: e.occurredAt.toISOString(),
      actorId: e.actorId,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      reason: e.reason,
      metadata: e.metadata,
      requestId: e.requestId,
      ipHash: e.ipHash,
    }));
    return {
      data,
      page: { nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null, limit: query.limit },
    };
  }
}
