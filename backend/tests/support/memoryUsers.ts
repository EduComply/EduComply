import { randomUUID } from 'node:crypto';
import type {
  AuditEventQuery,
  AuditEventView,
  AuditQueryService,
} from '../../src/modules/audit/application/auditQuery.js';
import type {
  AuthUser,
  RequestContext,
  SyncResult,
  UserDirectory,
  VerifiedIdentity,
} from '../../src/modules/auth/application/ports.js';
import {
  UserAdminError,
  type ChangeRoleInput,
  type Page,
  type UserAdminService,
  type UserListQuery,
} from '../../src/modules/users/application/userAdmin.js';
import type { RoleName } from '../../src/modules/users/domain/roles.js';

/**
 * MOCK user store with the same rules as PrismaUserDirectory / PrismaUserAdmin
 * (default LEARNER, roles preserved, identities keyed by issuer + subject, audit trail).
 * The real PostgreSQL implementation is covered by tests/db.
 */
export class MemoryUsers implements UserDirectory, UserAdminService {
  users = new Map<string, AuthUser>();
  identities = new Map<string, string>(); // `${issuer}|${subject}` → userId
  audit: AuditEventView[] = [];
  failing = false;

  private record(action: string, userId: string | null, ctx: RequestContext, extra = {}) {
    this.audit.push({
      id: String(this.audit.length + 1),
      at: new Date().toISOString(),
      actorId: userId,
      action,
      targetType: 'user',
      targetId: userId,
      reason: null,
      metadata: extra,
      requestId: ctx.requestId ?? null,
      ipHash: ctx.ip ? 'hashed' : null,
    });
  }

  addUser(email: string, role: RoleName = 'LEARNER', isActive = true, fullName?: string): AuthUser {
    const now = new Date();
    const user: AuthUser = {
      id: randomUUID(),
      email,
      fullName: fullName ?? email.split('@')[0]!,
      role,
      userType: 'STUDENT',
      department: null,
      institutionalId: null,
      isActive,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  async syncFromIdentity(identity: VerifiedIdentity, ctx: RequestContext): Promise<SyncResult> {
    if (this.failing) throw Object.assign(new Error('db down'), { code: 'P1001' });
    const key = `${identity.issuer}|${identity.subject}`;
    let user = this.users.get(this.identities.get(key) ?? '');
    let created = false;
    if (!user) {
      user = [...this.users.values()].find((u) => u.email === identity.email);
      if (!user) {
        user = this.addUser(identity.email!, 'LEARNER', true, identity.name);
        created = true;
        this.record('user.created', user.id, ctx);
      }
      this.identities.set(key, user.id);
      this.record('identity.linked', user.id, ctx);
    }
    if (!user.isActive) {
      this.record('auth.login_denied', user.id, ctx);
      return { ok: false, reason: 'ACCOUNT_DISABLED' };
    }
    user.lastLoginAt = new Date();
    this.record('auth.login', user.id, ctx);
    return { ok: true, user, created };
  }

  async findById(userId: string) {
    if (this.failing) throw Object.assign(new Error('db down'), { code: 'P1001' });
    return this.users.get(userId) ?? null;
  }

  async recordLogout(userId: string, ctx: RequestContext) {
    this.record('auth.logout', userId, ctx);
  }

  async list(query: UserListQuery): Promise<Page<AuthUser>> {
    const data = [...this.users.values()]
      .filter((u) => !query.role || u.role === query.role)
      .slice(0, query.limit);
    return { data, page: { nextCursor: null, limit: query.limit } };
  }

  async get(userId: string) {
    return this.users.get(userId) ?? null;
  }

  async changeRole(input: ChangeRoleInput): Promise<AuthUser> {
    if (input.actor.id === input.userId) throw new UserAdminError('SELF_CHANGE');
    const user = this.users.get(input.userId);
    if (!user) throw new UserAdminError('NOT_FOUND');
    const from = user.role;
    user.role = input.role;
    this.record('user.role_changed', input.actor.id, input.ctx, { from, to: input.role });
    return user;
  }

  async listAudit(query: AuditEventQuery): Promise<Page<AuditEventView>> {
    const data = [...this.audit].reverse().slice(0, query.limit);
    return { data, page: { nextCursor: null, limit: query.limit } };
  }
}

/** Adapter so MemoryUsers can serve GET /audit-events (method name differs from list). */
export const auditQueryOf = (users: MemoryUsers): AuditQueryService => ({
  list: (q) => users.listAudit(q),
});
