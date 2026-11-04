import type { Role } from '../../../generated/prisma/client.js';
import type { DbClient } from '../../../shared/infrastructure/database/prisma.js';
import { ROLE_DESCRIPTIONS, ROLE_NAMES, type RoleName } from '../domain/roles.js';

export function findRoleByName(db: DbClient, name: RoleName): Promise<Role | null> {
  return db.role.findUnique({ where: { name } });
}

export function listRoles(db: DbClient): Promise<Role[]> {
  return db.role.findMany({ orderBy: { id: 'asc' } });
}

export interface SeedRolesResult {
  created: RoleName[];
  updated: RoleName[];
  unchanged: RoleName[];
}

/**
 * Idempotently ensures every application role exists with its current description.
 * Never deletes roles and never touches users.
 */
export async function seedRoles(db: DbClient): Promise<SeedRolesResult> {
  const result: SeedRolesResult = { created: [], updated: [], unchanged: [] };
  for (const name of ROLE_NAMES) {
    const description = ROLE_DESCRIPTIONS[name];
    const existing = await db.role.findUnique({ where: { name } });
    if (!existing) {
      await db.role.upsert({ where: { name }, create: { name, description }, update: {} });
      result.created.push(name);
    } else if (existing.description !== description) {
      await db.role.update({ where: { name }, data: { description } });
      result.updated.push(name);
    } else {
      result.unchanged.push(name);
    }
  }
  return result;
}
