# 阶段一、阶段二协议

> 本文记录纯对话和普通 Function Calling 的既有最小协议。Reasoning、完整 Tool transcript、跨轮回放和透明化增量按 `27-reasoning-context-transcript.md` 扩展；它不是完整 Agent Run、Workbench 或事件存储协议。

## 1. 协议原则

```text
Protocol = 跨前后端共享的领域数据和 schema
SSE      = 事件传输方式
Provider = OpenAI-compatible 厂商格式
UI       = 协议数据的展示投影
```

Web/API 只依赖 `packages/agent-protocol` 的 schema，不直接共享 OpenAI SDK 类型。供应商字段在 API 适配层转换为本协议对象。

协议版本当前为 `0.5.0`。新增字段优先保持可选；改变字段语义或删除字段时升级协议版本。

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
  | {
      type: 'tool.started';
      messageId: string;
      blockId: string;
      toolCallId: string;
      toolName: string;
      title: string;
      input: { query: string };
      startedAt: string;
    }
  | {
      type: 'tool.completed';
      messageId: string;
      blockId: string;
      toolCallId: string;
      toolName: string;
      completedAt: string;
      durationMs: number;
      result: SearchToolResult;
    }
  | {
      type: 'tool.failed';
      messageId: string;
      blockId: string;
      toolCallId: string;
      toolName: string;
      completedAt: string;
      durationMs: number;
      code: string;
      detail: string;
    }
  | {
      type: 'tool.cancelled';
      messageId: string;
      blockId: string;
      toolCallId: string;
      toolName: string;
      completedAt: string;
      durationMs: number;
      code: string;
      detail: string;
    }
  | {
      type: 'reasoning.delta';
      messageId: string;
      blockId: string;
      delta: string;
      roundId: string;
      roundSequence: number;
      blockSequence: number;
    }
  | { type: 'message.delta'; messageId: string; blockId: string; delta: string }
  | { type: 'message.completed'; messageId: string; model: string }
  | { type: 'stream.failed'; code: string; detail: string };
```

`messageId` 把本轮所有事件绑定到同一条 assistant 消息；`blockId` 标识其中一个稳定内容块。reasoning/text 增量到达 API 后立即向 SSE 写出，不等待当前模型轮次结束；两者使用不同 block。工具事件插入一个 tool activity block，完成、失败或取消事件通过 `toolCallId/blockId` 原位更新，不追加重复活动。`tool.started.title` 是后端确定的用户可见名称，保证实时展示和刷新恢复一致。完成事件中的 Message ID 是最终持久化 ID。

### 2.4 Assistant 有序内容块

Conversation 的展示与恢复事实是按真实发生顺序保存的内容块：

```ts
type AssistantContentBlock =
  | { id: string; type: 'text'; content: string }
  | { id: string; type: 'reasoning'; content: string }
  | {
      id: string;
      type: 'tool_activity';
      toolCallId: string;
      toolName: string;
      status: 'running' | 'completed' | 'failed' | 'cancelled';
      title: string;
      summary?: string;
      startedAt: string;
      completedAt?: string;
      durationMs?: number;
    };
```

成功完成的 assistant turn 将 `blocks` 保存到 Message metadata，顺序可以是 `reasoning → tool_activity → reasoning → text`。兼容字段 `Message.content` 仍只由所有 text blocks 顺序拼接生成；reasoning 不混入最终正文，工具 UI 标题、状态或摘要也不注入模型。下一轮模型上下文改由 durable canonical transcript 恢复，不能从这些 UI blocks 反向重建。

客户端只提交本轮 content。现行代码仍从数据库截取最近 20 条 user/assistant 最终正文；Reasoning Context Transcript 实施后，该逻辑将替换为完整 transcript 回放，主动选择和压缩留给后续 Context Engineering。

## 3. 阶段二：Function Calling 协议

阶段二已实现结构化调用、最小工具执行器和 Chat 请求内的循环，但不包含权限模型、长任务调度器或 durable Run。

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
  -> assistant(reasoning + toolCalls)
  -> application executes tool
  -> tool message
  -> model
  -> assistant(reasoning + content)
```

这仍然可以在一次 HTTP 请求或一次 Chat SSE 内完成，不代表已经具备可恢复的 Agent Run。

当前实现的 `web_search` 固定只接收 `query`，后端一次只启用 Bocha 或 Serper。每次搜索最多返回 10 条标准化结果，每个 assistant run 最多执行 20 次模型声明的 Function Tool Call；成功、失败、超时和参数校验失败都占用一次调用。工具事件用最终 assistant `messageId` 关联；最终 Message metadata 保存 Activity/Sources 轻量快照，但不等同于 canonical model transcript 或 Event Store。

阶段二已经实现以下模型可见工具契约：

```ts
type WebFetchInput = {
  urls: string[];
  query?: string;
};
```

`urls` 接受 1-5 个地址，结果按 URL 使用部分成功语义。`web_fetch` 通过 Crawlee `HttpCrawler` 批量获取原始响应，再由 JSDOM + Mozilla Readability + Turndown 生成规范化正文，并返回字符 n-gram 筛选的抽取式原文 passage。模型可以 Fetch 任意通过安全 Guard 的公开 URL，由 Projection 派生 provenance 和 canonical source。当前不增加 observation 或字符注入预算，Runtime 会把 Tool 的 canonical output/error 序列化后始终注入下一模型轮次。完整设计见 `23-web-fetch-tool.md` 和 `25-model-led-tool-boundary.md`。

## 4. 明确不属于本阶段

- `runId`、事件序号、断线 replay 和 Event Store
- steer/cancel 的竞态和持久化语义
- Report 的生产事件投影
- 工具权限、重试、fallback 和并行调度；当前仅有单次搜索超时
- Run 的 durable storage；Session/Message 已在阶段一实现
- Memory、Delegation、Worker

这些能力在阶段二之后以 Agent Run 协议单独演进，避免把普通对话协议提前膨胀成不可验证的“大一统协议”。
