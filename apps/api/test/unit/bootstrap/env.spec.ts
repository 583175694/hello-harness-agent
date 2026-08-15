import { describe, expect, it } from 'vitest';

import { validateEnvironment } from '../../../src/bootstrap/env.schema';

const validEnvironment = {
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/db',
};

describe('environment validation', () => {
  it('applies project-specific port defaults', () => {
    expect(validateEnvironment(validEnvironment).API_PORT).toBe(4318);
  });

  it('rejects a missing database connection string', () => {
    expect(() => validateEnvironment({})).toThrow('DATABASE_URL');
  });

  it.each(['bocha', 'serp'] as const)('accepts the %s search provider', (provider) => {
    expect(
      validateEnvironment({ ...validEnvironment, SEARCH_PROVIDER: provider }).SEARCH_PROVIDER,
    ).toBe(provider);
  });

  it.each(['bocha,serp', 'google', 'BOCHA'])('rejects invalid search provider %s', (provider) => {
    expect(() => validateEnvironment({ ...validEnvironment, SEARCH_PROVIDER: provider })).toThrow(
      'SEARCH_PROVIDER',
    );
  });

  it('only permits eval fixtures in test processes', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        EVAL_FIXTURE_ROOT: '/tmp/context-fixtures',
      }),
    ).toThrow('EVAL_FIXTURE_ROOT');
    expect(
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'test',
        EVAL_FIXTURE_ROOT: '/tmp/context-fixtures',
      }).EVAL_FIXTURE_ROOT,
    ).toBe('/tmp/context-fixtures');
  });
});
