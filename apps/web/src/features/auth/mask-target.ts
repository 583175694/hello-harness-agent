import type { AuthUserView } from '@harness/agent-protocol';

/** 登录页展示用掩码，与 API 脱敏规则一致。 */
export function maskEmailForDisplay(email: string): string {
  const normalized = email.trim().toLowerCase();
  const [local, domain] = normalized.split('@');
  if (!domain || !local) return email;
  const visible = local.length <= 2 ? (local[0] ?? '*') : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

export function maskPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const mobile =
    digits.startsWith('86') && digits.length === 13 ? digits.slice(2) : digits;
  if (mobile.length !== 11) return phone;
  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
}

export function authAccountShortLabel(user: AuthUserView): string {
  if (user.phone) return user.phone;
  if (user.email) return user.email;
  return user.displayName;
}
