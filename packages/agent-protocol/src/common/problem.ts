import { z } from 'zod';

// 定义 HTTP 和流式失败共用的机器可读错误结构。
export const problemDetailsSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  code: z.string().min(1),
  detail: z.string().min(1),
  instance: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
