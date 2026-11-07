import type {
  AuthProtocol,
  Role,
  User,
  UserIdentity,
  UserType,
} from '../../../generated/prisma/client.js';
import type { DbClient } from '../../../shared/infrastructure/database/prisma.js';
import { DEFAULT_ROLE, type RoleName } from '../domain/roles.js';

export type UserWithRole = User & { role: Role };

export interface CreateUserInput {
  email: string;
  fullName: string;
  userType: UserType;
  roleName?: RoleName;
  institutionalId?: string | null;
  department?: string | null;
}

/** Emails are compared case-insensitively by storing them lower-cased. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createUser(db: DbClient, input: CreateUserInput): Promise<UserWithRole> {
  return db.user.create({
    data: {
      email: normaliseEmail(input.email),
      fullName: input.fullName.trim(),
      userType: input.userType,
      institutionalId: input.institutionalId ?? null,
      department: input.department ?? null,
      role: { connect: { name: input.roleName ?? DEFAULT_ROLE } },
    },
    include: { role: true },
  });
}

export function findUserByEmail(db: DbClient, email: string): Promise<UserWithRole | null> {
  return db.user.findUnique({ where: { email: normaliseEmail(email) }, include: { role: true } });
}

export interface LinkIdentityInput {
  userId: string;
  protocol: AuthProtocol;
  issuer: string;
  subject: string;
}

/** Links an external identity. Fails with P2002 if (issuer, subject) is already linked. */
export function linkIdentity(db: DbClient, input: LinkIdentityInput): Promise<UserIdentity> {
  return db.userIdentity.create({ data: input });
}

export async function findUserByIdentity(
  db: DbClient,
  issuer: string,
  subject: string,
): Promise<UserWithRole | null> {
  const identity = await db.userIdentity.findUnique({
    where: { issuer_subject: { issuer, subject } },
    include: { user: { include: { role: true } } },
  });
  return identity?.user ?? null;
}

export function countIdentities(db: DbClient, userId: string): Promise<number> {
  return db.userIdentity.count({ where: { userId } });
}

export function setUserRole(
  db: DbClient,
  userId: string,
  roleName: RoleName,
): Promise<UserWithRole> {
  return db.user.update({
    where: { id: userId },
    data: { role: { connect: { name: roleName } } },
    include: { role: true },
  });
}
