import { AUTH_ERROR_CODES } from '@harness/agent-protocol';
import { describe, expect, it } from 'vitest';

import { formatAuthApiError } from './auth-messages';

describe('formatAuthApiError', () => {
  it('expands identity conflict for email bind', () => {
    const message = formatAuthApiError(
      {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        code: AUTH_ERROR_CODES.identityAlreadyBound,
        detail: '该邮箱已被其他账号绑定。',
      },
      { bindTarget: 'email' },
    );
    expect(message).toContain('改用邮箱登录');
    expect(message).toContain('\n');
  });

  it('passes through other problem details', () => {
    expect(
      formatAuthApiError({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        code: AUTH_ERROR_CODES.invalidCode,
        detail: '验证码错误。',
      }),
    ).toBe('验证码错误。');
  });
});
