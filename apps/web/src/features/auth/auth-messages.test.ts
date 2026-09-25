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

  it('passes through invalid code detail', () => {
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

  it('replaces generic english server errors with chinese login hint', () => {
    expect(
      formatAuthApiError({
        type: 'about:blank',
        title: 'Internal server error',
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        detail: 'An unexpected error occurred.',
      }),
    ).toBe('登录失败，请检查验证码或稍后重试。');
  });
});
