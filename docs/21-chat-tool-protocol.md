# 阶段一、阶段二协议

> 本文只定义纯对话和普通 Function Calling 的最小跨边界协议。它不是完整 Agent Run、Workbench 或事件存储协议。

## 1. 协议原则

```text
Protocol = 跨前后端共享的领域数据和 schema
SSE      = 事件传输方式
Provider = OpenAI-compatible 厂商格式
UI       = 协议数据的展示投影
```

Web/API 只依赖 `packages/agent-protocol` 的 schema，不直接共享 OpenAI SDK 类型。供应商字段在 API 适配层转换为本协议对象。

协议版本当前为 `0.3.0`。新增字段优先保持可选；改变字段语义或删除字段时升级协议版本。

## 2. 阶段一：纯对话协议

### 2.1 消息

所有模型消息都可以携带可选 `id` 和 `createdAt`。跨 HTTP 边界恢复时使用单独的 `PersistedMessage`，其 ID、时间和 sessionId 均为必填。

```ts
type ChatMessage =
  | { role: 'user'; content: string; id?: string; createdAt?: string }
  | { role: 'assistant'; content?: string; toolCalls?: ToolCall[]; id?: string; createdAt?: string }
  | { role: 'system'; content: string; id?: string; createdAt?: string }
  | { role: 'tool'; content: string; toolCallId: string; id?: string; createdAt?: string };
```

阶段一实际只使用 `user`、`assistant`，但从现在开始保留 `system`、`tool` 是为了让阶段二不需要重写消息联合类型。

### 2.2 持久化会话请求

```ts
type SessionChatRequest = { content: string };
```

当前接口：

```text
POST   /api/agent/sessions
GET    /api/agent/sessions
GET    /api/agent/sessions/:sessionId
DELETE /api/agent/sessions/:sessionId
POST   /api/agent/sessions/:sessionId/chat/stream
POST   /api/agent/sessions/:sessionId/title/generate
```

### 2.3 Chat SSE 事件

SSE 的每条 `data` 都是以下联合类型之一：

```ts
type ChatStreamEvent =
  | { type: 'message.delta'; messageId: string; delta: string }
  | { type: 'message.completed'; messageId: string; model: string }
  | { type: 'stream.failed'; code: string; detail: string };
```

`messageId` 用于把所有 delta 绑定到同一条 assistant 消息；完成事件中的 ID 是最终持久化 Message ID。客户端只提交本轮 content，API 从数据库读取最近 20 条 user/assistant 消息。当前仍没有 replay、sequence、断线重连和 cancel，这些属于阶段三 Agent Run 协议。

## 3. 阶段二：Function Calling 协议

阶段二只定义结构化调用，不定义工具执行器、权限模型或长任务调度器。

### 3.1 工具声明

```ts
type ToolDefinition = {
  name: string;
  description?: string;
  parameters: Record<string, unknown>; // JSON Schema object
};
```

### 3.2 Assistant 调用和 Tool 结果

```ts
type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

type ToolResult = {
  toolCallId: string;
  content: string;
  isError: boolean;
};
```

模型供应商通常把 arguments 返回为 JSON 字符串，API 适配层负责解析和校验后，才转换为 `Record<string, unknown>`；未经解析的供应商对象不直接传到 Web。

阶段二的最小循环是：

```text
messages + tools
  -> model
  -> assistant(toolCalls)
  -> application executes tool
  -> tool message
  -> model
  -> assistant(content)
```

这仍然可以在一次 HTTP 请求或一次 Chat SSE 内完成，不代表已经具备可恢复的 Agent Run。

## 4. 明确不属于本阶段

- `runId`、事件序号、断线 replay 和 Event Store
- steer/cancel 的竞态和持久化语义
- Workbench Activity、Sources、Report 的生产事件投影
- 工具权限、超时、重试、fallback 和并行调度
- Run 的 durable storage；Session/Message 已在阶段一实现
- Memory、Delegation、Worker

这些能力在阶段二之后以 Agent Run 协议单独演进，避免把普通对话协议提前膨胀成不可验证的“大一统协议”。
