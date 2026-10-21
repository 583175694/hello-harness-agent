import { z } from 'zod';

export const AUTH_ERROR_CODES = {
  authRequired: 'AUTH_REQUIRED',
  authSuspended: 'AUTH_SUSPENDED',
  invalidCode: 'AUTH_INVALID_CODE',
  codeRateLimited: 'AUTH_CODE_RATE_LIMITED',
  identityAlreadyBound: 'IDENTITY_ALREADY_BOUND',
  forbidden: 'AUTH_FORBIDDEN',
} as const;

export const authUserViewSchema = z.object({
  id: z.string().min(1),
  displayName: z.string(),
  // API 返回脱敏后的邮箱（如 ab***@example.com），不是可投递地址。
  email: z.string().min(1).nullable(),
  phone: z.string().nullable(),
  role: z.enum(['user', 'admin']),
  status: z.enum(['active', 'suspended']),
});

export type AuthUserView = z.infer<typeof authUserViewSchema>;

export const authMeResponseSchema = z.object({
  user: authUserViewSchema,
});

export const authSendEmailCodeRequestSchema = z.object({
  email: z.string().trim().email(),
});

export const authVerifyEmailRequestSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().regex(/^\d{6}$/),
});

const chinaMobileInputSchema = z
  .string()
  .trim()
  .refine((value) => /^1\d{10}$/.test(value.replace(/\D/g, '').replace(/^86(?=\d{11}$)/, '')), {
    message: '请输入 11 位中国大陆手机号（无需 +86）。',
  })
  .transform((value) => {
    const digits = value.replace(/\D/g, '');
    const mobile = digits.startsWith('86') && digits.length === 13 ? digits.slice(2) : digits;
    return mobile;
  });

export const authSendPhoneCodeRequestSchema = z.object({
  phone: chinaMobileInputSchema,
});

export const authVerifyPhoneRequestSchema = z.object({
  phone: chinaMobileInputSchema,
  code: z.string().trim().regex(/^\d{6}$/),
});

export const authBindEmailRequestSchema = authVerifyEmailRequestSchema;
export const authBindPhoneRequestSchema = authVerifyPhoneRequestSchema;

export const authLoginResponseSchema = z.object({
  user: authUserViewSchema,
});
