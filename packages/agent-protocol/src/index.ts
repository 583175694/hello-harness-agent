import { z } from 'zod';
import { AGENT_PROTOCOL_LIMITS } from './common/constants.js';
export * from './common/problem.js';
export * from './common/status.js';
export * from './common/constants.js';
export * from './sessions/contracts.js';

// 标识当前前后端共享协议版本，协议发生不兼容变化时递增。
export const protocolVersion = '0.5.0';


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

// 约束模型上下文中四类消息及各自允许携带的字段。
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
  messages: z.array(chatMessageSchema).min(1).max(AGENT_PROTOCOL_LIMITS.chatHistoryMaxMessages),
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

// 定义后端当前支持的搜索供应商标识。
export const searchProviderSchema = z.enum(['bocha', 'serp']);

// 定义不同搜索供应商归一化后的网页线索。
export const searchResultSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  domain: z.string().min(1),
  snippet: z.string(),
  publishedAt: z.string().optional(),
  source: z.string().optional(),
});

// 定义 web_search 返回给模型和前端的统一结果。
export const searchToolResultSchema = z.object({
  query: z.string().min(1),
  provider: searchProviderSchema,
  results: z.array(searchResultSchema).max(AGENT_PROTOCOL_LIMITS.searchResultsMax),
});

// 定义 assistant metadata 中可恢复的工具执行摘要。
export const toolExecutionSnapshotSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.object({ query: z.string().min(1) }),
  status: z.enum(['completed', 'failed', 'cancelled']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  resultCount: z.number().int().nonnegative().optional(),
  error: z.object({ code: z.string().min(1), detail: z.string().min(1) }).optional(),
});

// 定义去重后保存的来源线索及其关联工具调用。
export const searchSourceSnapshotSchema = searchResultSchema.extend({
  provider: searchProviderSchema,
  retrievedAt: z.string().datetime(),
  toolCallIds: z.array(z.string().min(1)).min(1),
});

// 定义 assistant turn 中连续流式 Markdown 文本块。
export const assistantTextBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('text'),
  content: z.string().min(1),
});

// 定义 assistant turn 中可原位更新的透明工具活动块。
export const assistantToolActivityBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('tool_activity'),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']),
  title: z.string().min(1),
  summary: z.string().min(1).optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});

// 约束文本和工具活动按真实发生顺序组成 assistant 内容时间线。
export const assistantContentBlockSchema = z.discriminatedUnion('type', [
  assistantTextBlockSchema,
  assistantToolActivityBlockSchema,
]);

// 定义 assistant 消息携带的轻量 Agent 与 Workbench 快照。
export const assistantAgentMetadataSchema = z.object({
  model: z.string().min(1),
  blocks: z
    .array(assistantContentBlockSchema)
    .max(AGENT_PROTOCOL_LIMITS.assistantContentBlocksMax)
    .optional(),
  agent: z.object({
    toolCallCount: z.number().int().nonnegative().max(AGENT_PROTOCOL_LIMITS.agentToolMaxCalls),
    executions: z.array(toolExecutionSnapshotSchema).max(AGENT_PROTOCOL_LIMITS.agentToolMaxCalls),
    sources: z.array(searchSourceSnapshotSchema),
  }).optional(),
});

// 定义 Web SSE 客户端消费的标准增量事件。
export const chatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tool.started'),
    messageId: z.string().min(1),
    blockId: z.string().min(1),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    title: z.string().min(1),
    input: z.object({ query: z.string().min(1) }),
    startedAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('tool.completed'),
    messageId: z.string().min(1),
    blockId: z.string().min(1),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    completedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative(),
    result: searchToolResultSchema,
  }),
  z.object({
    type: z.literal('tool.failed'),
    messageId: z.string().min(1),
    blockId: z.string().min(1),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    completedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative(),
    code: z.string().min(1),
    detail: z.string().min(1),
  }),
  z.object({
    type: z.literal('tool.cancelled'),
    messageId: z.string().min(1),
    blockId: z.string().min(1),
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
    blockId: z.string().min(1),
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
export type AssistantTextBlock = z.infer<typeof assistantTextBlockSchema>;
export type AssistantToolActivityBlock = z.infer<typeof assistantToolActivityBlockSchema>;
export type AssistantContentBlock = z.infer<typeof assistantContentBlockSchema>;
