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

  it('passes through HARNESS_SECRETS_MASTER_KEY for MCP secrets encryption', () => {
    const masterKey = 'c5b5c7590b12d4c4da9fe7e38ef0559f94e59c260d82c344ddb0fe9b1341449c';
    expect(
      validateEnvironment({ ...validEnvironment, HARNESS_SECRETS_MASTER_KEY: masterKey })
        .HARNESS_SECRETS_MASTER_KEY,
    ).toBe(masterKey);
  });
});
