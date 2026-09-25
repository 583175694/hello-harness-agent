import { z } from 'zod';
import { ENV_DEFAULTS } from './env.constants';

// 集中定义 API 进程允许读取的环境变量、默认值和格式约束。
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().min(1).default(ENV_DEFAULTS.apiHost),
    API_PORT: z.coerce.number().int().min(1024).max(65535).default(ENV_DEFAULTS.apiPort),
    WEB_ORIGIN: z.string().url().default(ENV_DEFAULTS.webOrigin),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: z.string().min(1),
    ARTIFACT_ROOT: z.string().min(1).default(ENV_DEFAULTS.artifactRoot),
    OPENAI_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    BAILIAN_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    SEARCH_PROVIDER: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['bocha', 'serp']).optional(),
    ),
    BOCHA_SEARCH_URL: z.string().url().default(ENV_DEFAULTS.bochaSearchUrl),
    BOCHA_SEARCH_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    SERPER_SEARCH_URL: z.string().url().default(ENV_DEFAULTS.serperSearchUrl),
    SERPER_SEARCH_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    COS_SECRET_ID: z.string().min(1).optional(),
    COS_SECRET_KEY: z.string().min(1).optional(),
    COS_BUCKET: z.string().min(1).optional(),
    COS_REGION: z.string().min(1).optional(),
    SANDBOX_ENABLED: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
    SANDBOX_DOMAIN: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
    SANDBOX_API_KEY: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
    SANDBOX_IMAGE: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
    SANDBOX_TTL_MS: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
    HARNESS_SECRETS_MASTER_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    AUTH_MODE: z.enum(['required', 'local']).optional(),
    AUTH_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    AUTH_COOKIE_NAME: z.string().min(1).default('harness_session'),
    AUTH_CODE_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
    AUTH_SEND_CODE_MIN_INTERVAL_SEC: z.coerce.number().int().min(10).max(600).default(60),
    AUTH_BOOTSTRAP_ADMIN_EMAIL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().email().optional(),
    ),
    AUTH_BOOTSTRAP_ADMIN_PHONE: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(8).optional(),
    ),
    SMTP_HOST: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_USER: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
    SMTP_PASS: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
    SMTP_FROM: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
    ALIYUN_SMS_AUTH_ACCESS_KEY_ID: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().optional(),
    ),
    ALIYUN_SMS_AUTH_ACCESS_KEY_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().optional(),
    ),
    ALIYUN_SMS_AUTH_SIGN_NAME: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().optional(),
    ),
    ALIYUN_SMS_AUTH_TEMPLATE_CODE: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().optional(),
    ),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== 'production') return;
    for (const key of ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_BUCKET', 'COS_REGION'] as const) {
      if (!value[key])
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: '生产环境必须配置 COS。',
        });
    }
    const authMode = value.AUTH_MODE ?? 'required';
    if (authMode === 'local')
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_MODE'],
        message: '生产环境 AUTH_MODE 必须为 required。',
      });
  })
  .transform((value) => ({
    ...value,
    AUTH_MODE:
      value.AUTH_MODE ??
      (value.NODE_ENV === 'development' || value.NODE_ENV === 'test' ? 'local' : 'required'),
  }));

export type AppEnvironment = z.infer<typeof envSchema>;

// 校验进程配置并应用本地开发默认值。
export function validateEnvironment(input: Record<string, unknown>): AppEnvironment {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return result.data;
}
