/**
 * Create or delete a DEVELOPMENT test identity in the local Keycloak realm.
 *
 *   npm run kc:user -- create --username learner1 --email learner1@educomply.test --first Lea --last Learner
 *   npm run kc:user -- delete --username learner1
 *
 * If --password is omitted a strong random password is generated and shown ONCE.
 * Elevated roles are not set here: sign in once, then use `npm run db:grant-role`.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  createKeycloakUser,
  deleteKeycloakUser,
  findKeycloakUserId,
  keycloakConfigFromEnv,
} from './keycloakAdmin.js';

const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run: kc:user manages development identities only.');
  process.exit(1);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    username: { type: 'string' },
    email: { type: 'string' },
    first: { type: 'string' },
    last: { type: 'string' },
    password: { type: 'string' },
  },
});
const command = positionals[0];
const usage =
  'Usage: npm run kc:user -- create --username <u> --email <e> --first <f> --last <l> [--password <p>]\n' +
  '       npm run kc:user -- delete --username <u>';

try {
  const cfg = keycloakConfigFromEnv();
  if (command === 'create' && values.username && values.email) {
    const generated = !values.password;
    const password = values.password ?? `${randomBytes(15).toString('base64url')}!9a`;
    const id = await createKeycloakUser(cfg, {
      username: values.username,
      email: values.email,
      firstName: values.first ?? values.username,
      lastName: values.last ?? 'Test',
      password,
    });
    console.log(`Created Keycloak user ${values.username} (${id}) in realm ${cfg.realm}.`);
    if (generated) {
      console.log(`Generated password (shown once, store it securely): ${password}`);
    }
  } else if (command === 'delete' && values.username) {
    const id = await findKeycloakUserId(cfg, values.username);
    if (!id) console.log('No such user; nothing deleted.');
    else {
      await deleteKeycloakUser(cfg, id);
      console.log(`Deleted Keycloak user ${values.username}.`);
    }
  } else {
    console.error(usage);
    process.exit(1);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
