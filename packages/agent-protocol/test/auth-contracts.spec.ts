import { describe, expect, it } from 'vitest';

import { authLoginResponseSchema } from '../src/auth/contracts.js';

describe('authLoginResponseSchema', () => {
  it('accepts masked email in user view', () => {
    const parsed = authLoginResponseSchema.safeParse({
      user: {
        id: 'user-1',
        displayName: 'demo',
        email: 'de***@example.com',
        phone: null,
        role: 'user',
        status: 'active',
      },
    });
    expect(parsed.success).toBe(true);
  });
});
