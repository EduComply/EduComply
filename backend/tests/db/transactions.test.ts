/**
 * Transaction semantics over the configured DATABASE_TRANSPORT (tcp or websocket):
 * real commits, rollbacks and concurrent interactive transactions. Uses temporary tables
 * only (dropped at commit or rolled back), so no application table is touched.
 *
 * Run: npm run test:db   (or with DATABASE_TRANSPORT=websocket)
 */
import { afterAll, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { disconnectPrisma, getPrisma } from '../../src/shared/infrastructure/database/prisma.js';

afterAll(disconnectPrisma);

describe(`interactive transactions (transport: ${env.DATABASE_TRANSPORT})`, () => {
  it('commits: writes inside the transaction are visible and it completes', async () => {
    const total = await getPrisma().$transaction(async (tx) => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE tx_probe (n int) ON COMMIT DROP');
      await tx.$executeRawUnsafe('INSERT INTO tx_probe VALUES (1), (2), (3)');
      const rows = await tx.$queryRawUnsafe<Array<{ s: bigint }>>(
        'SELECT sum(n) AS s FROM tx_probe',
      );
      return Number(rows[0]!.s);
    });
    expect(total).toBe(6);
  });

  it('rolls back on error: nothing survives the failed transaction', async () => {
    await expect(
      getPrisma().$transaction(async (tx) => {
        await tx.$executeRawUnsafe('CREATE TEMP TABLE tx_rollback_probe (n int)');
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');
    const rows = await getPrisma().$queryRawUnsafe<Array<{ t: string | null }>>(
      "SELECT to_regclass('pg_temp.tx_rollback_probe')::text AS t",
    );
    expect(rows[0]!.t).toBeNull();
  });

  it('keeps concurrent transactions isolated from each other', async () => {
    // Each transaction writes its own value to a session-local temp table; if two of them
    // shared a connection mid-transaction they would see each other's rows.
    // (Backend pids are not compared: Neon's pooler may reuse a backend between transactions.)
    const sums = await Promise.all(
      [1, 2, 3].map((n) =>
        getPrisma().$transaction(async (tx) => {
          await tx.$executeRawUnsafe('CREATE TEMP TABLE tx_iso (n int) ON COMMIT DROP');
          await tx.$executeRawUnsafe(`INSERT INTO tx_iso VALUES (${n * 10})`);
          await tx.$queryRawUnsafe('SELECT pg_sleep(0.2)::text');
          const r = await tx.$queryRawUnsafe<Array<{ s: bigint; c: bigint }>>(
            'SELECT sum(n) AS s, count(*) AS c FROM tx_iso',
          );
          return { sum: Number(r[0]!.s), count: Number(r[0]!.c) };
        }),
      ),
    );
    expect(sums).toEqual([
      { sum: 10, count: 1 },
      { sum: 20, count: 1 },
      { sum: 30, count: 1 },
    ]);
  });
});
