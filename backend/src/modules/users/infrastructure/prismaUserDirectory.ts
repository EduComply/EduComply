import type { PrismaClient, Role, User, UserType } from '../../../generated/prisma/client.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { AuditAction } from '../../audit/domain/auditActions.js';
import { recordAuditEvent } from '../../audit/infrastructure/auditRepository.js';
import type {
  AuthUser,
  RequestContext,
  SyncResult,
  UserDirectory,
  VerifiedIdentity,
} from '../../auth/application/ports.js';
import { DEFAULT_ROLE, type RoleName } from '../domain/roles.js';
import { normaliseEmail } from './userRepository.js';

export function toAuthUser(user: User & { role: Role }): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role.name as RoleName,
    userType: user.userType,
    department: user.department,
    institutionalId: user.institutionalId,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

const USER_TYPES: readonly UserType[] = ['STUDENT', 'STAFF'];
const toUserType = (claim?: string): UserType => {
  const upper = claim?.toUpperCase();
  return USER_TYPES.includes(upper as UserType) ? (upper as UserType) : 'STUDENT';
};

function displayName(identity: VerifiedIdentity, email: string): string {
  return (identity.name ?? email.split('@')[0] ?? email).slice(0, 150);
}

/**
 * PostgreSQL user synchronisation for institutional sign-in. Every change and its audit
 * events are written in one transaction. Roles are never taken from the identity provider:
 * new users get LEARNER; existing roles are preserved; elevation happens only through the
 * audited admin endpoint or the development grant-role tool.
 */
export class PrismaUserDirectory implements UserDirectory {
  constructor(private readonly prisma: () => PrismaClient) {}

  async syncFromIdentity(identity: VerifiedIdentity, ctx: RequestContext): Promise<SyncResult> {
    try {
      return await this.syncOnce(identity, ctx);
    } catch (err) {
      // Two first-time logins racing on the same user/identity: retry once.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.syncOnce(identity, ctx);
      }
      throw err;
    }
  }

  private syncOnce(identity: VerifiedIdentity, ctx: RequestContext): Promise<SyncResult> {
    const email = normaliseEmail(identity.email ?? '');
    const audit = { requestId: ctx.requestId, ip: ctx.ip };
    const now = new Date();

    return this.prisma().$transaction(async (tx) => {
      const deny = async (userId: string, reason: 'ACCOUNT_DISABLED' | 'IDENTITY_CONFLICT') => {
        await recordAuditEvent(tx, {
          action: AuditAction.AuthLoginDenied,
          actorId: userId,
          targetType: 'user',
          targetId: userId,
          metadata: { reason, issuer: identity.issuer },
          ...audit,
        });
        return { ok: false as const, reason };
      };

      const linked = await tx.userIdentity.findUnique({
        where: { issuer_subject: { issuer: identity.issuer, subject: identity.subject } },
        include: { user: { include: { role: true } } },
      });

      let userId: string;
      let created = false;

      if (linked) {
        if (!linked.user.isActive) return deny(linked.userId, 'ACCOUNT_DISABLED');
        userId = linked.userId;
        await tx.userIdentity.update({ where: { id: linked.id }, data: { lastUsedAt: now } });
      } else {
        const existing = await tx.user.findUnique({
          where: { email },
          include: { identities: { select: { issuer: true } } },
        });
        if (existing) {
          // Same issuer but a different subject for this email: never merge silently.
          if (existing.identities.some((i) => i.issuer === identity.issuer)) {
            return deny(existing.id, 'IDENTITY_CONFLICT');
          }
          if (!existing.isActive) return deny(existing.id, 'ACCOUNT_DISABLED');
          userId = existing.id;
        } else {
          const user = await tx.user.create({
            data: {
              email,
              fullName: displayName(identity, email),
              userType: toUserType(identity.userType),
              role: { connect: { name: DEFAULT_ROLE } },
            },
          });
          userId = user.id;
          created = true;
          await recordAuditEvent(tx, {
            action: AuditAction.UserCreated,
            actorId: userId,
            targetType: 'user',
            targetId: userId,
            metadata: { source: 'oidc', role: DEFAULT_ROLE },
            ...audit,
          });
        }
        await tx.userIdentity.create({
          data: {
            userId,
            protocol: 'OIDC',
            issuer: identity.issuer,
            subject: identity.subject,
            lastUsedAt: now,
          },
        });
        await recordAuditEvent(tx, {
          action: AuditAction.IdentityLinked,
          actorId: userId,
          targetType: 'user',
          targetId: userId,
          metadata: { protocol: 'OIDC', issuer: identity.issuer },
          ...audit,
        });
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: { lastLoginAt: now },
        include: { role: true },
      });
      await recordAuditEvent(tx, {
        action: AuditAction.AuthLogin,
        actorId: userId,
        targetType: 'user',
        targetId: userId,
        metadata: { protocol: 'OIDC', issuer: identity.issuer, newUser: created },
        ...audit,
      });
      return { ok: true as const, user: toAuthUser(user), created };
    });
  }

  async findById(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma().user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    return user ? toAuthUser(user) : null;
  }

  async recordLogout(userId: string, ctx: RequestContext): Promise<void> {
    await recordAuditEvent(this.prisma(), {
      action: AuditAction.AuthLogout,
      actorId: userId,
      targetType: 'user',
      targetId: userId,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  }
}
