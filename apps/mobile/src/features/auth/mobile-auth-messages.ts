import { AUTH_ERROR_CODES, type ProblemDetails } from '@harness/agent-protocol';

export const LOGIN_ACCOUNT_INTRO = '使用手机号接收验证码登录。邮箱登录与绑定功能后续开放。';

export function formatAuthApiError(problem: ProblemDetails): string {
  if (problem.code === AUTH_ERROR_CODES.invalidCode) {
    return problem.detail?.trim() || '验证码错误或已过期，请重新获取后再试。';
  }
  if (problem.code === AUTH_ERROR_CODES.codeRateLimited) {
    return problem.detail?.trim() || '操作过于频繁，请稍后再试。';
  }
  const detail = problem.detail?.trim();
  if (detail && problem.code !== 'INTERNAL_SERVER_ERROR') {
    return detail;
  }
  if (problem.status === 401) return '请先登录或检查验证码是否正确。';
  return '登录失败，请检查验证码或稍后重试。';
}
