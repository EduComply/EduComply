import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';

describe('GET /api/v1/health', () => {
  it('returns service status', async () => {
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'educomply-api' });
  });
});

describe('unknown routes', () => {
  it('return RFC 9457 problem details', async () => {
    const res = await request(createApp()).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 404, title: 'Not Found' });
  });
});

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv({});
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('reports invalid variable names without their values', () => {
    expect(() => parseEnv({ PORT: 'not-a-port', APP_ORIGIN: 'secret-value' })).toThrowError(
      /PORT, APP_ORIGIN$/,
    );
    try {
      parseEnv({ APP_ORIGIN: 'secret-value' });
    } catch (e) {
      expect((e as Error).message).not.toContain('secret-value');
    }
  });
});
