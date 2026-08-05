# 阶段面试知识点

> 文档用途：记录本项目已经真实实现过的工程知识点，作为面试复盘和项目讲解提纲。
>
> 维护原则：只记录当前代码已经验证的内容；没有真实难点时不强行包装。每完成一个阶段，再追加对应章节。
>
> 当前覆盖：P1 工程基线、OpenAI-compatible 模型适配、持久化普通对话、Chat SSE、会话并发隔离、Workbench 状态边界。

## 1. 项目一句话介绍

这是一个基于 pnpm workspace 的本地单用户 Agent 工作台：前端使用 React/Vite，后端使用 NestJS，数据层使用 Prisma/PostgreSQL，当前已经打通可刷新恢复的 OpenAI-compatible 持久化普通对话，后续再逐步接入 Function Calling、Agent loop、搜索工具和可验证报告。

面试时需要主动区分：

```text
已经完成：持久化 Session/Message、普通对话、Chat SSE、Workbench UI fixture、工程基建
尚未完成：真实 Agent Runtime、搜索、持久化 Run、Run Event SSE
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
POST /api/agent/sessions/:sessionId/chat/stream
```

### 3.2 数据库作为上下文权威

Web 只提交本轮 content，后端以数据库消息作为上下文权威：

```text
session-scoped request
  -> 持久化 user message
  -> 数据库读取最近 20 条 user / assistant
  -> API 追加 system prompt
  -> 调用模型
```

这样刷新、切换设备内页面或后台生成时，前端缓存都不会成为模型上下文事实来源。进入 Agent Run 阶段后，再由 Context Compiler 在持久化消息、工具结果和状态快照之上做上下文选择。

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

### 4.3 SSE chunk、UTF-8 与事件边界

浏览器的 `ReadableStreamDefaultReader.read()` 返回的是任意网络 chunk，不保证一次读取正好对应一条 SSE event，也不保证一个 UTF-8 字符的字节全部落在同一个 chunk。以下三个边界必须分开处理：

```text
网络 chunk 边界  !=  UTF-8 字符边界  !=  SSE event 边界
```

例如一条事件可能被拆成：

```text
chunk 1: data: {"type":"message.del
chunk 2: ta","messageId":"msg_1","delta":"你好"}\n\n
```

当前 Web 使用带流状态的 `TextDecoder` 和跨读取缓冲区：

```ts
const decoder = new TextDecoder();
let buffer = '';

buffer += decoder.decode(value, { stream: !done });
const events = buffer.split('\n\n');
buffer = events.pop() ?? '';
```

- `TextDecoder(..., { stream: true })` 会保留尚未完整解码的多字节字符，避免中文被拆分时产生乱码或替换字符。
- `buffer` 保留最后一段尚未遇到空行分隔符的数据；只有完整 SSE event 才进入 JSON 和 Zod 解析。
- 一次 chunk 可以包含多条 event，一条 event 也可以跨多个 chunk，解析逻辑不能依赖读取次数。
- 完成后必须收到 `message.completed` 和持久化 `messageId`；只有连接自然结束但没有完成事件时，客户端会把它视为不完整交付，而不是静默成功。

这里的工程重点不是实现“打字机效果”，而是不能把底层传输分块误当成业务消息边界。当前实现已经处理增量 UTF-8 解码和事件缓冲，但仍未实现断线续传、`Last-Event-ID`、sequence 和 replay。

### 4.4 当前边界

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

## 6. 阶段五：会话持久化与并发隔离

### 6.1 写入时序与失败语义

普通对话不是把流式半成品持续写入数据库，而是使用明确的提交边界：

```text
校验 Session 归属并获取执行权
  -> user message 落库并更新 Session.updatedAt
  -> 读取最近 20 条上下文
  -> assistant delta 只投影到 Web 缓存
  -> 模型完整结束
  -> assistant message 一次性落库
  -> message.completed 返回真实持久化 ID
```

供应商失败时保留 user message，但不写空 assistant 或不完整正文。这一取舍使数据库表达“已经提交的用户事实”和“已经完成交付的模型事实”，不会把网络中断误表示成完整回答。代价是页面刷新后无法恢复尚未完成的部分流，这要等 Run/Event 持久化阶段解决。

### 6.2 为什么需要会话级执行注册表

前端允许切换会话后让原会话继续后台生成，因此不能使用一个全局 `submitting` 布尔值。Web 按 `sessionId` 维护消息缓存和 pending 状态；API 使用内存 `Set<sessionId>` 获取和释放执行权：

- 不同 Session 可以并行，避免一个长回答阻塞整个应用。
- 同一 Session 暂时拒绝并发消息，避免历史读取和消息排序出现竞态。
- 活跃 Session 删除返回 `409 SESSION_BUSY`，避免流结束时向已删除会话写 assistant。
- 注册表不冒充持久化任务恢复；API 重启后活跃流自然终止。

这里值得强调的是锁的获取时机：Controller 在发送 SSE 响应头之前完成归属校验、加锁和 user message 写入，因此并发冲突仍能返回标准 HTTP Problem Details，而不是在已经开始的 SSE 中混入 409。

### 6.3 前端缓存与数据库最终事实

发送时先做 optimistic UI，空白草稿的 user/assistant 占位立即出现；Session 创建成功后再把草稿绑定服务端 ID。每个流回调闭包固定捕获目标 `sessionId`，即使用户切换会话，delta 也只写目标缓存。切换回来可以看到生成进度，流完成后再用 Session detail 覆盖缓存，以数据库结果作为最终事实。

标题生成被拆成首轮回答后的独立请求：临时标题可立即用于 Sidebar，模型标题失败只保留 fallback，不阻塞首字、完整回答或 Composer 解锁。

## 7. 协议与传输的演进边界

当前 `packages/agent-protocol` 已被 Web/API 共享，用 Zod 同时承担运行时校验和类型推导；Chat SSE 已升级为带 `type/messageId` 的阶段一事件，但仍不等同于最终 Agent Run 协议。

后续应把职责拆开：

```text
Protocol      定义事件、状态、动作和数据结构
SSE           负责把事件可靠地传到浏览器
Projector     把事件折叠成 Conversation/Run/Workbench 状态
React         只负责展示和触发动作
```

这是一个可验证的演进策略：当前先统一消息 ID、Chat SSE 事件和 Function Calling 的结构化对象；进入 Agent Run 阶段后，再增加 `sessionId/runId/eventId/sequence` 和事件 envelope。在此之前，不把供应商 SDK 的响应对象直接泄漏到前端，也不让 Workbench 组件解析裸 SSE JSON。

## 8. 日志分层与模型链路可观测性

### 8.1 开发和生产日志承担不同职责

开发环境优先让人快速定位问题，生产环境优先让日志系统稳定采集和查询，因此没有强行让两者使用相同输出形式：

```text
development  -> pino-pretty、彩色中文单行、隐藏 req/res 等高噪声对象
production   -> 结构化 JSON，保留 level、context、requestId 等机器可查询字段
```

普通 HTTP 自动访问日志已经关闭。健康检查、静态轮询和 Nest 路由初始化如果逐条输出完整请求头、响应对象与 `request completed`，会掩盖真正的模型链路事件，也可能把 Cookie 或认证信息带入日志。关闭自动访问明细不等于放弃可观测性，而是把日志预算留给有业务含义的事件。

### 8.2 request ID 与统一脱敏

API 优先复用调用方传入的 `x-request-id`，缺失时生成 UUID，并把同一 ID 写回响应头。这样将来可以把 Web 请求、API 日志和下游模型调用关联起来，而不需要在每个 Controller 中重复实现 correlation ID。

敏感字段在日志基础设施层统一脱敏：

```text
Authorization
Cookie
Set-Cookie
req.body.apiKey
req.body.api_key
```

统一脱敏比要求每个业务模块“记得不要打印密钥”更可靠。当前日志只使用 session ID 的前 8 位做人工关联，降低整段内部标识在终端中扩散的必要性；这不是权限控制或密码学匿名化，只是日志最小化。

### 8.3 为什么模型链路需要 TTFT

流式模型体验不能只看总耗时。用户感知更直接的指标是 TTFT（Time To First Token，首字耗时）：

```text
请求开始
  -> 供应商排队 / 建连 / 首轮推理
  -> 首个有效 delta                       # TTFT
  -> 后续持续生成
  -> 完整响应和 assistant message 落库    # total latency
```

当前模型链路只记录几个关键事件：

- 开始生成：会话短 ID、模型和上下文条数。
- 首次收到有效 delta：首字耗时。
- 完成：总耗时和输出字符数。
- 失败：会话短 ID、已耗时和归一化后的错误类型。

TTFT 高通常指向供应商排队、网络或首轮推理延迟；TTFT 正常但总耗时高，更可能是输出过长或生成速率低。把两者分开，排查时才不会把所有“回复慢”归为同一种问题。当前尚未接入集中式 metrics/tracing，也没有记录 prompt 或完整模型响应，避免为了排障把用户内容和密钥复制到日志系统。

## 9. 不可信 Markdown 的安全渲染边界

模型回复、用户输入和后续搜索报告都属于不可信内容。前端状态保存原始 Markdown 字符串，统一交给 `MarkdownContent` 投影，不把模型文本拼接成 HTML，也不使用 `dangerouslySetInnerHTML`：

```text
untrusted Markdown string
  -> react-markdown parser
  -> controlled React elements
  -> shared chat/report presentation
```

当前实现的边界包括：

- 使用 `react-markdown` 渲染结构，不直接执行原始 HTML、脚本或事件属性。
- 使用 `remark-gfm` 支持表格、任务列表等确定性 Markdown 语法。
- 所有外链统一使用 `target="_blank"` 和 `rel="noopener noreferrer"`，防止新页面通过 `window.opener` 控制原页面，并减少不必要的 referrer 暴露。
- 表格放入可键盘聚焦的横向滚动容器，避免模型生成的宽表破坏移动端和 Workbench 布局。
- Chat 和未来 Report 复用同一个 renderer 和信任边界，避免两个页面对同一内容采用不同安全规则。
- 数据库存储原始 Markdown，而不是渲染后 HTML；样式调整、引用导航和后续校验不需要迁移消息正文。

这里需要避免过度表述：当前安全性依赖 `react-markdown` 默认不渲染原始 HTML，代码尚未引入 `rehype-raw`。如果后续允许供应商 HTML、自定义组件或更丰富的 URL scheme，必须重新评估 sanitization、协议白名单和内容安全策略，不能把当前边界等同于通用 HTML sanitizer。

## 10. Function Calling Agent Loop 与搜索投影

这一阶段不是“给 OpenAI 请求加一个 tools 参数”就结束。模型只返回工具名称和参数，真正的循环由应用负责：

```text
model(tool_calls)
  -> 聚合流式 arguments
  -> Zod 校验并串行执行后端工具
  -> tool result 放回上下文
  -> model 继续决策或输出最终回答
```

OpenAI-compatible 流中的函数名和 JSON arguments 都可能跨 chunk 返回，因此必须按 tool-call `index` 累加，等本轮结束后再解析，不能对单个 delta 直接 `JSON.parse`。循环使用 20 次通用工具预算作为硬上限；这是防止模型重复调用或未来多工具相互触发的安全边界，不是要求模型用满预算。

模型只看到 `web_search({query})`，Bocha/Serper 选择留在后端 Adapter。每次统一保留最多 10 条结果，标题和摘要截断、URL 只允许 HTTP/HTTPS。搜索响应以带 `untrustedExternalData` 标记的 tool message 进入上下文，网页摘要不能成为新的指令来源。

Workbench 同时消费 `tool.started/completed/failed`，但当前没有把 Chat SSE 冒充 durable Run Event。最终 assistant metadata 只保存本轮 execution/source 快照，让刷新后能恢复用户已经看到的检索列表；断线 replay、sequence、steer/cancel 和正式 Evidence 仍留给后续 Run/Event Store。搜索结果在 UI 中明确叫 clue，而不是可引用 evidence。

## 11. 面试表达模板

### 问：你在这个项目中负责了什么？

答：我先搭建了 pnpm monorepo 和 React/Vite + NestJS + Prisma/PostgreSQL 的工程基线，然后通过 OpenAI 官方 SDK 的 `baseURL` 接入 OpenAI-compatible 普通对话。当前完成了 Session/Message 持久化、数据库上下文、Chat SSE、会话级并发隔离和即时 optimistic UI；同时把 Workbench 设计成运行事件的投影边界，为后续 Function Calling 和真实 Agent Run 协议预留演进路径。

### 问：SSE 为什么没有直接使用 WebSocket？

答：当前阶段是服务端单向推送文本 delta，客户端只需要提交一次请求并接收增量结果，SSE 的语义和 HTTP 部署链路更简单。后续 Agent Run 需要 steer/cancel、双向控制和事件恢复时，会重新评估控制请求与事件流的组合，而不是把当前 Chat SSE 直接当成完整 Agent 协议。

### 问：为什么上下文由后端从 PostgreSQL 读取？

答：如果由 Web 回传完整历史，前端缓存会变成事实来源，刷新恢复、后台多会话流和未来多端访问都容易产生分叉。现在 Web 只提交本轮 content，API 先持久化 user message，再读取最近 20 条数据库历史。前端缓存只负责低延迟投影，流完成后由详情接口覆盖。

### 问：流式输出时如何保证用户消息立即出现？

答：提交时先完成本地状态事务：追加 user message、创建空 assistant 占位并清空输入框；网络请求只负责向已有 assistant message 追加 delta。这样 UI 不依赖模型完成时机，供应商失败时也不会丢失用户刚提交的内容。

## 12. 后续追加规则

每个阶段只追加四类内容：

1. 实际使用的技术和边界。
2. 真实遇到的 bug 或设计难点。
3. 采取的解决方案和取舍。
4. 可以被测试或代码引用验证的面试表述。

没有实际难点的阶段只记录技术点和当前限制，不强行制造“挑战”。
