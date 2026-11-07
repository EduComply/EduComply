/**
 * LIVE PostgreSQL tests for OIDC user synchronisation, admin role changes and the audit
 * query. Every test runs in a rolled-back transaction: nothing persists.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaAuditQuery } from '../../src/modules/audit/infrastructure/prismaAuditQuery.js';
import type { VerifiedIdentity } from '../../src/modules/auth/application/ports.js';
import { UserAdminError } from '../../src/modules/users/application/userAdmin.js';
import { PrismaUserAdmin } from '../../src/modules/users/infrastructure/prismaUserAdmin.js';
import { PrismaUserDirectory } from '../../src/modules/users/infrastructure/prismaUserDirectory.js';
import { createUser } from '../../src/modules/users/infrastructure/userRepository.js';
import { disconnectPrisma } from '../../src/shared/infrastructure/database/prisma.js';
import { asClient, inRollback, testIds } from './helpers.js';

afterAll(async () => {
  await disconnectPrisma();
});

const identityFor = (ids: ReturnType<typeof testIds>): VerifiedIdentity => ({
  issuer: ids.issuer,
  subject: ids.subject,
  email: ids.email,
  emailVerified: true,
  name: 'Synced Person',
});
const ctx = { requestId: 'req-sync-test', ip: '198.51.100.9' };

describe('PrismaUserDirectory.syncFromIdentity', () => {
  it('first login creates a LEARNER, links the identity, stamps lastLoginAt and audits', async () => {
    const ids = testIds();
    await inRollback(async (tx) => {
      const directory = new PrismaUserDirectory(() => asClient(tx));
      const result = await directory.syncFromIdentity(identityFor(ids), ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.created).toBe(true);
      expect(result.user).toMatchObject({
        email: ids.email,
        role: 'LEARNER',
        fullName: 'Synced Person',
      });
      expect(result.user.lastLoginAt).toBeInstanceOf(Date);

      const identity = await tx.userIdentity.findUnique({
        where: { issuer_subject: { issuer: ids.issuer, subject: ids.subject } },
      });
      expect(identity).toMatchObject({ userId: result.user.id, protocol: 'OIDC' });

      const events = await tx.auditEvent.findMany({
        where: { targetId: result.user.id },
        orderBy: { id: 'asc' },
      });
      expect(events.map((e) => e.action)).toEqual([
        'user.created',
        'identity.linked',
        'auth.login',
      ]);
      expect(events.every((e) => e.requestId === 'req-sync-test' && e.ipHash?.length === 64)).toBe(
        true,
      );
    });
  });

  it('a returning user is matched by (issuer, subject) and keeps an elevated role', async () => {
    const ids = testIds();
    await inRollback(async (tx) => {
      const directory = new PrismaUserDirectory(() => asClient(tx));
      const first = await directory.syncFromIdentity(identityFor(ids), ctx);
      if (!first.ok) throw new Error('expected ok');
      await tx.user.update({
        where: { id: first.user.id },
        data: { role: { connect: { name: 'ADMIN' } } },
      });

      const again = await directory.syncFromIdentity(
        { ...identityFor(ids), email: `changed.${ids.email}` },
        ctx,
      );
      expect(again).toMatchObject({
        ok: true,
        created: false,
        user: { id: first.user.id, role: 'ADMIN' },
      });
      expect(await tx.user.count({ where: { email: { contains: ids.email } } })).toBe(1);
    });
  });

  it('links a new identity to a pre-provisioned user with the same email', async () => {
    const ids = testIds();
    await inRollback(async (tx) => {
      const existing = await createUser(tx, {
        email: ids.email,
        fullName: 'Pre Provisioned',
        userType: 'STAFF',
        roleName: 'REVIEWER',
      });
      const directory = new PrismaUserDirectory(() => asClient(tx));
      const result = await directory.syncFromIdentity(identityFor(ids), ctx);
      expect(result).toMatchObject({
        ok: true,
        created: false,
        user: { id: existing.id, role: 'REVIEWER' },
      });
    });
  });

  it('refuses a second subject from the same issuer for an already-linked email', async () => {
    const ids = testIds();
    await inRollback(async (tx) => {
      const directory = new PrismaUserDirectory(() => asClient(tx));
      await directory.syncFromIdentity(identityFor(ids), ctx);
      const other = await directory.syncFromIdentity(
        { ...identityFor(ids), subject: `${ids.subject}-other` },
        ctx,
      );
      expect(other).toEqual({ ok: false, reason: 'IDENTITY_CONFLICT' });
    });
  });

  it('denies inactive users and records auth.login_denied', async () => {
    const ids = testIds();
    await inRollback(async (tx) => {
      const directory = new PrismaUserDirectory(() => asClient(tx));
      const first = await directory.syncFromIdentity(identityFor(ids), ctx);
      if (!first.ok) throw new Error('expected ok');
      await tx.user.update({ where: { id: first.user.id }, data: { isActive: false } });

      expect(await directory.syncFromIdentity(identityFor(ids), ctx)).toEqual({
        ok: false,
        reason: 'ACCOUNT_DISABLED',
      });
      const denied = await tx.auditEvent.count({
        where: { targetId: first.user.id, action: 'auth.login_denied' },
      });
      expect(denied).toBe(1);
    });
  });
});

describe('PrismaUserAdmin', () => {
  it('changes a role with an audit event and protects the last admin', async () => {
    const a = testIds();
    const b = testIds();
    await inRollback(async (tx) => {
      const admin = new PrismaUserAdmin(() => asClient(tx));
      const actor = await createUser(tx, {
        email: a.email,
        fullName: 'Admin',
        userType: 'STAFF',
        roleName: 'ADMIN',
      });
      const target = await createUser(tx, {
        email: b.email,
        fullName: 'Target',
        userType: 'STAFF',
      });
      const actorView = { ...actor, role: 'ADMIN' as const };

      const updated = await admin.changeRole({
        actor: actorView,
        userId: target.id,
        role: 'REVIEWER',
        reason: 'integration test',
        ctx,
      });
      expect(updated.role).toBe('REVIEWER');
      const event = await tx.auditEvent.findFirst({
        where: { targetId: target.id, action: 'user.role_changed' },
      });
      expect(event).toMatchObject({ actorId: actor.id, reason: 'integration test' });
      expect(event?.metadata).toMatchObject({ from: 'LEARNER', to: 'REVIEWER' });

      await expect(
        admin.changeRole({
          actor: actorView,
          userId: actor.id,
          role: 'LEARNER',
          reason: 'self',
          ctx,
        }),
      ).rejects.toMatchObject({ reason: 'SELF_CHANGE' });
      await expect(
        admin.changeRole({
          actor: { ...updated, role: 'ADMIN' },
          userId: '00000000-0000-7000-8000-000000000000',
          role: 'ADMIN',
          reason: 'missing',
          ctx,
        }),
      ).rejects.toBeInstanceOf(UserAdminError);
    });
  });

  it('lists users with role filter and cursor pagination', async () => {
    const ids = [testIds(), testIds(), testIds()];
    await inRollback(async (tx) => {
      for (const id of ids) {
        await createUser(tx, {
          email: id.email,
          fullName: 'Paged',
          userType: 'STUDENT',
          roleName: 'REVIEWER',
        });
      }
      const admin = new PrismaUserAdmin(() => asClient(tx));
      const first = await admin.list({ role: 'REVIEWER', q: 'educomply.invalid', limit: 2 });
      expect(first.data).toHaveLength(2);
      expect(first.page.nextCursor).toBe(first.data[1]!.id);
      const second = await admin.list({
        role: 'REVIEWER',
        q: 'educomply.invalid',
        limit: 2,
        cursor: first.page.nextCursor!,
      });
      expect(second.data.map((u) => u.id)).not.toContain(first.data[0]!.id);
    });
  });
});

describe('PrismaAuditQuery', () => {
  it('returns newest events first with filters and a cursor', async () => {
    const ids = testIds();
    await inRollback(async (tx) => {
      const directory = new PrismaUserDirectory(() => asClient(tx));
      const result = await directory.syncFromIdentity(identityFor(ids), ctx);
      if (!result.ok) throw new Error('expected ok');
      const query = new PrismaAuditQuery(() => asClient(tx));
      const page = await query.list({ targetId: result.user.id, limit: 2 });
      expect(page.data.map((e) => e.action)).toEqual(['auth.login', 'identity.linked']);
      expect(page.page.nextCursor).toBe(page.data[1]!.id);
      const next = await query.list({
        targetId: result.user.id,
        limit: 2,
        cursor: page.page.nextCursor!,
      });
      expect(next.data.map((e) => e.action)).toEqual(['user.created']);
    });
  });
});
