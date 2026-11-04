import { Prisma } from '../../../generated/prisma/client.js';
import { Errors, HttpError } from '../../http/problem.js';

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not configured');
    this.name = 'DatabaseNotConfiguredError';
  }
}

/**
 * With DATABASE_TRANSPORT=websocket, a failed WebSocket (blocked, DNS, TLS rejected) reaches
 * the caller as the driver's raw DOM ErrorEvent rather than a Prisma error. It carries no
 * message or connection details.
 */
export function isWebSocketFailure(err: unknown): boolean {
  return typeof Event !== 'undefined' && err instanceof Event && err.type === 'error';
}

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);
/** Fixed messages of pg / the Neon driver when a connection cannot be (kept) open. */
const CONNECTION_MESSAGES =
  /^(Connection terminated (due to connection timeout|unexpectedly)|timeout exceeded when trying to connect)/;

/** Raw driver error for a connection that could not be opened or was lost (either transport). */
export function isConnectionFailure(err: unknown): boolean {
  if (isWebSocketFailure(err)) return true;
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  return (
    (typeof code === 'string' && NETWORK_CODES.has(code)) || CONNECTION_MESSAGES.test(err.message)
  );
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
      case 'P1000': // authentication failed (logged by code; clients see 503)
      case 'P1001':
      case 'P1002':
      case 'P1008':
      case 'P1017':
      case 'P2024':
      case 'P2028': // transaction could not start/finish in time
        return Errors.serviceUnavailable('The database is temporarily unavailable.');
      default:
        return undefined;
    }
  }

  if (err instanceof Prisma.PrismaClientInitializationError || isConnectionFailure(err)) {
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
  if (isWebSocketFailure(err)) return 'DB_WEBSOCKET_FAILED';
  if (err instanceof Error && /connection timeout|timeout exceeded/.test(err.message)) {
    return 'DB_CONNECT_TIMEOUT';
  }
  if (err instanceof Error && err.message.startsWith('Connection terminated')) {
    return 'DB_CONNECTION_LOST';
  }
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

export function isAppendOnlyViolation(err: unknown): boolean {
  return (
    databaseErrorCode(err) === INSUFFICIENT_PRIVILEGE ||
    (err instanceof Error && err.message.includes('audit_event is append-only'))
  );
}
