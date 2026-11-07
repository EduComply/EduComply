import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.js';
import { AuditAction } from '../../src/modules/audit/domain/auditActions.js';
import {
  hashIp,
  recordAuditEvent,
} from '../../src/modules/audit/infrastructure/auditRepository.js';
import { ROLE_NAMES } from '../../src/modules/users/domain/roles.js';
import {
  findRoleByName,
  listRoles,
  seedRoles,
} from '../../src/modules/users/infrastructure/roleRepository.js';
import {
  createUser,
  findUserByIdentity,
  linkIdentity,
} from '../../src/modules/users/infrastructure/userRepository.js';
import {
  isAppendOnlyViolation,
  toHttpError,
} from '../../src/shared/infrastructure/database/errors.js';
import {
  checkDatabase,
  disconnectPrisma,
  getPrisma,
} from '../../src/shared/infrastructure/database/prisma.js';
import { inRollback, testIds } from './helpers.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set; database tests cannot run.');
}

beforeAll(async () => {
  // Roles are reference data required by every other test; seeding is idempotent.
  await seedRoles(getPrisma());
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('connectivity', () => {
  it('reaches PostgreSQL through the pooled connection', async () => {
    const result = await checkDatabase();
    expect(result.status).toBe('up');
  });

  it('initialises Prisma Client and runs a raw query', async () => {
    const rows = await getPrisma().$queryRaw<{ ok: number }[]>`SELECT 1::int AS ok`;
    expect(rows[0]?.ok).toBe(1);
  });
});

describe('roles', () => {
  it('has exactly the LEARNER, ADMIN and REVIEWER roles', async () => {
    const names = (await listRoles(getPrisma())).map((r) => r.name).sort();
    expect(names).toEqual([...ROLE_NAMES].sort());
  });

  it('retrieves a role by name', async () => {
    const admin = await findRoleByName(getPrisma(), 'ADMIN');
    expect(admin?.name).toBe('ADMIN');
  });

  it('seeding is repeatable and never duplicates roles', async () => {
    await inRollback(async (tx) => {
      const first = await seedRoles(tx);
      const second = await seedRoles(tx);
      expect(first.created).toEqual([]);
      expect(second.created).toEqual([]);
      expect(second.updated).toEqual([]);
      expect(second.unchanged.sort()).toEqual([...ROLE_NAMES].sort());
      expect(await tx.role.count({ where: { name: { in: [...ROLE_NAMES] } } })).toBe(3);
    });
  });
});

describe('users and identities', () => {
  it('creates a user with the default LEARNER role', async () => {
    const ids = testIds();
    await inRollback(async (tx) => {
      const user = await createUser(tx, {
        email: ids.email.toUpperCase(),
        fullName: '  Test Learner ',
        userType: 'STUDENT',
        institutionalId: ids.institutionalId,
      });
      expect(user.role.name).toBe('LEARNER');
      expect(user.email).toBe(ids.email);
      expect(user.fullName).toBe('Test Learner');
      expect(user.isActive).toBe(true);
      expect(user.createdAt).toBeInstanceOf(Date);
    });
  });

  it('links an OIDC identity and finds the user by (issuer, subject)', async () => {
    const ids = testIds();
    await inRollback(async (tx) => {
      const user = await createUser(tx, {
        email: ids.email,
        fullName: 'Linked',
        userType: 'STAFF',
      });
      const identity = await linkIdentity(tx, {
        userId: user.id,
        protocol: 'OIDC',
        issuer: ids.issuer,
        subject: ids.subject,
      });
      expect(identity.userId).toBe(user.id);
      const found = await findUserByIdentity(tx, ids.issuer, ids.subject);
      expect(found?.id).toBe(user.id);
      expect(await findUserByIdentity(tx, ids.issuer, 'someone-else')).toBeNull();
    });
  });

  it('rejects a second link of the same external identity (unique issuer + subject)', async () => {
    const ids = testIds();
    await inRollback(async (tx) => {
      const a = await createUser(tx, { email: ids.email, fullName: 'A', userType: 'STAFF' });
      const b = await createUser(tx, {
        email: `b.${ids.email}`,
        fullName: 'B',
        userType: 'STAFF',
      });
      const link = { protocol: 'OIDC' as const, issuer: ids.issuer, subject: ids.subject };
      await linkIdentity(tx, { userId: a.id, ...link });

      const error = await linkIdentity(tx, { userId: b.id, ...link }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
      expect(toHttpError(error)?.status).toBe(409);
    });
  });

  it('rejects duplicate emails', async () => {
    const ids = testIds();
    await inRollback(async (tx) => {
      await createUser(tx, { email: ids.email, fullName: 'One', userType: 'STUDENT' });
      const error = await createUser(tx, {
        email: ids.email,
        fullName: 'Two',
        userType: 'STUDENT',
      }).catch((e: unknown) => e);
      expect(toHttpError(error)?.status).toBe(409);
    });
  });
});

describe('audit events', () => {
  it('records an event with actor, target, reason and hashed IP', async () => {
    const ids = testIds();
    await inRollback(async (tx) => {
      const user = await createUser(tx, { email: ids.email, fullName: 'Actor', userType: 'STAFF' });
      const event = await recordAuditEvent(tx, {
        action: AuditAction.UserCreated,
        actorId: user.id,
        targetType: 'user',
        targetId: user.id,
        reason: 'integration test',
        metadata: { source: 'test' },
        requestId: 'req-test',
        ip: '203.0.113.7',
      });
      expect(typeof event.id).toBe('bigint');
      expect(event.ipHash).toBe(hashIp('203.0.113.7'));
      expect(event.ipHash).not.toContain('203.0.113.7');
      expect(event.metadata).toEqual({ source: 'test' });
      expect(event.occurredAt).toBeInstanceOf(Date);
    });
  });

  it('is append-only: updates are blocked by the database', async () => {
    await inRollback(async (tx) => {
      const event = await recordAuditEvent(tx, { action: AuditAction.AuthLogin });
      const error = await tx.auditEvent
        .update({ where: { id: event.id }, data: { reason: 'tampered' } })
        .catch((e: unknown) => e);
      expect(isAppendOnlyViolation(error)).toBe(true);
    });
  });

  it('is append-only: deletes are blocked by the database', async () => {
    await inRollback(async (tx) => {
      const event = await recordAuditEvent(tx, { action: AuditAction.AuthLogin });
      const error = await tx.auditEvent
        .delete({ where: { id: event.id } })
        .catch((e: unknown) => e);
      expect(isAppendOnlyViolation(error)).toBe(true);
    });
  });

  it('rejects an event that references a non-existent actor (foreign key)', async () => {
    await inRollback(async (tx) => {
      const error = await recordAuditEvent(tx, {
        action: AuditAction.AuthLogin,
        actorId: '00000000-0000-7000-8000-000000000000',
      }).catch((e: unknown) => e);
      expect(toHttpError(error)?.status).toBe(409);
    });
  });
});
