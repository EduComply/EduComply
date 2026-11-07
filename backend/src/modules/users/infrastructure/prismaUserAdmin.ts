import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { AuditAction } from '../../audit/domain/auditActions.js';
import { recordAuditEvent } from '../../audit/infrastructure/auditRepository.js';
import type { AuthUser } from '../../auth/application/ports.js';
import {
  UserAdminError,
  type ChangeRoleInput,
  type Page,
  type UserAdminService,
  type UserListQuery,
} from '../application/userAdmin.js';
import { toAuthUser } from './prismaUserDirectory.js';

export class PrismaUserAdmin implements UserAdminService {
  constructor(private readonly prisma: () => PrismaClient) {}

  async list(query: UserListQuery): Promise<Page<AuthUser>> {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: { name: query.role } } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { fullName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
    };
    // UUID v7 ids are time-ordered, so id order is a stable cursor.
    const rows = await this.prisma().user.findMany({
      where,
      include: { role: true },
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit).map(toAuthUser);
    return {
      data,
      page: { nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null, limit: query.limit },
    };
  }

  async get(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma().user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    return user ? toAuthUser(user) : null;
  }

  changeRole(input: ChangeRoleInput): Promise<AuthUser> {
    if (input.actor.id === input.userId) return Promise.reject(new UserAdminError('SELF_CHANGE'));

    return this.prisma().$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        include: { role: true },
      });
      if (!user) throw new UserAdminError('NOT_FOUND');
      const from = user.role.name;
      if (from === input.role) return toAuthUser(user);

      if (from === 'ADMIN') {
        // Lock every active ADMIN row (in a fixed order, so concurrent changes cannot
        // deadlock) before counting. Two simultaneous demotions are then serialised: the
        // second re-checks the rows after the first commits and sees one admin fewer.
        // A plain COUNT under READ COMMITTED let both succeed and left no administrator.
        const admins = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT u.id FROM "user" u
          JOIN "role" r ON r.id = u.role_id
          WHERE r.name = 'ADMIN' AND u.is_active
          ORDER BY u.id
          FOR UPDATE OF u`;
        if (admins.length <= 1) throw new UserAdminError('LAST_ADMIN');
      }

      const updated = await tx.user.update({
        where: { id: user.id },
        data: { role: { connect: { name: input.role } } },
        include: { role: true },
      });
      await recordAuditEvent(tx, {
        action: AuditAction.UserRoleChanged,
        actorId: input.actor.id,
        targetType: 'user',
        targetId: user.id,
        reason: input.reason,
        metadata: { from, to: input.role, source: 'api' },
        requestId: input.ctx.requestId,
        ip: input.ctx.ip,
      });
      return toAuthUser(updated);
    });
  }
}
