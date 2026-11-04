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
  toHttpError,
} from '../src/shared/infrastructure/database/errors.js';

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
