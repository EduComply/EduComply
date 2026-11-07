import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';
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
  timeoutMs = 25_000,
): Promise<void> {
  try {
    await getPrisma().$transaction(
      async (tx) => {
        await fn(tx);
        throw new RollbackSignal();
      },
      { timeout: timeoutMs, maxWait: 15_000 },
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

/**
 * Wraps a transaction client so code that opens its own `$transaction` runs inside the
 * surrounding test transaction instead (and is therefore rolled back too).
 */
export function asClient(tx: unknown): PrismaClient {
  return new Proxy(tx as object, {
    get(target, prop, receiver) {
      if (prop === '$transaction') {
        return (fn: (t: unknown) => Promise<unknown>) => fn(target);
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as PrismaClient;
}
