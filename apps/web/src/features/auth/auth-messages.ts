import { AUTH_ERROR_CODES, type ProblemDetails } from '@harness/agent-protocol';

/** 登录弹窗 / 表单顶部说明 */
export const LOGIN_ACCOUNT_INTRO =
  '邮箱与短信是同一 Harness 账号的两种登录方式。请先用一种方式登录，再在设置 → 账号中绑定另一种；之后任选其一即可进入同一会话与数据。';

/** 设置 → 账号区说明 */
export const ACCOUNT_BINDING_INTRO =
  '绑定后，邮箱和短信均可登录本账号。请勿用同一邮箱、手机各登录一次，否则会形成两个独立账号；若已发生，请先用该方式登录原账号，再绑定另一种。';

export const LOGIN_SUCCESS_TOAST =
  '登录成功。可在设置 → 账号中绑定另一种登录方式，之后邮箱与短信均可登录本账号。';

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

export function formatAuthApiError(problem: ProblemDetails, context?: AuthErrorContext): string {
  if (problem.code === AUTH_ERROR_CODES.identityAlreadyBound) {
    if (context?.bindTarget === 'email') return BIND_CONFLICT_EMAIL;
    if (context?.bindTarget === 'phone') return BIND_CONFLICT_PHONE;
    return BIND_CONFLICT_GENERIC;
  }
  return problem.detail;
}
