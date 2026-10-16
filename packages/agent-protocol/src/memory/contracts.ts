import { z } from 'zod';

export const MEMORY_KIND_VALUES = [
  'preference',
  'workflow',
  'format',
  'correction',
  'identity_context',
] as const;

export const memoryWriteInputSummarySchema = z
  .object({
    action: z.enum(['create', 'update', 'delete']),
    memoryId: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    kind: z.enum(MEMORY_KIND_VALUES).optional(),
    storageIntent: z.enum(['explicit', 'inferred']).optional(),
    confidence: z.enum(['low', 'medium', 'high']).optional(),
  })
  .strict();

export const memoryWriteResultSchema = z.object({
  ok: z.boolean(),
  action: z.enum(['create', 'update', 'delete']),
  memoryId: z.string().min(1).optional(),
  status: z.enum(['active', 'candidate', 'rejected', 'expired']),
  reason: z.string().optional(),
  indexingStatus: z.enum(['ready', 'pending', 'failed']).optional(),
});

export function formatMemoryWriteInputSummary(
  input: z.infer<typeof memoryWriteInputSummarySchema>,
): string {
  if (input.action === 'delete') {
    const id = input.memoryId?.trim();
    return id ? `删除记忆 ${id.slice(0, 8)}` : '删除记忆';
  }
  if (input.action === 'update') return input.title?.trim() || '更新记忆';
  return input.title?.trim() || '写入记忆';
}

export function formatMemoryWriteResultSummary(
  result: z.infer<typeof memoryWriteResultSchema>,
): string {
  if (!result.ok) {
    if (result.reason === 'memory_write_disabled') return '记忆写入未开启';
    if (result.reason) return `未写入：${result.reason}`;
    return '记忆未写入';
  }
  if (result.action === 'delete') return '记忆已删除';
  if (result.status === 'candidate') return '已保存为候选记忆';
  if (result.indexingStatus === 'pending') return '记忆已保存，向量索引排队中';
  if (result.indexingStatus === 'failed') return '记忆已保存，向量索引失败';
  return result.action === 'update' ? '记忆已更新' : '记忆已保存';
}
