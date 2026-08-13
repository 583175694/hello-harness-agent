import { z } from 'zod';
import { AGENT_PROTOCOL_LIMITS } from './common/constants.js';
export * from './common/problem.js';
export * from './common/status.js';
export * from './common/constants.js';
export * from './common/source-url.js';
export * from './sessions/contracts.js';
export * from './web-fetch/contracts.js';
import {
  webFetchInputSchema,
  webFetchPassageSchema,
  webFetchResultSchema,
  webFetchStatsSchema,
} from './web-fetch/contracts.js';

// 标识当前前后端共享协议版本，协议发生不兼容变化时递增。
export const protocolVersion = '0.10.0';

export const reasoningEffortSchema = z.enum(['off', 'low', 'high', 'max']);
export const reasoningCapabilitySchema = z.object({
  supported: z.boolean(),
  levels: z.array(reasoningEffortSchema),
  default: reasoningEffortSchema,
});
export const modelRunProfileSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  reasoningEffort: reasoningEffortSchema,
  reasoningFormat: z.string().min(1).optional(),
});
export const publicModelConfigSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  reasoning: reasoningCapabilitySchema,
});
export const publicAgentConfigSchema = z.object({
  defaultModel: z.string().min(1),
  models: z.array(publicModelConfigSchema).min(1),
});

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
    reasoning: z.string().optional(),
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
  tools: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1).optional(),
        parameters: z.record(z.unknown()),
      }),
    )
    .max(32)
    .optional(),
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
const toolExecutionBaseSchema = z.object({
  toolCallId: z.string().min(1),
  status: z.enum(['completed', 'failed', 'cancelled']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  resultCount: z.number().int().nonnegative().optional(),
  succeededCount: z.number().int().nonnegative().optional(),
  failedCount: z.number().int().nonnegative().optional(),
  skippedCount: z.number().int().nonnegative().optional(),
  passageCount: z.number().int().nonnegative().optional(),
  networkAttemptCount: z.number().int().nonnegative().optional(),
  error: z
    .object({
      code: z.string().min(1),
      detail: z.string().min(1),
      retryable: z.boolean().optional(),
    })
    .optional(),
});

// 根据工具名约束可持久化的执行输入，防止搜索和读取参数混淆。
export const toolExecutionSnapshotSchema = z.discriminatedUnion('toolName', [
  toolExecutionBaseSchema.extend({
    toolName: z.literal('web_search'),
    input: z.object({ query: z.string().min(1) }),
  }),
  toolExecutionBaseSchema.extend({
    toolName: z.literal('web_fetch'),
    input: webFetchInputSchema,
    stats: webFetchStatsSchema.optional(),
  }),
]);

// 标识来源 URL 在当前 assistant run 中如何进入模型规划范围。
export const sourceProvenanceSchema = z.enum([
  'user_provided',
  'search_clue',
  'model_proposed',
  'unknown',
]);

// 定义去重后保存的来源线索及其关联工具调用。
export const searchSourceSnapshotSchema = searchResultSchema.extend({
  kind: z.literal('clue').default('clue'),
  used: z.boolean(),
  provider: searchProviderSchema,
  provenance: sourceProvenanceSchema.default('search_clue'),
  retrievedAt: z.string().datetime(),
  toolCallIds: z.array(z.string().min(1)).min(1),
});

// 定义 assistant metadata 中可恢复的已读网页。
export const webFetchSourceSnapshotSchema = z.object({
  kind: z.literal('fetched'),
  used: z.boolean(),
  provenance: sourceProvenanceSchema.default('unknown'),
  id: z.string().min(1),
  requestedUrl: z.string().url(),
  finalUrl: z.string().url(),
  normalizedUrl: z.string().url(),
  title: z.string().min(1),
  author: z.string().min(1).optional(),
  publishedAt: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  contentType: z.string().min(1),
  retrievedAt: z.string().datetime(),
  contentHash: z.string().min(1),
  cacheStatus: z.enum(['hit', 'miss']),
  truncated: z.boolean(),
  passages: z.array(webFetchPassageSchema).max(AGENT_PROTOCOL_LIMITS.webFetchPassagesMax),
  toolCallIds: z.array(z.string().min(1)).min(1),
});

// 定义调研 Workbench 可以恢复的线索和已读网页联合。
export const researchSourceSnapshotSchema = z.union([
  searchSourceSnapshotSchema,
  webFetchSourceSnapshotSchema,
]);

// 定义 assistant turn 中连续流式 Markdown 文本块。
// roundSequence + blockSequence 是业务展示顺序，不等同于 SSE event seq。
export const assistantTextBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('text'),
  roundId: z.string().min(1).optional(),
  roundSequence: z.number().int().positive().optional(),
  blockSequence: z.number().int().nonnegative().optional(),
  content: z.string().min(1),
});

export const assistantReasoningBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('reasoning'),
  roundId: z.string().min(1),
  roundSequence: z.number().int().positive(),
  blockSequence: z.number().int().nonnegative(),
  content: z.string().min(1),
});

// 定义 assistant turn 中可原位更新的透明工具活动块。
export const assistantToolActivityBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('tool_activity'),
  roundId: z.string().min(1).optional(),
  roundSequence: z.number().int().positive().optional(),
  blockSequence: z.number().int().nonnegative().optional(),
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
  assistantReasoningBlockSchema,
  assistantToolActivityBlockSchema,
]);

// 定义 assistant 消息携带的轻量 Agent 与 Workbench 快照。
export const assistantAgentMetadataSchema = z.object({
  model: z.string().min(1),
  deliveryStatus: z.enum(['streaming', 'completed', 'failed', 'cancelled']).optional(),
  runId: z.string().min(1).optional(),
  draftVersion: z.number().int().nonnegative().optional(),
  lastEventSequence: z.number().int().nonnegative().optional(),
  blocks: z
    .array(assistantContentBlockSchema)
    .max(AGENT_PROTOCOL_LIMITS.assistantContentBlocksMax)
    .optional(),
  agent: z
    .object({
      toolCallCount: z.number().int().nonnegative().max(AGENT_PROTOCOL_LIMITS.agentToolMaxCalls),
      executions: z.array(toolExecutionSnapshotSchema).max(AGENT_PROTOCOL_LIMITS.agentToolMaxCalls),
      sources: z.array(researchSourceSnapshotSchema),
    })
    .optional(),
});

// 定义 Web SSE 客户端消费的标准增量事件；Round/Block 字段让实时、重放和历史恢复同序。
const toolStartedEventSchema = z.discriminatedUnion('toolName', [
  z.object({
    type: z.literal('tool.started'),
    messageId: z.string().min(1),
    blockId: z.string().min(1),
    roundId: z.string().min(1),
    roundSequence: z.number().int().positive(),
    blockSequence: z.number().int().nonnegative(),
    toolCallId: z.string().min(1),
    toolName: z.literal('web_search'),
    title: z.string().min(1),
    input: z.object({ query: z.string().min(1) }),
    startedAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('tool.started'),
    messageId: z.string().min(1),
    blockId: z.string().min(1),
    roundId: z.string().min(1),
    roundSequence: z.number().int().positive(),
    blockSequence: z.number().int().nonnegative(),
    toolCallId: z.string().min(1),
    toolName: z.literal('web_fetch'),
    title: z.string().min(1),
    input: webFetchInputSchema,
    startedAt: z.string().datetime(),
  }),
]);

const toolCompletedEventSchema = z.discriminatedUnion('toolName', [
  z.object({
    type: z.literal('tool.completed'),
    messageId: z.string().min(1),
    blockId: z.string().min(1),
    roundId: z.string().min(1),
    roundSequence: z.number().int().positive(),
    blockSequence: z.number().int().nonnegative(),
    toolCallId: z.string().min(1),
    toolName: z.literal('web_search'),
    completedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative(),
    result: searchToolResultSchema,
  }),
  z.object({
    type: z.literal('tool.completed'),
    messageId: z.string().min(1),
    blockId: z.string().min(1),
    roundId: z.string().min(1),
    roundSequence: z.number().int().positive(),
    blockSequence: z.number().int().nonnegative(),
    toolCallId: z.string().min(1),
    toolName: z.literal('web_fetch'),
    completedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative(),
    result: webFetchResultSchema,
  }),
]);

// 定义 Web SSE 客户端消费的标准增量事件。
export const chatStreamEventSchema = z.union([
  toolStartedEventSchema,
  toolCompletedEventSchema,
  z.object({
    type: z.literal('tool.failed'),
    messageId: z.string().min(1),
    blockId: z.string().min(1),
    roundId: z.string().min(1),
    roundSequence: z.number().int().positive(),
    blockSequence: z.number().int().nonnegative(),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    completedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative(),
    code: z.string().min(1),
    detail: z.string().min(1),
    retryable: z.boolean(),
  }),
  z.object({
    type: z.literal('tool.cancelled'),
    messageId: z.string().min(1),
    blockId: z.string().min(1),
    roundId: z.string().min(1),
    roundSequence: z.number().int().positive(),
    blockSequence: z.number().int().nonnegative(),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    completedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative(),
    code: z.string().min(1),
    detail: z.string().min(1),
  }),
  z.object({
    type: z.literal('reasoning.delta'),
    messageId: z.string().min(1),
    blockId: z.string().min(1),
    roundId: z.string().min(1),
    roundSequence: z.number().int().positive(),
    blockSequence: z.number().int().nonnegative(),
    delta: z.string().min(1),
  }),
  z.object({
    type: z.literal('message.delta'),
    messageId: z.string().min(1),
    blockId: z.string().min(1),
    roundId: z.string().min(1),
    roundSequence: z.number().int().positive(),
    blockSequence: z.number().int().nonnegative(),
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

export const agentRunStatusSchema = z.enum([
  'queued',
  'running',
  'cancel_requested',
  'completed',
  'failed',
  'cancelled',
]);
export const assistantDeliveryStatusSchema = z.enum([
  'streaming',
  'completed',
  'failed',
  'cancelled',
]);
export const createRunRequestSchema = z.object({
  content: z.string().trim().min(1).max(AGENT_PROTOCOL_LIMITS.sessionChatContentMaxLength),
  idempotencyKey: z.string().min(1).max(200),
  model: z.string().min(1),
  reasoningEffort: reasoningEffortSchema.optional().default('high'),
});
export const createRunResponseSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  status: agentRunStatusSchema,
  eventsUrl: z.string().min(1),
});
export const runSnapshotSchema = z.object({
  runId: z.string().min(1),
  sessionId: z.string().min(1),
  status: agentRunStatusSchema,
  profile: modelRunProfileSchema,
  assistantMessageId: z.string().min(1),
  assistantContent: z.string(),
  blocks: z.array(assistantContentBlockSchema),
  executions: z.array(toolExecutionSnapshotSchema),
  sources: z.array(researchSourceSnapshotSchema),
  toolCallCount: z.number().int().nonnegative(),
  lastEventSequence: z.number().int().nonnegative(),
  error: z.object({ code: z.string().min(1), detail: z.string().min(1) }).optional(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
});
export const runEventPayloadSchema = z.union([
  chatStreamEventSchema,
  runSnapshotSchema,
  z.object({ status: agentRunStatusSchema }),
  z.object({ code: z.string().min(1), detail: z.string().min(1) }),
]);
// RunStreamEvent.seq 只负责传输去重、gap detection 与 Checkpoint 水位；
// Snapshot Event 使用所携 Snapshot 的水位，不代表又发生了一次新的业务变化。
export const runStreamEventSchema = z.object({
  version: z.literal(protocolVersion),
  eventId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  type: z.enum([
    'run.snapshot',
    'run.started',
    'reasoning.delta',
    'message.delta',
    'tool.started',
    'tool.completed',
    'tool.failed',
    'tool.cancelled',
    'run.cancel_requested',
    'run.completed',
    'run.failed',
    'run.cancelled',
  ]),
  occurredAt: z.string().datetime(),
  payload: runEventPayloadSchema,
});
export const cancelRunResponseSchema = z.object({
  runId: z.string().min(1),
  status: z.enum(['cancel_requested', 'cancelled', 'completed', 'failed']),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>;
export type ReasoningCapability = z.infer<typeof reasoningCapabilitySchema>;
export type ModelRunProfile = z.infer<typeof modelRunProfileSchema>;
export type PublicAgentConfig = z.infer<typeof publicAgentConfigSchema>;
export type PublicModelConfig = z.infer<typeof publicModelConfigSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ToolCall = z.infer<typeof toolCallSchema>;
export type ToolResult = z.infer<typeof toolResultSchema>;
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
export type SearchProvider = z.infer<typeof searchProviderSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchToolResult = z.infer<typeof searchToolResultSchema>;
export type ToolExecutionSnapshot = z.infer<typeof toolExecutionSnapshotSchema>;
export type SourceProvenance = z.infer<typeof sourceProvenanceSchema>;
export type SearchSourceSnapshot = z.infer<typeof searchSourceSnapshotSchema>;
export type WebFetchSourceSnapshot = z.infer<typeof webFetchSourceSnapshotSchema>;
export type ResearchSourceSnapshot = z.infer<typeof researchSourceSnapshotSchema>;
export type AssistantAgentMetadata = z.infer<typeof assistantAgentMetadataSchema>;
export type AssistantTextBlock = z.infer<typeof assistantTextBlockSchema>;
export type AssistantReasoningBlock = z.infer<typeof assistantReasoningBlockSchema>;
export type AssistantToolActivityBlock = z.infer<typeof assistantToolActivityBlockSchema>;
export type AssistantContentBlock = z.infer<typeof assistantContentBlockSchema>;
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
export type AssistantDeliveryStatus = z.infer<typeof assistantDeliveryStatusSchema>;
export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;
export type CreateRunResponse = z.infer<typeof createRunResponseSchema>;
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;
export type RunStreamEvent = z.infer<typeof runStreamEventSchema>;
export type CancelRunResponse = z.infer<typeof cancelRunResponseSchema>;
