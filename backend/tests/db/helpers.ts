import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { getPrisma } from '../../src/shared/infrastructure/database/prisma.js';

class RollbackSignal extends Error {
  constructor() {
    super('rollback');
  }
}

/**
 * Runs `fn` inside an interactive transaction and always rolls it back,
 * so tests never leave data behind or touch existing records.
 */
export async function inRollback(
  fn: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await getPrisma().$transaction(
      async (tx) => {
        await fn(tx);
        throw new RollbackSignal();
      },
      { timeout: 25_000, maxWait: 10_000 },
    );
  } catch (err) {
    if (!(err instanceof RollbackSignal)) throw err;
  }
}

/** Unique, clearly-synthetic identifiers for test records. */
export function testIds() {
  const tag = randomUUID().slice(0, 8);
  return {
    email: `test+${tag}@educomply.invalid`,
    issuer: `https://idp.test.invalid/${tag}`,
    subject: `sub-${tag}`,
    institutionalId: `T-${tag}`,
  };
}
