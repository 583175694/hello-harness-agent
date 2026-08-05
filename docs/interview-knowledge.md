# 阶段面试知识点

> 文档用途：记录本项目已经真实实现过的工程知识点，作为面试复盘和项目讲解提纲。
>
> 维护原则：只记录当前代码已经验证的内容；没有真实难点时不强行包装。每完成一个阶段，再追加对应章节。
>
> 当前覆盖：P1 工程基线、OpenAI-compatible 模型适配、普通对话、Chat SSE、Workbench 状态边界。

## 1. 项目一句话介绍

这是一个基于 pnpm workspace 的本地单用户 Agent 工作台：前端使用 React/Vite，后端使用 NestJS，数据层使用 Prisma/PostgreSQL，当前已经先打通 OpenAI-compatible 普通对话和流式输出，后续再逐步接入 Session、Agent loop、搜索工具和可验证报告。

面试时需要主动区分：

```text
已经完成：普通对话、Chat SSE、Workbench UI fixture、工程基建
尚未完成：真实 Agent Runtime、搜索、持久化 Session/Run、Run Event SSE
```

## 2. 阶段一：工程基线

### 2.1 Monorepo 边界

使用 pnpm workspace 拆分：

```text
apps/web                 React/Vite 用户界面
apps/api                 NestJS HTTP API
packages/agent-protocol  跨前后端共享的 schema/type
packages/agent-testkit   确定性测试 fixture
```

可讲的知识点：

- 把跨边界协议放到独立 package，避免 Web 和 API 各自维护一份类型。
- NestJS 负责 transport、配置和依赖组装，业务 Runtime 不应该被 Controller 或 Prisma 类型反向侵入。
- 使用 Zod 同时做运行时校验和类型推导，避免只依赖 TypeScript 编译期类型。

### 2.2 配置和环境隔离

模型配置通过环境变量读取：

```text
OPENAI_BASE_URL
OPENAI_API_KEY
OPENAI_MODEL
```

其中 API Key 是可选的启动配置：服务可以启动，但没有 Key 时发送请求会返回明确的 `MODEL_NOT_CONFIGURED`，而不是让整个 API 在启动阶段崩溃。

这是一个适合面试展开的取舍：

- 启动阶段只校验结构和默认值。
- 真正需要模型能力的请求再检查 Key。
- 这样 health/readiness 和 UI 开发不依赖外部模型服务。

## 3. 阶段二：OpenAI-compatible 普通对话

### 3.1 为什么使用官方 SDK

后端使用 OpenAI 官方 Node SDK，但通过 `baseURL` 支持兼容 OpenAI 接口格式的供应商。模型 ID 不写死在代码里，由 `OPENAI_MODEL` 配置。

当前 API：

```text
POST /api/agent/chat
POST /api/agent/chat/stream
```

### 3.2 简单上下文拼接

当前还没有 durable Session/Message 表，所以上下文暂时由 Web 内存状态维护：

```text
Conversation UI
  -> 过滤 user / assistant 消息
  -> 排除 RunCard、Workbench 等 UI 状态
  -> 截取最近 20 条
  -> API 追加 system prompt
  -> 调用模型
```

这里的边界要说清楚：它是普通聊天阶段的临时方案，不等同于最终的 StateStore 或 Session 恢复方案。后续接入持久化时，应把这段逻辑替换为基于 Session/Run snapshot 的 Context Compiler。

### 3.3 错误边界

当前将错误分为：

- `MODEL_NOT_CONFIGURED`：没有配置 Key。
- `MODEL_REQUEST_FAILED`：供应商请求失败。
- `MODEL_EMPTY_RESPONSE`：模型没有返回可显示文本。
- `INVALID_CHAT_REQUEST`：请求结构不符合协议。

HTTP 层统一输出 Problem Details，前端通过共享 schema 解析，而不是直接依赖某个供应商的错误 JSON。

## 4. 阶段三：流式对话的一致性边界

### 4.1 数据流与前端状态提交顺序

```text
用户提交
  -> 前端立即追加 user message
  -> 前端立即追加空 assistant message
  -> fetch Chat SSE endpoint
  -> ReadableStream + TextDecoder 读取字节流
  -> 按空行切分 SSE event
  -> 解析 data JSON
  -> 追加 delta 到同一个 assistant message
```

事件形态：

```text
data: {"type":"message.delta","messageId":"msg_123","delta":"第一段"}

data: {"type":"message.delta","messageId":"msg_123","delta":"第二段"}

data: {"type":"message.completed","messageId":"msg_123","model":"model-id"}
```

### 4.2 实际解决的问题

第一个问题是“用户消息不能等模型完成后才出现”。解决方式是先做 optimistic UI：提交成功进入本地状态后，立刻渲染用户消息和空 assistant 占位，再等待流式响应。

第二个问题是输入框不能在流式期间保留旧草稿。解决方式是把 `setPrompt('')` 放在提交校验通过之后、网络请求之前，而不是放在 `await` 之后。

第三个问题是展示层与模型上下文不能共享渲染后的 React 结构。消息状态保留原始 Markdown 字符串，渲染层只是一个 projector；下一轮上下文只取原始 `user/assistant` 文本，避免把 HTML、组件节点或 Workbench 状态发送回模型。

这里真正值得展开的是状态提交顺序：用户消息、空 assistant 占位和输入框清空属于本地事务，必须在网络请求开始前完成；SSE 只负责向已有的 assistant message 追加 delta。这样即使供应商超时或连接中断，用户已经提交的事实仍然可见，失败状态也不会回滚掉用户输入。

### 4.3 当前边界

这是 Chat SSE，不是 Agent Run Event SSE。当前只传递文本 delta 和完成事件，还没有：

- run-scoped sequence
- 断线重连和 replay
- tool call event
- steer/cancel event
- Workbench event projection

## 5. 阶段四：Workbench 的状态边界

Workbench 当前是 development-only fixture，但它已经验证了一个重要的架构边界：Workbench 不是另一套对话页面，而是 Agent Run 事实的投影容器。

```text
Agent Runtime / Event Stream
          |
          v
   Run / Activity projector
       |           |
       v           v
 Conversation   Workbench
 (消息摘要)     (Activity, Sources, Report)
```

可讲的设计决策：

- Conversation 只负责消息时间线和 Composer；RunCard 负责把运行状态压缩成可扫描的摘要。
- Workbench 只在出现可查看的 Source、Artifact 或报告草稿后展开；没有内容时不渲染空 Tab，避免把“未来能力”伪装成当前能力。
- Activity、Sources、Report 是同一运行上下文的不同视图，不应由各组件分别维护一份运行状态。
- 用户手动收起 Workbench 后，本次 run 内由 `pinned/auto-follow` 语义阻止自动重新打开；这类交互状态必须与运行事实分开保存。

当前 fixture 尚未替代真实 Agent Event Store，也没有断线 replay、run-scoped sequence 或真实 steer/cancel。面试时应明确说明：UI 状态已先验证，生产事件协议和持久化投影仍是下一阶段工作。

## 6. 阶段五：协议与传输的演进边界

当前 `packages/agent-protocol` 已被 Web/API 共享，用 Zod 同时承担运行时校验和类型推导；Chat SSE 已升级为带 `type/messageId` 的阶段一事件，但仍不等同于最终 Agent Run 协议。

后续应把职责拆开：

```text
Protocol      定义事件、状态、动作和数据结构
SSE           负责把事件可靠地传到浏览器
Projector     把事件折叠成 Conversation/Run/Workbench 状态
React         只负责展示和触发动作
```

这是一个可验证的演进策略：当前先统一消息 ID、Chat SSE 事件和 Function Calling 的结构化对象；进入 Agent Run 阶段后，再增加 `sessionId/runId/eventId/sequence` 和事件 envelope。在此之前，不把供应商 SDK 的响应对象直接泄漏到前端，也不让 Workbench 组件解析裸 SSE JSON。

## 7. 面试表达模板

### 问：你在这个项目中负责了什么？

答：我先搭建了 pnpm monorepo 和 React/Vite + NestJS + Prisma/PostgreSQL 的工程基线，然后通过 OpenAI 官方 SDK 的 `baseURL` 接入 OpenAI-compatible 普通对话。当前请求支持受控的临时上下文、Chat SSE 和即时 optimistic UI；同时把 Workbench 设计成运行事件的投影边界，为后续真实 Agent Run 协议、来源和报告视图预留了演进路径。

### 问：SSE 为什么没有直接使用 WebSocket？

答：当前阶段是服务端单向推送文本 delta，客户端只需要提交一次请求并接收增量结果，SSE 的语义和 HTTP 部署链路更简单。后续 Agent Run 需要 steer/cancel、双向控制和事件恢复时，会重新评估控制请求与事件流的组合，而不是把当前 Chat SSE 直接当成完整 Agent 协议。

### 问：当前上下文为什么没有直接放进 PostgreSQL？

答：普通对话阶段先验证模型调用和用户体验，避免在 Session/Run 领域模型尚未冻结前过早绑定存储结构。现在上下文仅保存在 Web 内存中，刷新会丢失；下一阶段会用 Session、Message、Run 和 State snapshot 正式替换。

### 问：流式输出时如何保证用户消息立即出现？

答：提交时先完成本地状态事务：追加 user message、创建空 assistant 占位并清空输入框；网络请求只负责向已有 assistant message 追加 delta。这样 UI 不依赖模型完成时机，供应商失败时也不会丢失用户刚提交的内容。

## 8. 后续追加规则

每个阶段只追加四类内容：

1. 实际使用的技术和边界。
2. 真实遇到的 bug 或设计难点。
3. 采取的解决方案和取舍。
4. 可以被测试或代码引用验证的面试表述。

没有实际难点的阶段只记录技术点和当前限制，不强行制造“挑战”。
