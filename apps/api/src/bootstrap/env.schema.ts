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
    EVAL_FIXTURE_ROOT: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    DEEPSEEK_TOKENIZER_ROOT: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    DEEPSEEK_CONTEXT_WINDOW_TOKENS: z.coerce.number().int().positive().optional(),
    DEEPSEEK_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
    DEEPSEEK_MODEL_PROFILE_SOURCE: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    DEEPSEEK_MODEL_PROFILE_VERIFIED: z
      .preprocess(
        (value) =>
          value === true || value === 'true'
            ? true
            : value === false || value === 'false'
              ? false
              : value,
        z.boolean(),
      )
      .default(false),
  })
  .superRefine((value, context) => {
    if (value.EVAL_FIXTURE_ROOT && value.NODE_ENV !== 'test')
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EVAL_FIXTURE_ROOT'],
        message: 'only allowed when NODE_ENV=test',
      });
    if (
      value.DEEPSEEK_MODEL_PROFILE_VERIFIED &&
      (!value.DEEPSEEK_CONTEXT_WINDOW_TOKENS ||
        !value.DEEPSEEK_MAX_OUTPUT_TOKENS ||
        !value.DEEPSEEK_MODEL_PROFILE_SOURCE)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEEPSEEK_MODEL_PROFILE_VERIFIED'],
        message:
          'verified profile requires context window, max output tokens, and an authoritative source',
      });
  });

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
