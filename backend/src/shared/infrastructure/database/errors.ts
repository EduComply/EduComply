import { Prisma } from '../../../generated/prisma/client.js';
import { Errors, HttpError } from '../../http/problem.js';

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not configured');
    this.name = 'DatabaseNotConfiguredError';
  }
}

/** Postgres error raised by the append-only audit trigger (SQLSTATE 42501). */
const INSUFFICIENT_PRIVILEGE = '42501';

/**
 * Maps database errors to RFC 9457 HTTP errors without exposing SQL, constraint
 * values or connection details to the client. Returns undefined for non-database errors.
 */
export function toHttpError(err: unknown): HttpError | undefined {
  if (err instanceof DatabaseNotConfiguredError) {
    return Errors.serviceUnavailable('The database is not configured.');
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return new HttpError(409, 'CONFLICT', 'Conflict', {
          detail: 'A record with the same unique value already exists.',
        });
      case 'P2003':
        return new HttpError(409, 'CONFLICT', 'Conflict', {
          detail:
            'The operation references a related record that does not exist or is still in use.',
        });
      case 'P2025':
        return Errors.notFound('The requested record was not found.');
      case 'P1001':
      case 'P1002':
      case 'P1008':
      case 'P1017':
      case 'P2024':
        return Errors.serviceUnavailable('The database is temporarily unavailable.');
      default:
        return undefined;
    }
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return Errors.serviceUnavailable('The database is temporarily unavailable.');
  }

  return undefined;
}

/** Returns the Postgres SQLSTATE or Prisma error code, if any (safe to log). */
export function databaseErrorCode(err: unknown): string | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = err.meta as
      { driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
    return meta?.driverAdapterError?.cause?.originalCode ?? err.code;
  }
  if (err instanceof Prisma.PrismaClientInitializationError) return err.errorCode ?? 'INIT';
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

export function isAppendOnlyViolation(err: unknown): boolean {
  return (
    databaseErrorCode(err) === INSUFFICIENT_PRIVILEGE ||
    (err instanceof Error && err.message.includes('audit_event is append-only'))
  );
}
