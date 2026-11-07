import { afterAll, describe, expect, it } from 'vitest';
import { grantRole, GrantRoleError } from '../../src/modules/users/infrastructure/grantRole.js';
import { createUser, linkIdentity } from '../../src/modules/users/infrastructure/userRepository.js';
import { disconnectPrisma, getPrisma } from '../../src/shared/infrastructure/database/prisma.js';
import { asClient, inRollback, testIds } from './helpers.js';

afterAll(async () => {
  await disconnectPrisma();
});

describe('grantRole (development admin procedure)', () => {
  it('refuses users who have never signed in (no verified identity)', async () => {
    const ids = testIds();
    await inRollback(async (tx) => {
      await createUser(tx, { email: ids.email, fullName: 'No Login', userType: 'STAFF' });
      const error = await grantRole(asClient(tx), {
        email: ids.email,
        roleName: 'ADMIN',
        reason: 'sprint 1 testing',
        operator: 'test',
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(GrantRoleError);
      expect((error as GrantRoleError).reasonCode).toBe('NO_VERIFIED_IDENTITY');
    });
  });

  it('grants ADMIN to a verified user and writes one audit event; repeat is a no-op', async () => {
    const ids = testIds();
    await inRollback(async (tx) => {
      const user = await createUser(tx, {
        email: ids.email,
        fullName: 'Verified',
        userType: 'STAFF',
      });
      await linkIdentity(tx, {
        userId: user.id,
        protocol: 'OIDC',
        issuer: ids.issuer,
        subject: ids.subject,
      });

      const input = {
        email: ids.email,
        roleName: 'ADMIN' as const,
        reason: 'sprint 1 testing',
        operator: 'test',
      };
      const first = await grantRole(asClient(tx), input);
      expect(first).toMatchObject({ changed: true, previousRole: 'LEARNER' });
      expect(first.user.role.name).toBe('ADMIN');

      const second = await grantRole(asClient(tx), input);
      expect(second.changed).toBe(false);

      const events = await tx.auditEvent.findMany({
        where: { targetType: 'user', targetId: user.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ action: 'user.role_changed', reason: 'sprint 1 testing' });
      expect(events[0]?.metadata).toMatchObject({ from: 'LEARNER', to: 'ADMIN' });
    });
  });

  it('requires a reason', async () => {
    const error = await grantRole(getPrisma(), {
      email: 'nobody@educomply.invalid',
      roleName: 'ADMIN',
      reason: ' ',
      operator: 'test',
    }).catch((e: unknown) => e);
    expect((error as GrantRoleError).reasonCode).toBe('REASON_REQUIRED');
  });
});
