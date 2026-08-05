import { z } from 'zod';

export const protocolVersion = '0.2.0';

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

// 定义 Web SSE 客户端消费的标准增量事件。
export const chatStreamEventSchema = z.discriminatedUnion('type', [
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
