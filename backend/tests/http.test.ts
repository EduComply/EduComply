/**
 * MOCKED tests: Express foundation (readiness, errors, request ids, CORS, headers).
 * Dependencies are replaced with fake readiness checks — no PostgreSQL or Redis needed.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import type { ReadinessChecks } from '../src/modules/health/application/getReadiness.js';
import { errorHandler } from '../src/shared/http/errorHandler.js';
import { ERROR_TYPE_BASE } from '../src/shared/http/problem.js';
import { requestLogger } from '../src/shared/http/requestLogger.js';
import { validate, validated } from '../src/shared/http/validate.js';
import type { DependencyStatus } from '../src/shared/infrastructure/dependency.js';
import { logger } from '../src/shared/logger.js';

const UP: DependencyStatus = { status: 'up', latencyMs: 3 };
const fake = (result: DependencyStatus) => async () => result;
const checks = (overrides: Partial<ReadinessChecks> = {}): ReadinessChecks => ({
  database: fake(UP),
  redis: fake(UP),
  ...overrides,
});
const ORIGIN = 'http://localhost:5173';
const app = (overrides: Partial<ReadinessChecks> = {}, timeoutMs?: number) =>
  createApp({
    readinessChecks: checks(overrides),
    corsOrigins: [ORIGIN],
    ...(timeoutMs ? { readinessTimeoutMs: timeoutMs } : {}),
  });

describe('liveness', () => {
  it('GET /api/v1/health returns 200 without touching dependencies', async () => {
    const failing = app({
      database: () => Promise.reject(new Error('must not be called')),
      redis: () => Promise.reject(new Error('must not be called')),
    });
    const res = await request(failing).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'educomply-api' });
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('readiness', () => {
  it('returns 200 when PostgreSQL and Redis are up', async () => {
    const res = await request(app()).get('/api/v1/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ready',
      checks: { database: UP, redis: UP },
    });
  });

  it('keeps /api/v1/health/ready as an alias', async () => {
    const res = await request(app()).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('returns 503 when the database is down', async () => {
    const res = await request(app({ database: fake({ status: 'down', code: 'P1001' }) })).get(
      '/api/v1/ready',
    );
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
    expect(res.body.checks.database).toEqual({ status: 'down', code: 'P1001' });
    expect(res.body.checks.redis.status).toBe('up');
  });

  it('returns 503 when Redis is down', async () => {
    const res = await request(app({ redis: fake({ status: 'down', code: 'NOT_CONNECTED' }) })).get(
      '/api/v1/ready',
    );
    expect(res.status).toBe(503);
    expect(res.body.checks.redis).toEqual({ status: 'down', code: 'NOT_CONNECTED' });
  });

  it('returns 503 when a dependency is not configured', async () => {
    const res = await request(app({ redis: fake({ status: 'not_configured' }) })).get(
      '/api/v1/ready',
    );
    expect(res.status).toBe(503);
  });

  it('times out a hung check instead of hanging the probe', async () => {
    const res = await request(app({ database: () => new Promise(() => {}) }, 50)).get(
      '/api/v1/ready',
    );
    expect(res.status).toBe(503);
    expect(res.body.checks.database).toMatchObject({ status: 'down', code: 'TIMEOUT' });
  });

  it('reports only an error code when a check throws (no message or connection string)', async () => {
    const leaky = Object.assign(new Error('connect to postgresql://user:hunter2@db failed'), {
      code: 'ECONNREFUSED',
    });
    const res = await request(app({ database: () => Promise.reject(leaky) })).get('/api/v1/ready');
    expect(res.status).toBe(503);
    expect(res.body.checks.database).toMatchObject({ status: 'down', code: 'ECONNREFUSED' });
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|postgresql:/);
  });
});

describe('standard error responses', () => {
  it('404 uses RFC 9457 problem details with code, instance and requestId', async () => {
    const res = await request(app()).get('/api/v1/nope?x=1');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toEqual({
      type: `${ERROR_TYPE_BASE}not-found`,
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'No route matches GET /api/v1/nope',
      instance: '/api/v1/nope',
      requestId: res.headers['x-request-id'],
    });
  });

  it('malformed JSON → 400 VALIDATION_FAILED', async () => {
    const res = await request(app())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"bad json');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'body', message: 'Malformed JSON' }],
    });
  });

  it('bodies over the 100 kB limit → 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(110 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('request ids', () => {
  it('generates an X-Request-Id for every response', async () => {
    const res = await request(app()).get('/api/v1/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('propagates a safe incoming X-Request-Id', async () => {
    const res = await request(app()).get('/api/v1/health').set('X-Request-Id', 'proxy-abc-12345');
    expect(res.headers['x-request-id']).toBe('proxy-abc-12345');
  });

  it('replaces unsafe incoming ids', async () => {
    const res = await request(app())
      .get('/api/v1/health')
      .set('X-Request-Id', 'bad id with spaces <script>');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('CORS', () => {
  it('allows the configured origin with credentials and exposes X-Request-Id', async () => {
    const res = await request(app()).get('/api/v1/health').set('Origin', ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-expose-headers']).toContain('X-Request-Id');
  });

  it('answers preflight for the allowed origin', async () => {
    const res = await request(app())
      .options('/api/v1/health')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, X-CSRF-Token');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toContain('X-CSRF-Token');
  });

  it('sends no CORS headers to other origins', async () => {
    const res = await request(app()).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('security headers', () => {
  it('sets Helmet headers and hides the framework', async () => {
    const res = await request(app()).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('validation middleware', () => {
  const Body = z.strictObject({ email: z.email(), age: z.number().int().min(16) });
  const Query = z.strictObject({ limit: z.coerce.number().int().max(100).default(25) });

  const testApp = express();
  testApp.use(requestLogger(logger));
  testApp.use(express.json());
  testApp.post('/things', validate({ body: Body, query: Query }), (req, res) => {
    res.json({
      body: validated<z.infer<typeof Body>>(req, 'body'),
      query: validated<z.infer<typeof Query>>(req, 'query'),
    });
  });
  testApp.get('/boom', () => {
    throw new Error('secret: password=hunter2');
  });
  testApp.use(errorHandler);

  it('passes parsed values to the handler', async () => {
    const res = await request(testApp)
      .post('/things?limit=10')
      .send({ email: 'a@uni.ac.lk', age: 20 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ body: { email: 'a@uni.ac.lk', age: 20 }, query: { limit: 10 } });
  });

  it('rejects invalid input with a field list', async () => {
    const res = await request(testApp)
      .post('/things?limit=500')
      .send({ email: 'not-an-email', age: 12 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    const paths = (res.body.errors as { path: string }[]).map((e) => e.path).sort();
    expect(paths).toEqual(['body.age', 'body.email', 'query.limit']);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('rejects unknown fields (strict schemas)', async () => {
    const res = await request(testApp)
      .post('/things')
      .send({ email: 'a@uni.ac.lk', age: 20, isAdmin: true });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].path).toBe('body');
  });

  it('hides internal error details behind a generic 500', async () => {
    const res = await request(testApp).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR', title: 'Internal Server Error' });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
});
