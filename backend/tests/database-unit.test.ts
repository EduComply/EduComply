import { PrismaNeon, PrismaNeonHttp } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { hashIp } from '../src/modules/audit/infrastructure/auditRepository.js';
import { DEFAULT_ROLE, isRoleName, ROLE_NAMES } from '../src/modules/users/domain/roles.js';
import { normaliseEmail } from '../src/modules/users/infrastructure/userRepository.js';
import { parseEnv } from '../src/config/env.js';
import { withVerifiedTls } from '../src/shared/infrastructure/database/sslmode.js';
import {
  DatabaseNotConfiguredError,
  databaseErrorCode,
  isConnectionFailure,
  toHttpError,
} from '../src/shared/infrastructure/database/errors.js';
import { createAdapter } from '../src/shared/infrastructure/database/prisma.js';

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('secret detail host=db.example', {
    code,
    clientVersion: 'test',
  });

describe('database error mapping', () => {
  it.each([
    ['P2002', 409],
    ['P2003', 409],
    ['P2025', 404],
    ['P1001', 503],
  ])('maps %s to HTTP %i without leaking the driver message', (code, status) => {
    const http = toHttpError(known(code));
    expect(http?.status).toBe(status);
    expect(JSON.stringify(http?.toProblem())).not.toContain('secret detail');
  });

  it('maps a missing configuration to 503', () => {
    expect(toHttpError(new DatabaseNotConfiguredError())?.status).toBe(503);
  });

  it('ignores non-database errors', () => {
    expect(toHttpError(new Error('boom'))).toBeUndefined();
  });

  it('exposes only the error code for logging', () => {
    expect(databaseErrorCode(known('P2002'))).toBe('P2002');
  });
});

describe('environment validation for database URLs', () => {
  it('accepts postgresql:// URLs', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgresql://u:p@host-pooler/db?sslmode=require',
      DIRECT_URL: 'postgres://u:p@host/db',
    });
    expect(env.DATABASE_URL).toBeDefined();
  });

  it('rejects malformed URLs and reports only the variable name', () => {
    const run = () => parseEnv({ DATABASE_URL: 'mysql://user:hunter2@host/db' });
    expect(run).toThrowError(/DATABASE_URL/);
    expect(run).not.toThrowError(/hunter2/);
  });

  it('requires DATABASE_URL in production', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrowError(/DATABASE_URL/);
  });
});

describe('domain helpers', () => {
  it('defines the three Sprint 1 roles with LEARNER as default', () => {
    expect(ROLE_NAMES).toEqual(['LEARNER', 'ADMIN', 'REVIEWER']);
    expect(DEFAULT_ROLE).toBe('LEARNER');
    expect(isRoleName('ADMIN')).toBe(true);
    expect(isRoleName('admin')).toBe(false);
  });

  it('normalises emails', () => {
    expect(normaliseEmail('  Jane.Doe@Uni.AC.lk ')).toBe('jane.doe@uni.ac.lk');
  });

  it('hashes IP addresses with SHA-256', () => {
    expect(hashIp('203.0.113.7')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pseudonymises IPs with a secret key (not reversible by hashing every address)', () => {
    const key = 'a'.repeat(32);
    const keyed = hashIp('203.0.113.7', key);
    expect(keyed).toMatch(/^[0-9a-f]{64}$/); // still fits audit_event.ip_hash char(64)
    expect(keyed).toBe(hashIp('203.0.113.7', key)); // stable: same IP, same value
    expect(keyed).not.toBe(hashIp('203.0.113.7', 'b'.repeat(32))); // depends on the key
    expect(keyed).not.toBe(hashIp('203.0.113.7', undefined)); // differs from a plain SHA-256
  });

  it('requires a strong audit IP key in production', () => {
    expect(() => parseEnv({ AUDIT_IP_HASH_KEY: 'short' })).toThrowError(/AUDIT_IP_HASH_KEY/);
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrowError(/AUDIT_IP_HASH_KEY/);
  });
});

describe('withVerifiedTls (explicit certificate verification for pg)', () => {
  const base = 'postgresql://u:p@ep-example.neon.tech/db';
  it.each(['require', 'prefer', 'verify-ca'])('upgrades sslmode=%s to verify-full', (mode) => {
    const out = new URL(withVerifiedTls(`${base}?sslmode=${mode}&channel_binding=require`));
    expect(out.searchParams.get('sslmode')).toBe('verify-full');
    expect(out.searchParams.get('channel_binding')).toBe('require');
    expect(out.password).toBe('p');
  });
  it('leaves verify-full, disable, missing sslmode and libpq-compat URLs unchanged', () => {
    for (const url of [
      `${base}?sslmode=verify-full`,
      `${base}?sslmode=disable`,
      base,
      `${base}?uselibpqcompat=true&sslmode=require`,
      'not a url',
    ]) {
      expect(withVerifiedTls(url)).toBe(url);
    }
  });
});

describe('database transport (DATABASE_TRANSPORT)', () => {
  const url = 'postgresql://u:p@ep-example-pooler.neon.tech/db?sslmode=require';

  it('defaults to TCP and accepts only tcp | websocket', () => {
    expect(parseEnv({}).DATABASE_TRANSPORT).toBe('tcp');
    expect(parseEnv({ DATABASE_TRANSPORT: 'websocket' }).DATABASE_TRANSPORT).toBe('websocket');
    expect(() => parseEnv({ DATABASE_TRANSPORT: 'http' })).toThrowError(/DATABASE_TRANSPORT/);
  });

  it('selects the pg adapter for tcp and the Neon WebSocket adapter for websocket', () => {
    expect(createAdapter(url, 'tcp')).toBeInstanceOf(PrismaPg);
    const ws = createAdapter(url, 'websocket');
    expect(ws).toBeInstanceOf(PrismaNeon);
    // PrismaNeon (WebSocket Pool) supports interactive transactions; PrismaNeonHttp does not.
    expect(ws).not.toBeInstanceOf(PrismaNeonHttp);
  });
});

describe('connection failures map to a sanitized 503', () => {
  it.each([
    [
      'WebSocket error event (blocked / refused / TLS rejected)',
      new Event('error'),
      'DB_WEBSOCKET_FAILED',
    ],
    [
      'connect timeout',
      new Error('Connection terminated due to connection timeout'),
      'DB_CONNECT_TIMEOUT',
    ],
    [
      'pool connect timeout',
      new Error('timeout exceeded when trying to connect'),
      'DB_CONNECT_TIMEOUT',
    ],
    ['connection lost', new Error('Connection terminated unexpectedly'), 'DB_CONNECTION_LOST'],
    [
      'refused',
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5432'), { code: 'ECONNREFUSED' }),
      'ECONNREFUSED',
    ],
  ])('%s', (_label, err, code) => {
    expect(isConnectionFailure(err)).toBe(true);
    const http = toHttpError(err);
    expect(http?.status).toBe(503);
    expect(JSON.stringify(http?.toProblem())).not.toMatch(/10\.0\.0\.1|5432/);
    expect(databaseErrorCode(err)).toBe(code);
  });

  it('does not treat ordinary errors or non-error events as connection failures', () => {
    expect(isConnectionFailure(new Error('boom'))).toBe(false);
    expect(isConnectionFailure(new Event('close'))).toBe(false);
    expect(toHttpError(new Error('Connection pool is great'))).toBeUndefined();
  });
});
