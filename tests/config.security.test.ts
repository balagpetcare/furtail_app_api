import { env } from '../src/config/env';

describe('Production Readiness & Hardening Audit', () => {
  it('loads environment configuration correctly in non-production environments', () => {
    expect(env.NODE_ENV).toBeDefined();
    expect(env.PORT).toBeGreaterThan(0);
  });
});
