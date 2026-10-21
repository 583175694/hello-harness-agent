// 规范化邮箱与手机号，保证唯一索引与验码 target 一致。
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 解析为大陆 11 位手机号（1 开头），不含国家码。无法解析时返回 undefined。 */
export function tryNormalizePhone(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, '');
  let mobile = digits;
  if (mobile.startsWith('86') && mobile.length === 13) mobile = mobile.slice(2);
  if (mobile.length === 11 && mobile.startsWith('1')) return mobile;
  return undefined;
}

/** 大陆手机号规范化；非法输入抛错（供服务端内部使用）。 */
export function normalizePhone(raw: string): string {
  const mobile = tryNormalizePhone(raw);
  if (!mobile) throw new Error('INVALID_CHINA_MOBILE');
  return mobile;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || !local) return email;
  const visible = local.length <= 2 ? local[0] ?? '*' : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

/** 脱敏展示：始终按 138****8000 格式，不展示 +86。 */
export function maskPhone(phone: string): string {
  const mobile = tryNormalizePhone(phone);
  if (!mobile) return phone;
  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
}
