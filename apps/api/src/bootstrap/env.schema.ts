import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(4318),
  WEB_ORIGIN: z.string().url().default('http://127.0.0.1:4317'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  ARTIFACT_ROOT: z.string().min(1).default('../../artifacts'),
  OPENAI_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  OPENAI_BASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
  ),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
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
