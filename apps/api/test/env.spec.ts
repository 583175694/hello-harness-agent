import { describe, expect, it } from 'vitest';

import { validateEnvironment } from '../src/bootstrap/env.schema';

const validEnvironment = {
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:55432/db',
};

describe('environment validation', () => {
  it('applies project-specific port defaults', () => {
    expect(validateEnvironment(validEnvironment).API_PORT).toBe(4318);
  });

  it('rejects a missing database connection string', () => {
    expect(() => validateEnvironment({})).toThrow('DATABASE_URL');
  });
});
