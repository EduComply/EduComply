/**
 * Read-only inspection of the configured database. Prints table names and row
 * counts only — never connection details. Usage: npm run db:inspect -w backend
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const rootEnvFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_URL / DATABASE_URL is not set.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
try {
  await client.connect();
  const meta = await client.query<{ db: string; version: string }>(
    "select current_database() as db, split_part(version(), ' ', 2) as version",
  );
  console.log(`Connected: database=${meta.rows[0]?.db} postgres=${meta.rows[0]?.version}`);

  const tables = await client.query<{ schema: string; table: string }>(
    `select table_schema as schema, table_name as table
       from information_schema.tables
      where table_type = 'BASE TABLE'
        and table_schema not in ('pg_catalog', 'information_schema')
      order by 1, 2`,
  );
  if (tables.rows.length === 0) {
    console.log('No user tables found.');
  }
  for (const { schema, table } of tables.rows) {
    const count = await client.query<{ n: string }>(
      `select count(*)::text as n from ${client.escapeIdentifier(schema)}.${client.escapeIdentifier(table)}`,
    );
    console.log(`  ${schema}.${table}: ${count.rows[0]?.n} rows`);
  }
} catch (err) {
  // Report the error class/code only; pg messages can include host names.
  const e = err as { code?: string; name?: string; message?: string };
  const timedOut = /timeout/i.test(e.message ?? '');
  console.error(
    `Database inspection failed (${timedOut ? 'CONNECT_TIMEOUT' : (e.code ?? e.name ?? 'unknown error')}).` +
      (timedOut ? ' Port 5432 may be blocked on this network.' : ''),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
