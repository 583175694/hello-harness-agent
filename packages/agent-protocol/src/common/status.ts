import { z } from 'zod';

// 定义进程健康和依赖就绪响应。
export const serviceStatusSchema = z.object({
  status: z.enum(['ok', 'not_ready']),
  service: z.string().min(1),
  version: z.string().min(1),
  checks: z.record(z.enum(['ok', 'error'])).optional(),
  evalFixtureHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional(),
});

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
