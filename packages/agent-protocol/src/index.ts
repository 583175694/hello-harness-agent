import { z } from 'zod';

export const protocolVersion = '0.4.0';

// 定义进程健康和依赖就绪响应。
export const serviceStatusSchema = z.object({
  status: z.enum(['ok', 'not_ready']),
  service: z.string().min(1),
  version: z.string().min(1),
  checks: z.record(z.enum(['ok', 'error'])).optional(),
});

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

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

// 定义聊天和未来工具循环共用的消息基础字段。
const messageBaseSchema = z.object({
  id: z.string().min(1).optional(),
  content: z.string().optional(),
  createdAt: z.string().datetime().optional(),
});

// 定义供应商适配层输出的标准化函数调用。
export const toolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.record(z.unknown()),
});

// 定义应用工具执行器返回的标准化结果。
export const toolResultSchema = z.object({
  toolCallId: z.string().min(1),
  content: z.string(),
  isError: z.boolean().default(false),
});

export const chatMessageSchema = z.discriminatedUnion('role', [
  messageBaseSchema.extend({ role: z.literal('user'), content: z.string().min(1) }),
  messageBaseSchema.extend({
    role: z.literal('assistant'),
    content: z.string().optional(),
    toolCalls: z.array(toolCallSchema).optional(),
  }),
  messageBaseSchema.extend({
    role: z.literal('system'),
    content: z.string().min(1),
  }),
  messageBaseSchema.extend({
    role: z.literal('tool'),
    content: z.string(),
    toolCallId: z.string().min(1),
  }),
]);

// 定义当前聊天接口和未来工具调用共用的请求封装。
export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(40),
  sessionId: z.string().min(1).optional(),
  tools: z.array(z.object({
    name: z.string().min(1),
    description: z.string().min(1).optional(),
    parameters: z.record(z.unknown()),
  })).max(32).optional(),
});

// 定义非流式 assistant 响应。
export const chatResponseSchema = z.object({
  message: messageBaseSchema.extend({
    role: z.literal('assistant'),
    content: z.string().min(1),
    toolCalls: z.array(toolCallSchema).optional(),
  }),
  model: z.string().min(1),
});

export const searchProviderSchema = z.enum(['bocha', 'serp']);

export const searchResultSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  domain: z.string().min(1),
  snippet: z.string(),
  publishedAt: z.string().optional(),
  source: z.string().optional(),
});

export const searchToolResultSchema = z.object({
  query: z.string().min(1),
  provider: searchProviderSchema,
  results: z.array(searchResultSchema).max(10),
});

export const toolExecutionSnapshotSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.object({ query: z.string().min(1) }),
  status: z.enum(['completed', 'failed']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  resultCount: z.number().int().nonnegative().optional(),
  error: z.object({ code: z.string().min(1), detail: z.string().min(1) }).optional(),
});

export const searchSourceSnapshotSchema = searchResultSchema.extend({
  provider: searchProviderSchema,
  retrievedAt: z.string().datetime(),
  toolCallIds: z.array(z.string().min(1)).min(1),
});

export const assistantAgentMetadataSchema = z.object({
  model: z.string().min(1),
  agent: z.object({
    toolCallCount: z.number().int().nonnegative().max(20),
    executions: z.array(toolExecutionSnapshotSchema).max(20),
    sources: z.array(searchSourceSnapshotSchema),
  }).optional(),
});

// 定义 Web SSE 客户端消费的标准增量事件。
export const chatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tool.started'),
    messageId: z.string().min(1),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    input: z.object({ query: z.string().min(1) }),
    startedAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('tool.completed'),
    messageId: z.string().min(1),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    completedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative(),
    result: searchToolResultSchema,
  }),
  z.object({
    type: z.literal('tool.failed'),
    messageId: z.string().min(1),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    completedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative(),
    code: z.string().min(1),
    detail: z.string().min(1),
  }),
  z.object({
    type: z.literal('message.delta'),
    messageId: z.string().min(1),
    delta: z.string().min(1),
  }),
  z.object({
    type: z.literal('message.completed'),
    messageId: z.string().min(1),
    model: z.string().min(1),
  }),
  z.object({
    type: z.literal('stream.failed'),
    code: z.string().min(1),
    detail: z.string().min(1),
  }),
]);

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ToolCall = z.infer<typeof toolCallSchema>;
export type ToolResult = z.infer<typeof toolResultSchema>;
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
export type SearchProvider = z.infer<typeof searchProviderSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchToolResult = z.infer<typeof searchToolResultSchema>;
export type ToolExecutionSnapshot = z.infer<typeof toolExecutionSnapshotSchema>;
export type SearchSourceSnapshot = z.infer<typeof searchSourceSnapshotSchema>;
export type AssistantAgentMetadata = z.infer<typeof assistantAgentMetadataSchema>;

// 定义数据库持久化后可由前端恢复的普通对话消息。
export const persistedMessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  kind: z.enum(['user_message', 'assistant_delivery']),
  content: z.string().min(1),
  createdAt: z.string().datetime(),
  metadata: z.record(z.unknown()),
});

// 定义侧栏展示所需的稳定会话摘要。
export const sessionSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(28),
  status: z.literal('active'),
  isPinned: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// 定义会话详情及其按时间排序的持久化消息。
export const sessionDetailSchema = sessionSummarySchema.extend({
  messages: z.array(persistedMessageSchema),
});

// 定义首次发送前创建会话的请求。
export const createSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(28),
});

export const createSessionResponseSchema = z.object({ session: sessionSummarySchema });
export const listSessionsResponseSchema = z.object({ sessions: z.array(sessionSummarySchema) });
export const sessionDetailResponseSchema = z.object({ session: sessionDetailSchema });
export const deleteSessionResponseSchema = z.object({ deletedSessionId: z.string().min(1) });

// 定义重命名和置顶共用的局部会话更新请求。
export const updateSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(28).optional(),
  isPinned: z.boolean().optional(),
}).strict().refine((value) => value.title !== undefined || value.isPinned !== undefined, {
  message: '至少提供一个可更新字段。',
});
export const updateSessionResponseSchema = z.object({ session: sessionSummarySchema });

// 定义只提交本轮内容的会话级流式聊天请求。
export const sessionChatRequestSchema = z.object({ content: z.string().trim().min(1).max(100_000) });

// 定义模型标题生成的请求和结果，空请求体用于保持接口可演进。
export const generateSessionTitleRequestSchema = z.object({}).strict();
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
export type SessionChatRequest = z.infer<typeof sessionChatRequestSchema>;
export type GenerateSessionTitleRequest = z.infer<typeof generateSessionTitleRequestSchema>;
export type GenerateSessionTitleResponse = z.infer<typeof generateSessionTitleResponseSchema>;
