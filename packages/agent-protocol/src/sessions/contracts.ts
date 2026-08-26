import { z } from 'zod';
import { AGENT_PROTOCOL_LIMITS } from '../common/constants.js';

const sessionPendingUserInputViewSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['follow_up', 'steer']),
  status: z.enum(['pending', 'consumed', 'rejected', 'cancelled']),
  content: z.string(),
  sequence: z.number().int().positive(),
});

// 定义数据库持久化后可由前端恢复的普通对话消息。
export const persistedMessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  kind: z.enum(['user_message', 'assistant_delivery']),
  content: z.string(),
  runId: z.string().min(1).optional(),
  deliveryStatus: z.enum(['streaming', 'completed', 'failed', 'cancelled']).optional(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.unknown()),
});

// 定义侧栏展示所需的稳定会话摘要。
export const sessionSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength),
  status: z.literal('active'),
  isPinned: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// 定义会话详情及其按时间排序的持久化消息。
export const sessionDetailSchema = sessionSummarySchema.extend({
  messages: z.array(persistedMessageSchema),
  pendingUserInputs: z.array(sessionPendingUserInputViewSchema).default([]),
  activeRun: z
    .object({
      runId: z.string().min(1),
      assistantMessageId: z.string().min(1),
      status: z.enum(['queued', 'running', 'cancel_requested']),
      lastEventSequence: z.number().int().nonnegative(),
    })
    .nullable()
    .default(null),
});

// 定义创建会话时提交的标题请求。
export const createSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength),
});

// 定义创建会话接口的响应结构。
export const createSessionResponseSchema = z.object({ session: sessionSummarySchema });

// 定义会话列表接口的响应结构。
export const listSessionsResponseSchema = z.object({ sessions: z.array(sessionSummarySchema) });

// 定义会话详情接口的响应结构。
export const sessionDetailResponseSchema = z.object({ session: sessionDetailSchema });

// 定义删除会话接口的响应结构。
export const deleteSessionResponseSchema = z.object({ deletedSessionId: z.string().min(1) });

// 定义会话名称和置顶状态的局部更新请求。
export const updateSessionRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength).optional(),
    isPinned: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.isPinned !== undefined, {
    message: '至少提供一个可更新字段。',
  });

// 定义会话更新接口的响应结构。
export const updateSessionResponseSchema = z.object({ session: sessionSummarySchema });

// 定义会话级聊天流只提交本轮内容的请求。
// 定义标题生成接口的空请求体，保留后续扩展空间。
export const generateSessionTitleRequestSchema = z.object({}).strict();

// 定义标题生成接口的响应结构。
export const generateSessionTitleResponseSchema = z.object({
  session: sessionSummarySchema,
  generated: z.boolean(),
});

export type PersistedMessage = z.infer<typeof persistedMessageSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SessionDetail = z.infer<typeof sessionDetailSchema>;
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;
export type ListSessionsResponse = z.infer<typeof listSessionsResponseSchema>;
export type SessionDetailResponse = z.infer<typeof sessionDetailResponseSchema>;
export type DeleteSessionResponse = z.infer<typeof deleteSessionResponseSchema>;
export type UpdateSessionRequest = z.infer<typeof updateSessionRequestSchema>;
export type UpdateSessionResponse = z.infer<typeof updateSessionResponseSchema>;
export type GenerateSessionTitleRequest = z.infer<typeof generateSessionTitleRequestSchema>;
export type GenerateSessionTitleResponse = z.infer<typeof generateSessionTitleResponseSchema>;
