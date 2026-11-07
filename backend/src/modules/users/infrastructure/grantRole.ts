import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AuditAction } from '../../audit/domain/auditActions.js';
import { recordAuditEvent } from '../../audit/infrastructure/auditRepository.js';
import type { RoleName } from '../domain/roles.js';
import {
  countIdentities,
  findUserByEmail,
  setUserRole,
  type UserWithRole,
} from './userRepository.js';

export class GrantRoleError extends Error {
  constructor(
    public readonly reasonCode:
      'USER_NOT_FOUND' | 'NO_VERIFIED_IDENTITY' | 'INACTIVE_USER' | 'REASON_REQUIRED',
    message: string,
  ) {
    super(message);
    this.name = 'GrantRoleError';
  }
}

export interface GrantRoleInput {
  email: string;
  roleName: RoleName;
  reason: string;
  /** Who ran the operation (e.g. OS user for CLI). Stored in audit metadata. */
  operator: string;
  /** Actor user id when granted through the admin UI (later); null for CLI. */
  actorId?: string | null;
}

export interface GrantRoleResult {
  user: UserWithRole;
  previousRole: RoleName;
  changed: boolean;
}

/**
 * Grants a role to an existing user who has signed in at least once (has a linked,
 * provider-verified identity). The change and its audit event commit together.
 * Idempotent: granting the current role changes nothing and writes no event.
 */
export async function grantRole(
  prisma: PrismaClient,
  input: GrantRoleInput,
): Promise<GrantRoleResult> {
  const reason = input.reason.trim();
  if (reason.length < 5) {
    throw new GrantRoleError('REASON_REQUIRED', 'A reason of at least 5 characters is required.');
  }

  return prisma.$transaction(async (tx) => {
    const user = await findUserByEmail(tx, input.email);
    if (!user) throw new GrantRoleError('USER_NOT_FOUND', 'No user with that email exists.');
    if (!user.isActive) throw new GrantRoleError('INACTIVE_USER', 'The user account is inactive.');
    if ((await countIdentities(tx, user.id)) === 0) {
      throw new GrantRoleError(
        'NO_VERIFIED_IDENTITY',
        'The user has no linked institutional identity. They must sign in once before a role can be granted.',
      );
    }

    const previousRole = user.role.name as RoleName;
    if (previousRole === input.roleName) return { user, previousRole, changed: false };

    const updated = await setUserRole(tx, user.id, input.roleName);
    await recordAuditEvent(tx, {
      action: AuditAction.UserRoleChanged,
      actorId: input.actorId ?? null,
      targetType: 'user',
      targetId: user.id,
      reason,
      metadata: { from: previousRole, to: input.roleName, operator: input.operator },
    });
    return { user: updated, previousRole, changed: true };
  });
}
