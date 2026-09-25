import { AUTH_ERROR_CODES, type ProblemDetails } from '@harness/agent-protocol';

/** 登录弹窗 / 表单顶部说明 */
export const LOGIN_ACCOUNT_INTRO = '使用手机号接收验证码登录。邮箱登录与绑定功能后续开放。';

/** 设置 → 账号区说明 */
export const ACCOUNT_BINDING_INTRO =
  '当前仅支持手机号登录。若手机号显示未绑定但您已用手机登录，属正常（登录即验证）。请勿用不同手机号重复注册多个账号。';

const BIND_CONFLICT_EMAIL = `该邮箱已在其他账号注册，无法绑定到当前账号。
若这是你的邮箱：请退出后改用邮箱登录那个账号，并在该账号的设置中绑定手机。
若从未注册过：请检查是否输错地址。`;

const BIND_CONFLICT_PHONE = `该手机号已在其他账号注册，无法绑定到当前账号。
若这是你的手机号：请退出后改用手机号登录那个账号，并在该账号的设置中绑定邮箱。
若从未注册过：请检查是否输错号码。`;

const BIND_CONFLICT_GENERIC = `该邮箱或手机号已在其他账号注册，无法绑定到当前账号。
请先用该方式登录原账号，再在设置 → 账号中绑定另一种登录方式。`;

export type AuthErrorContext = {
  bindTarget?: 'email' | 'phone';
};

const GENERIC_SERVER_ERROR_MARKERS = [
  'An unexpected error occurred.',
  'The request could not be completed.',
  'Internal server error',
];

export function formatAuthApiError(problem: ProblemDetails, context?: AuthErrorContext): string {
  if (problem.code === AUTH_ERROR_CODES.identityAlreadyBound) {
    if (context?.bindTarget === 'email') return BIND_CONFLICT_EMAIL;
    if (context?.bindTarget === 'phone') return BIND_CONFLICT_PHONE;
    return BIND_CONFLICT_GENERIC;
  }
  if (problem.code === AUTH_ERROR_CODES.invalidCode) {
    return problem.detail?.trim() || '验证码错误或已过期，请重新获取后再试。';
  }
  if (problem.code === AUTH_ERROR_CODES.codeRateLimited) {
    return problem.detail?.trim() || '操作过于频繁，请稍后再试。';
  }
  const detail = problem.detail?.trim();
  if (
    detail &&
    !GENERIC_SERVER_ERROR_MARKERS.some((marker) => detail.includes(marker)) &&
    problem.code !== 'INTERNAL_SERVER_ERROR'
  ) {
    return detail;
  }
  if (problem.status === 401) return '请先登录或检查验证码是否正确。';
  if (problem.status === 503 || problem.code === 'ALIYUN_SMS_FAILED') {
    return detail && !GENERIC_SERVER_ERROR_MARKERS.some((m) => detail.includes(m))
      ? detail
      : '短信服务暂时不可用，请稍后重试。';
  }
  return '登录失败，请检查验证码或稍后重试。';
}
