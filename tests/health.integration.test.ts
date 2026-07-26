import request from 'supertest';

import { createApp } from '../src/app';

const app = createApp();

describe('GET /health', () => {
  it('returns 200 and an alive status without checking external services', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ status: 'alive' });
  });

  it('sets an X-Request-Id response header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(typeof res.headers['x-request-id']).toBe('string');
  });
});

describe('GET /ready', () => {
  it('returns 200 with database readiness and external dependencies reported', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      status: 'ready',
      dependencies: {
        database: {
          status: 'NOT_CONFIGURED',
        },
        redis: 'NOT_CONFIGURED',
        queue: 'NOT_CONFIGURED',
        storage: 'NOT_CONFIGURED',
        push: 'NOT_CONFIGURED',
        auth: 'NOT_CONFIGURED',
      },
    });
  });
});

describe('GET /api/v1/version', () => {
  it('returns service metadata without leaking filesystem paths', async () => {
    const res = await request(app).get('/api/v1/version');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      service: 'furtail-app-api',
      apiVersion: 'v1',
      applicationVersion: '0.1.0',
      environment: 'test',
    });
    expect(typeof res.body.data.uptimeSeconds).toBe('number');

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/[A-Z]:\\/); // no Windows filesystem path
    expect(serialized).not.toContain(process.cwd());
  });
});

describe('unmatched routes', () => {
  it('returns a 404 error envelope for an unknown route', async () => {
    const res = await request(app).get('/this-route-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
