import { z } from 'zod';

export const protocolVersion = '0.1.0';

export const serviceStatusSchema = z.object({
  status: z.enum(['ok', 'not_ready']),
  service: z.string().min(1),
  version: z.string().min(1),
  checks: z.record(z.enum(['ok', 'error'])).optional(),
});

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export const problemDetailsSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  code: z.string().min(1),
  detail: z.string().min(1),
  instance: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
