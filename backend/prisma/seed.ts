/**
 * Idempotent seed: ensures the LEARNER, ADMIN and REVIEWER roles exist.
 * Creates no users, accounts or passwords. Safe to run repeatedly.
 *   npm run db:seed
 */
import { seedRoles } from '../src/modules/users/infrastructure/roleRepository.js';
import { disconnectPrisma, getPrisma } from '../src/shared/infrastructure/database/prisma.js';
import { databaseErrorCode } from '../src/shared/infrastructure/database/errors.js';

try {
  const result = await seedRoles(getPrisma());
  console.log(
    `Roles seeded — created: [${result.created.join(', ')}], updated: [${result.updated.join(', ')}], unchanged: [${result.unchanged.join(', ')}]`,
  );
} catch (err) {
  console.error(`Seeding failed (${databaseErrorCode(err) ?? (err as Error).name}).`);
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
