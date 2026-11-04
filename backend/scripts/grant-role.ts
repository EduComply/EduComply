/**
 * DEVELOPMENT-ONLY trusted procedure for granting a role (e.g. ADMIN) to a test user.
 *
 * The user must already exist AND have signed in through the identity provider at least
 * once (a linked USER_IDENTITY), so the account belongs to a provider-verified person.
 * The role change and an audit event are written in one transaction.
 *
 *   npm run db:grant-role -- --email someone@uni.ac.lk --role ADMIN --reason "Sprint 1 test admin"
 */
import { userInfo } from 'node:os';
import { parseArgs } from 'node:util';
import { env } from '../src/config/env.js';
import { grantRole, GrantRoleError } from '../src/modules/users/application/grantRole.js';
import { isRoleName, ROLE_NAMES } from '../src/modules/users/domain/roles.js';
import { databaseErrorCode } from '../src/shared/infrastructure/database/errors.js';
import { disconnectPrisma, getPrisma } from '../src/shared/infrastructure/database/prisma.js';

const usage = `Usage: npm run db:grant-role -- --email <email> --role <${ROLE_NAMES.join('|')}> --reason "<why>"`;

if (env.NODE_ENV === 'production') {
  console.error(
    'Refusing to run: grant-role is a development-only procedure (NODE_ENV=production).',
  );
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    role: { type: 'string' },
    reason: { type: 'string' },
  },
});

if (!values.email || !values.role || !values.reason) {
  console.error(usage);
  process.exit(1);
}
const role = values.role.toUpperCase();
if (!isRoleName(role)) {
  console.error(`Unknown role "${values.role}". ${usage}`);
  process.exit(1);
}

try {
  const result = await grantRole(getPrisma(), {
    email: values.email,
    roleName: role,
    reason: values.reason,
    operator: `cli:${userInfo().username}`,
  });
  console.log(
    result.changed
      ? `Role changed ${result.previousRole} → ${role} for user ${result.user.id}; audit event recorded.`
      : `User ${result.user.id} already has role ${role}; nothing changed.`,
  );
} catch (err) {
  if (err instanceof GrantRoleError)
    console.error(`Not granted (${err.reasonCode}): ${err.message}`);
  else console.error(`Failed (${databaseErrorCode(err) ?? (err as Error).name}).`);
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
