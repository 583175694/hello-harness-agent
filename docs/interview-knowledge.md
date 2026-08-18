# 阶段面试知识点

> 文档用途：记录本项目已经真实实现过的工程知识点，作为面试复盘和项目讲解提纲。
>
> 维护原则：只记录当前代码已经验证的内容；没有真实难点时不强行包装。每完成一个阶段，再追加对应章节。
>
> 当前覆盖：工程基线、OpenAI-compatible 模型适配、DeepSeek V4 Thinking + Tool Calling 上下文优化、持久化对话、Function Calling Agent Loop、Search/Fetch 联网调查、真实 Workbench 投影、Connection-Durable Agent Loop 和 Context Engineering 第一阶段。

## 1. 项目一句话介绍

这是一个基于 pnpm workspace 的本地单用户 Agent 工作台：前端使用 React/Vite，后端使用 NestJS，数据层使用 Prisma/PostgreSQL，当前已经打通持久化对话、DeepSeek V4 reasoning 上下文适配、Function Calling Agent Loop、`web_search -> web_fetch -> 相关 Passage -> 普通回答`、Connection-Durable Run、可断线恢复的 Conversation/Workbench，以及 Model Round 级的 Context 编译、Token 预算、Tool Result 裁剪和历史压缩。

面试时需要主动区分：

```text
已经完成：持久化 Session/Message/Run/Step、后台 Agent Runtime、Run SSE sequence/replay、draft snapshot、独立 cancel、Search/Fetch、Workbench 恢复和 Context Engineering 第一阶段
尚未完成：服务重启后续跑、多实例 Worker lease、Skills、Memory、NOTES/TODO、Goal Reminder、正式 Evidence/Citation 和 Delegation
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

早期 Chat SSE API 已被 Durable Run API 替代。当前公开边界是：

```text
POST /api/agent/sessions/:sessionId/runs
GET  /api/agent/runs/:runId
GET  /api/agent/runs/:runId/events
POST /api/agent/runs/:runId/cancel
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

### 3.4 DeepSeek V4 的上下文为什么需要专门适配

DeepSeek V4 虽然提供 OpenAI-compatible Chat Completions 接口，但 Thinking + Tool Calling 的上下文契约不能按“普通 assistant 文本历史”处理。模型在工具轮可能同时产生：

```text
reasoning_content + content + tool_calls
                         |
                         v
                一个完整工具协议单元
```

其中 `reasoning_content` 不是用户可见正文，却是 DeepSeek 恢复历史 Tool Call 所需的原生协议字段。后续请求如果只回传 assistant `content + tool_calls`，可能破坏供应商对工具链上下文的校验；如果把所有历史 reasoning 都无差别回放，又会把最终回答内部推理持续塞进后续上下文。

项目最终采用“完整保存、选择性编译”的两层设计：

```text
DeepSeek stream
  -> Model Adapter 解码 reasoning_content
  -> Runtime 聚合 canonical reasoning/content/tool calls
  -> Repository 按顺序持久化 canonical transcript
  -> 下一轮请求编译
       |- assistant 含 tool_calls：回放 reasoning_content + content + tool_calls
       `- 最终 assistant 无 tool_calls：只回放 content
```

Model Adapter 是供应商差异的唯一边界，Runtime 不依赖 `reasoning_content` 这个私有字段；它只理解 canonical reasoning、assistant Tool Call 和 Tool Result。请求编码时，Adapter 仅在 `message.reasoning && message.toolCalls?.length` 时恢复 DeepSeek 的 `reasoning_content`。这避免把供应商协议散落到 ChatService、Repository 或前端。

这里有五个关键不变量：

1. 与 Tool Call 绑定的 reasoning、assistant content、全部 Tool Call 和对应 Tool Result 是原子单元，不能只保留其中一部分。
2. 无 Tool Call 最终 Round 的 reasoning 可以留在 durable transcript 作为事实和诊断材料，但下一用户轮次只发送最终 `content`。
3. `reasoningEffort=off` 只关闭当前 Run 的新 thinking；历史工具协议要求的 reasoning 仍必须回放，否则“关闭本轮推理”会意外破坏历史上下文。
4. 只有需要 native reasoning replay 的历史工具单元才检查 provider 和 `reasoningFormat`；普通最终回答不应仅因来自另一模型就阻塞会话继续。
5. raw reasoning 不进入普通 Conversation、Workbench 或用户 SSE。用户看到的是按 `roundSequence + blockSequence` 排序的文本和 Tool Activity，而不是供应商内部思维文本。

流式实现还有一个容易忽略的点：`reasoning_content`、普通 `content` 和 `tool_calls` 都可能跨 chunk 到达，且先后顺序不能单靠网络事件推断语义。Adapter 解码 reasoning/content 分片、按 provider index 聚合工具参数，并为 Content/Tool 分配稳定 `blockSequence`；Runtime 再分别聚合 canonical reasoning 与正文。只有 Round 结束后，Runtime 才能根据是否存在 Tool Call 判断这一轮 content 是工具前言还是最终回答。

这项优化的工程收益不是简单的“少传一个字段”：

- 保证 DeepSeek V4 多轮 Tool Calling 的协议正确性和历史可恢复性。
- 避免最终回答 reasoning 在每轮请求中反复累积，减少不必要的上下文占用。
- 允许不依赖 native reasoning 的普通回答跨模型复用，同时对真正不兼容的工具历史明确失败。
- 将模型事实、供应商编码和用户展示拆成三个边界，降低 raw reasoning 泄露到 UI 或业务协议的风险。
- 为后续 Context Engineering 提供完整 canonical transcript；未来可以计量、选择和淘汰原子单元，而不是从 UI 文本反推模型历史。

面试口述时可以这样概括：

> DeepSeek V4 的难点不是把 Base URL 换成兼容接口，而是 Thinking 和 Tool Calling 形成了特殊上下文契约。工具轮的 `reasoning_content` 必须和 Tool Call、Tool Result 一起恢复，但最终回答的 reasoning 不应该继续进入下一轮。我把供应商字段限制在 Model Adapter 内，Runtime 和数据库只保存 canonical transcript；请求时对工具单元做 native replay，对最终回答只回放正文。这样既保证了 DeepSeek 工具链协议，又避免无效 reasoning 持续膨胀上下文，同时不把 raw reasoning 暴露给用户。

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

### 4.4 从 Chat SSE 到 Run Event SSE

当前 SSE 已是独立观察通道：每个 Run 使用从 1 开始的严格递增 `seq`，通过标准 `id/event/data` 字段发送；客户端用 `Last-Event-ID` replay 内存窗口，cursor 过期或 Run 不在当前进程时改用 PostgreSQL snapshot。SSE close 只移除 subscriber，不触发 Runtime 的 AbortSignal；Cancel 使用独立 command API。当前仍不承诺跨进程继续执行，服务重启会把遗留 Run 收敛为 `failed + RUN_INTERRUPTED`。

## 5. 阶段四：Workbench 的状态边界

Workbench 不是另一套对话页面，而是 Agent 执行事实的投影容器。生产链路已经接入真实 Search/Fetch Activity 和 Sources；Preview fixture 只保留 waiting、report、steer/cancel 等尚未进入生产链路的状态。

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

- Conversation 用有序文本与 Tool Activity block 还原真实执行时间线；Tool Activity 点击后定位 Workbench，避免再用 RunCard 重复展示同一工具状态。
- Workbench 只在出现可查看的 Source、Artifact 或报告草稿后展开；没有内容时不渲染空 Tab，避免把“未来能力”伪装成当前能力。
- Activity、Sources、Report 是同一运行上下文的不同视图，不应由各组件分别维护一份运行状态。
- 用户手动收起 Workbench 后，本次 run 内由 `pinned/auto-follow` 语义阻止自动重新打开；这类交互状态必须与运行事实分开保存。

当前恢复同时使用 assistant draft metadata、Run snapshot 和 Checkpoint 水位后的进程内 Event Tail。Workbench 的 open/tab/focus/pinned 属于本地选择，不被 server snapshot 覆盖；blocks、execution、source 和 Run 状态属于服务端投影。系统实现了真实 cancel，但 steer、pause 和跨进程 Event Store 仍不在当前范围。

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

供应商失败时保留 user message，但不写空 assistant 或不完整正文。这是早期普通 Chat 阶段的边界；进入 Durable Run 后，assistant draft 会按时间/大小和语义边界阶段性持久化，刷新可以恢复已保存的部分文本、Activity 和 Sources，只有 completed assistant 才进入后续模型历史。

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

## 8. 不可信 Markdown 的安全渲染边界

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

## 9. Function Calling Agent Loop 与 Tool Module

这一阶段不是“给 OpenAI 请求加一个 tools 参数”就结束。模型只返回工具名称和参数，真正的循环由应用负责：

```text
model(tool_calls)
  -> 按 index 聚合流式 name / arguments
  -> JSON + Zod 校验
  -> Registry 查找并串行执行后端工具
  -> assistant tool-call message + tool result 放回本轮上下文
  -> model 继续决策或输出最终回答
```

OpenAI-compatible 流中的函数名和 JSON arguments 都可能跨 chunk 返回，因此必须按 tool-call `index` 累加，等本轮结束后再解析，不能对单个 delta 直接 `JSON.parse`。同一模型响应含多个调用时按返回顺序串行执行，每个 assistant run 最多处理 20 次模型声明的 Tool Call，但不要求模型用满额度。

工具层拆成稳定的通用边界：

```text
AgentTool             定义名称、Function Schema、可用性和 execute
Tool Catalog          作为工具白名单与唯一注册入口
Tool Registry         负责发现、JSON/Zod 校验和分派
Agent Runtime         负责模型-工具循环、20 次调用上限、超时和终止
Tool implementation   只负责具体能力和自己的业务不变量
```

新增工具时，只需实现 `AgentTool` 并加入 Catalog，Registry 和 Runtime 不应出现 `if (toolName === ...)` 式的业务执行逻辑。Prompt 负责引导模型何时用工具，具体 Tool/Executor 负责强制输入、安全和能力内部资源边界；不能把安全性寄托在 Prompt 上。Tool 的外层执行超时由 Tool 声明、Runtime 统一组合用户取消并强制执行。

通用 Runtime 把执行过程转换为 `tool.started/completed/failed/cancelled`，Conversation 和 Workbench 只消费这些 canonical lifecycle event，不解析 OpenAI 原始 chunk 或具体 Provider 响应。当前这仍是 Chat SSE 投影，不是 durable Run Event Store。

## 10. Web Search：Clue 发现与搜索投影

模型只看到统一的 `web_search({query})`，不能选择 Provider、API 地址、密钥或供应商私有参数。后端 `SearchService` 再根据配置路由到 Bocha 或 Serper Adapter，并统一归一化为标题、URL、domain、snippet、publishedAt 和 source。当前单次最多返回 10 条，不做 fallback、并行 Provider 或分页。

搜索标题和摘要只是 `clue`，目的是帮助模型选择值得读正文的 URL，不是直接冒充事实依据。Search 成功后会把 clue URL 登记到本轮 Web Research 状态，成为 Fetch 可接受的候选；用户当前消息中的 HTTP/HTTPS 直链也可以直接登记。模型自行猜测的 URL 在网络请求前被拒绝。

Search 和 Fetch 在可用时同时暴露，调用顺序由模型决定，不把 Agent Loop 写死成固定流程。当前代码允许模型 Fetch 任意通过安全 Guard 的公开 URL，并由 Projection 把 provenance 保留为可观测事实，而不是执行权限。

Workbench 实时消费 Search 的工具生命周期事件，并把去重后 clue 投影到 Sources。最终 assistant metadata 保存 execution/source 轻量快照，用于刷新恢复；它不是 Run/Event replay，也不将 clue 提升为正式 Evidence。

## 11. Web Fetch：从网页到有界原文

### 11.1 正文处理和 Passage 筛选

`web_fetch` 不把整页 HTML 直接丢给模型，而是把网络获取、正文提取、规范化和相关性筛选分层：

```text
URL/DNS/redirect guard
  -> Crawlee HttpCrawler 有界获取
  -> JSDOM + Readability 提取主正文
  -> Turndown 转 canonical Markdown
  -> Document Quality Gate
  -> 按标题/段落切块
  -> 字符 2-gram/3-gram query-aware ranking
  -> 有界抽取式 Passage + Locator
```

Quality Gate 在写入 LRU 和 Passage Ranking 前拒绝过短正文、登录/付费墙/验证码、JavaScript 空壳和高度重复模板。query 存在但没有达到相关性门槛的 Passage 时，返回 `FETCH_CONTENT_NOT_RELEVANT`，不把“读到了页面”误表达成“获得了有用依据”。

Passage 必须是 canonical Markdown 的连续直接子串，不由模型改写或拼接。Locator 保存 quote、Unicode code-point position 和 sectionPath，并与 contentHash、retrievedAt 一起解释；这给 Workbench 提供可恢复的原文定位，但不等同于页面 DOM 字节位置。

### 11.2 从“领域状态控制”到 Model-led Tool Boundary

第一版为了约束跨多轮 Fetch，引入了 `ToolRunState` 和 `WebResearchRunState`，累计 URL alias、contentHash、Passage 字符和连续无新增内容；Web Research 再通过 `forceFinalAnswer` 请求 Runtime 收尾。这个方案解决了并发隔离和显式 Web 分支问题，也证明“把状态移出 Runtime”可以降低核心循环对具体工具的认知。

进一步复盘发现，这只是把决策依赖从 `if (toolName)` 移进了通用契约。Tool 仍能决定何时停止，`WebResearchRunState` 实际上成了隐藏的领域 planner；如果每个新工具都增加自己的 run state 和控制意图，Runtime 最终会被多个领域策略共同驱动。再增加 Runtime Decision Policy 或 Web Research Policy，只会形成模型之外的第二套大脑。

因此最终边界调整并实现为：模型是唯一语义规划者，Runtime 执行模型决策并维护 20 次 Tool Call、单操作超时、取消和协议安全等通用边界，Tool 只返回 canonical output、结构化错误和日志字段。Runtime 统一把 `output/error` 序列化为 Tool Message；`ToolRunState`、`WebResearchRunState`、Tool `modelContent`、Tool `forceFinalAnswer` 和 `disableTools` 已删除。SSRF、DNS、重定向、响应大小、正文提取、Passage 排序和 LRU 等能力内部约束继续留在 Fetch，因为它们属于安全与工程正确性，不属于任务决策。

当前不建立 Tool observation 字符预算或注入状态，Tool Result 始终进入下一模型轮次。未来 Context Engineering 如果实施，应面向完整模型上下文统一做 Token 计量、选择、压缩和淘汰，而不是让 Tool 决定模型能看到什么。

这个案例的关键不是“所有状态都不好”，而是区分执行状态与规划状态：Runtime 可以记录 messages、rounds、tool-call count、cancel 和 execution history，但不能让某个 Tool 的领域状态成为主循环决策源。单操作超时与用户 Abort 同样继续保留；模型负责语义，不代表模型可以覆盖安全边界。

### 11.3 轻量 Source 语义不等于 Evidence

搜索标题和 snippet 是 `clue`，成功读取并经质量门/相关性筛选的网页是 `fetched`。最终回答完成后，后端抽取回答中的 HTTP/HTTPS URL，执行去 fragment、tracking 参数和参数排序的同一规范化，再确定性设置 `used`。`used=true` 只表示回答采用了该链接，不能表述成“该来源逐句支撑了某个事实”。这个边界以很低的复杂度提供真实来源透明度，但不冒充正式逐句引用能力，也不承诺后续一定建设 Citation Validator。

### 11.4 网页内容是数据，不是指令

Search snippet 和 Fetch Passage 都以带 `untrustedExternalData` 语义的独立 Tool Message 进入模型上下文。网页里的“忽略原有指令”、角色声明、工具调用要求或外链都只是不可信数据，不能改变 system prompt、工具集、执行边界或完成条件。网页外链可以被模型提出给下一次 Fetch，但仍必须通过 URL/DNS/redirect 安全 Guard。完整 Raw HTML、Cookie、Authorization、API Key 和内部 prompt 不进入模型或 Workbench。

这里需要区分两种不可信内容：前端的“不可信 Markdown”解决渲染与链接安全；Agent 上下文中的“不可信 Tool Result”解决 Prompt Injection 和能力边界。两者的信任边界不同，不能只做 HTML sanitization 就宣称解决了 Agent Prompt Injection。

## 12. 真实问题案例：长链路 Agent 的活性与边界治理

### 12.1 问题背景与现象

在实现 Web Research Agent 后，复杂任务会经历多轮“模型决策 -> Search -> Fetch -> 模型继续决策”。最初为了防止 Agent 无限运行，我们给整个研究阶段设置了 120 秒硬截止时间。这个设计在短任务中没有问题，但在全球股票分析这类合法的深度任务中，模型可能需要多轮搜索并读取十几个来源；即使每次模型和工具调用都正常，累计时间也可能超过 120 秒，导致健康任务被总时钟提前截断。

与此同时，直接删除总超时也不能解决问题：模型可能重复调用工具，上游可能连续失败，Fetch 可能不断读取重复或低质量页面。更隐蔽的问题是，达到边界后如果仍把工具定义发送给模型，模型可能继续返回结构化工具调用，部分 OpenAI-compatible Provider 还可能把内部 DSML 工具协议作为普通文本输出。若这些内容直接进入 SSE 和数据库，就会污染当前 UI、持久化消息以及后续会话上下文。

这个问题的本质不是“120 秒够不够”，而是原设计把四种不同责任混在了一个总截止时间里：

1. 单个外部操作是否卡死。
2. Agent 是否陷入无界工具循环。
3. 某一工具领域是否仍能获得新信息。
4. 工具阶段结束后能否可靠地产生一份干净的最终回答。

### 12.2 定位过程

我先按运行日志还原每一轮模型决策和工具调用，区分“单操作耗时异常”和“多个正常操作累计时间较长”。实际长任务中，Search、Fetch 和模型轮次都能在各自合理时间内完成，问题来自全局计时器对正常工作量的误伤，因此继续增大 120 秒只是在推迟同一个问题。

进一步梳理后得到两个结论：

- 时间适合隔离单次故障，不适合衡量一个开放式研究任务是否应该结束。任务复杂度、来源数量和供应商延迟都会让总耗时产生很大波动。
- 当时认为 Agent 的终止条件应该优先来自结构性边界和信息增益，例如工具调用次数、可读取 URL、可注入正文规模以及连续无新增内容，而不是只看墙上时钟。后续 Model-led 复盘进一步收敛为：当前阶段只保留通用 Tool Call 次数作为结构性收敛边界，不让 Web 领域状态替模型判断信息是否足够。

### 12.3 当时的解决方案

最终采用了四层互补、但保持简单的运行边界：

```text
用户取消
  -> 立即传播到模型和在途工具

单操作故障隔离
  -> 普通模型轮次 120 秒
  -> 最终回答轮次 30 秒
  -> Search 10 秒 / Fetch 20 秒

结构性运行边界
  -> 每个 assistant run 最多 20 个实际模型声明的 Tool Call
  -> Web Research 最多 25 个 URL、60,000 个外部 Passage 字符
  -> 连续两次 Fetch 没有新增唯一文档时停止调查

可靠收尾
  -> 工具通过通用 control.forceFinalAnswer 请求结束工具阶段
  -> 最终回答请求完全省略 tools 和 tool_choice
  -> 服务端缓冲整轮输出并校验 DSML、结构化工具调用、空响应和长度截断
  -> 协议污染时整轮丢弃并强化无工具指令，只重试一次
```

我们删除了 Agent run 的 120 秒总截止时间，但没有删除超时机制。新的语义是：只要多个单操作都健康，复杂任务就可以继续；任何单次模型、Search 或 Fetch 卡住，仍会被自己的超时隔离。失败、超时、取消、无效参数以及同一响应里的多个工具调用都会分别计入 20 次额度，避免通过失败调用绕开循环上限。

当时把资源预算下沉到工具领域，Runtime 只理解通用工具调用额度、生命周期事件和 `disableTools` / `forceFinalAnswer`。它成功删除了 Runtime 中的 Web-specific 分支，但后来确认控制意图仍允许 Tool 反向驱动主循环，因此这是一版中间方案，而不是最终架构。

### 12.4 后续架构复盘与修正

复盘时采用了一个更严格的判断：Tool 是手脚，只应执行能力并返回结构化结果；模型是任务语义上的大脑；Runtime 是执行模型决策、传播事件并守住通用边界的编排器。若 Web Fetch 可以通过 `forceFinalAnswer` 结束工具阶段，或者通过 `WebResearchRunState` 决定“信息已无增益”，它就不再是纯 Tool，而拥有了一部分 planner 权力。

最终批准的修正不是再增加一层 `RuntimeDecisionPolicy` 或 `WebResearchRuntimePolicy`，而是删除 `control`、`ToolRunState` 和 Web 跨调用规划状态。达到 20 次 Tool Call、单轮超时、取消或协议失败时，由 Runtime 确定性收敛；在这些边界之内，是否 Search、Fetch、重试、更换来源或回答，由模型下一轮输出决定。Web Fetch 继续确定性拒绝 SSRF、私网、非法重定向、超大响应和不支持内容，因为安全与资源隔离不能交给概率模型。URL provenance 改由 Projection 派生，只用于观测和来源归并，不再决定 Fetch 权限。

这一修正接受模型可能重复读取来源或执行效率下降的代价。此类问题先由运行指标和人工检查观测，不再预置隐藏 planner；只有真实数据表明存在安全、成本或平台稳定性风险时，才增加工具无关、不可由模型覆盖的硬边界。

### 12.5 关键取舍

这个方案没有追求一次性解决所有极端情况。当前阶段没有加入总 Token/成本预算、相似查询检测、供应商熔断、证据评分、持久化 Run State 或分布式任务恢复。原因是这些机制需要更多运行数据才能确定正确策略，过早引入会增加状态组合、误判和排障成本。

目前接受一个明确限制：如果搜索供应商持续失败，模型仍可能重复搜索，直到消耗完 20 次通用工具额度。它不够高效，但运行一定会收敛，并且完整上游错误原因会进入服务端日志。等 Harness Agent 和运行观测完善后，再根据真实失败分布决定是否增加熔断或成本预算。

这里的设计取舍可以概括为：去掉会误伤正常复杂任务的全局时间限制，用单操作超时保证故障隔离，用 20 次 Tool Call 上限保证最终收敛，用无工具缓冲校验保证输出安全。

### 12.6 历史结果与验证

改造后，全球股票分析这类需要多轮 Search/Fetch 的任务可以在超过原总截止时间后继续正常执行，并由模型根据已经取得的材料决定继续调查或生成回答。当前 Runtime 不包含 Web Search/Web Fetch 名称、URL 解析、Web 指标分支或领域 run state；每个 Tool Call 只接收本次执行上下文，不存在跨会话共享的 Web 规划状态。

历史版本曾用自动化测试覆盖 URL/Passage 预算和连续无新增内容；Model-led 迁移删除这些领域控制机制后，验收重点替换为混合 Tool Call 计数、canonical Tool Message、来源 provenance、canonical source 归并、实时/刷新恢复一致性和 Web Fetch `stats` 事实统计。单轮超时、同轮多调用、用户取消、无工具最终回答、DSML 污染重试、失败不持久化以及任意命名工具的通用编排仍然保留验证。这个结果不仅修复了一个超时问题，也证明时间边界、收敛边界、能力边界和投影边界可以各自独立验证。

### 12.7 面试口述版

> 我们做深度联网 Agent 时，最初给整个研究阶段设置了 120 秒硬超时，目的是防止模型无限调用工具。但实际运行复杂任务后发现，多轮搜索和网页读取即使每一步都正常，累计也会超过 120 秒，全局计时器反而会误杀健康任务。直接删除超时也不行，因为还存在重复调用、资源耗尽和工具协议污染。
>
> 我先通过轮次和工具日志确认瓶颈不是某个请求卡死，而是正常操作累计耗时，因此删除了 Agent 总截止时间，保留模型、搜索和抓取各自的单操作超时，并用 20 次通用工具调用保证循环一定有硬上限。结束工具阶段后完全移除工具定义，缓冲并校验最终回答，发现 DSML 或结构化工具调用就丢弃并只重试一次。
>
> 第一版还把 URL、正文预算和早停状态下沉到 Web Research，并用 `forceFinalAnswer` 通知 Runtime。后续我意识到这只是隐藏了依赖：Tool 仍在替模型决定何时停止。于是目标架构进一步删除领域 run state 和控制意图，明确模型是唯一语义 planner，Runtime 只守通用执行边界，Tool 只返回结构化结果，来源事实由 Projection 派生。这个演进比单纯强调“Runtime 没有工具名称分支”更彻底，也避免每增加一个工具就增加一套隐形决策系统。

### 12.8 如何验证 Model-led 边界不是“只改了类型”

架构迁移不能只证明 happy path 仍然能跑。删除接口字段以后，旧职责仍可能以其他形式残留：Registry 可能继续提供按名称排除工具的入口，Runtime 可能仍根据某种 Tool 返回值提前结束，前后端也可能各自实现一套不同的来源归并。因此验收要围绕真实事实源和反向用例，而不只是检查类型是否编译通过。

第一组验收验证 Tool Call 的计数与消息闭合。Runtime 计数的是模型声明的 Tool Call，而不是成功执行数或 `tool.started` 事件数；成功、结构化失败、非法参数、未知 Tool 和同一 assistant 响应中的多个调用都要占用额度。第 21 次调用不执行，但仍要补齐 `TOOL_CALL_LIMIT_EXCEEDED` Tool Message，确保模型声明的每个 Tool Call 都有对应结果，随后再进入无工具最终回答。持久化的 `agent.toolCallCount` 是调用次数事实源，不能用只覆盖真实启动执行的 `tool.started` 数量代替。

第二组验收验证双层投影。Execution 保存每次真实发生的 Search/Fetch，不做跨调用去重；Source snapshot 则按 requested/final/normalized URL 或 `contentHash` 归并为一条 canonical source，并聚合 `toolCallIds` 与更高优先级 provenance。测试使用同一事件序列分别驱动 Web 实时状态和 assistant metadata 刷新恢复，再比较二者得到的 SourceView，防止“流式时两张卡片、刷新后只剩一张”之类的语义分叉。

第三组验收验证统计和命名都表达事实而非控制意图。Web Fetch `stats` 只描述本次调用的请求、网络尝试、成功、失败、跳过、Passage 和缓存命中，不决定 Runtime 是否继续。

这套验收可以概括为：用混合失败证明通用调用边界，用 Tool Message 配对证明协议闭合，用实时与恢复对照证明投影一致，用反向断言证明观测读取了正确事实源。这样才能说明 Model-led 不只是接口换名，而是决策权、执行权和观测投影真正完成了职责迁移。

## 13. Connection-Durable Agent Loop

### 13.1 先把表象还原成一致性问题

真实问题最初表现为：用户切换 Session 再切回来后，Tool Activity 与最终正文的展示顺序错了。不能只在前端增加一次排序，因为这个表象同时暴露了多套彼此不一致的“顺序”和“版本”：

1. Event 到达顺序被误当成业务展示顺序；但同一模型响应可能混合 Content 与一个或多个 Tool Call。
2. Snapshot 中的 Projection 与对外 Event sequence 可能不属于同一个逻辑版本。
3. 内存恢复只是最近事件窗口，并不表达“数据库已持久化到哪里、内存从哪里继续”。
4. 客户端可能在 Event 没有成功应用到目标 Session/Message 时就推进 cursor。
5. 旧 Session Detail 或旧 Snapshot 的异步响应可能覆盖更新的 Live Projection。
6. terminal Event 可能先展示，再发现数据库 terminal transaction 失败。
7. cancel、complete、reconciliation 与本地 Executor 之间存在终态竞争。
8. SSE 初始化若先 replay 后注册 subscriber，replay 与 live 之间可能出现丢事件空窗。
9. 前端“新建 Session 后立即提交”还存在 React state 与同步 ref 短暂分叉的独立竞争。

因此根因不是某一个数组 `push` 错了，而是系统没有统一回答三个问题：某个 Event 的传输位置是什么、某个 Block 的业务位置是什么、某个 Snapshot 到底覆盖到哪个版本。

### 13.2 为什么不能让 Run 依附 SSE

早期链路把“执行命令”和“观察结果”合并在一个 `POST chat/stream` 请求里。刷新、路由切换或网络断开会关闭 response，后端很容易把 transport close 误认为用户取消；未完成正文也只存在请求内存，刷新后无法回答这轮任务是否仍在执行。

当前拆成三个独立边界：Create Run 只负责持久化命令并立即返回；Run Executor 只接受 `runId` 并在后台驱动 Runtime；SSE 只订阅 Event Hub。核心不变量是：

```text
SSE close != Run cancel
subscriber count == 0 != Run stop
只有 Cancel API 可以触发用户主动取消
```

这解决的是 Connection Durable：浏览器断线可恢复、切换会话不影响后台生成、刷新能恢复当前结果，并假设 API 进程仍然存活。它不等于服务端进程重启后恢复 Runtime 执行。

### 13.3 方案协商：为什么没有直接上 Event Store 或 Worker

分析初期可以设计成数据库 Event Log、Redis Stream、Worker lease/fencing、Runtime checkpoint resume 和 Tool exactly-once，但用户当前目标只有 Connection Durable。过早引入这些能力会把连接恢复、执行恢复和分布式接管混成一次大重构，增加写放大、运维组件和副作用一致性成本。

最终选择最小充分方案：

```text
PostgreSQL Durable Checkpoint
+ Checkpoint 水位之后的进程内 Event Tail
+ Live SSE
```

数据库不逐 token 保存 Event Log，而是保存完整 Projection、`lastEventSequence` 和 `draftVersion`。内存只保留 `event.seq > checkpointSequence` 的未覆盖尾部；Checkpoint 成功后清理 `event.seq <= committedSequence`，写库期间新产生的 Event 因 sequence 更大而继续留在 Tail。Tail 达软上限时强制 Checkpoint，不能静默淘汰尚未持久化的事件；Checkpoint 持续失败并触及绝对上限时明确使 Run 失败。

因此恢复不是“任意数据库快照 + 最近 500 条事件”，而是具备明确水位关系的：

```text
Checkpoint Projection@N + Event Tail(N, liveSequence] + Live SSE
```

### 13.4 两种顺序：传输顺序不等于业务顺序

实现将顺序拆成两个正交坐标：

```text
eventSequence
  用于传输顺序、SSE cursor、连续性检查、replay 和 Checkpoint 水位

roundSequence + blockSequence
  用于模型轮次和 Content/Tool Call 的稳定业务展示顺序
```

`roundId` 只提供稳定身份，不承担排序。Model Adapter 每次请求创建 Round；Provider 有统一 index 时沿用其顺序，没有统一 index 时按 Block 首次出现分配 `blockSequence`。Conversation Collector 按稳定位置创建或原位更新 Block，禁止按 Event 到达时间直接追加。服务端内部维护 Ordered Rounds，当前 UI 继续消费按 `roundSequence + blockSequence` 确定性展平的 `blocks[]`，因此不用一次性重写前端展示结构。

同一 Round 可以同时包含 Content 与 Tool Call。普通 Tool Round 的 Content 首字立即交付，不为了排序整轮缓冲；Round 结束后才确认语义：存在 Tool Call 时 Content 是工具前言，不存在 Tool Call 时 Content 是最终正文。多个 Tool Call 按 Provider 顺序稳定声明，并继续串行执行。只有强制无工具最终回答阶段仍整轮缓冲并检查协议污染。

### 13.5 Event、Projection 与 Checkpoint 的版本不变量

所有用户可见变化必须经过统一 Event commit：先分配 `eventSequence`，再构造 Event、应用同版本 Projection frame、更新 Live sequence、写入 Tail并广播。禁止先用独立 `onProjection` 修改 Snapshot、之后再发布 Event，因为那会制造“Snapshot 已经包含变化，但 sequence 还没前进”或相反的撕裂版本。

Active Run 同时维护：

```text
liveProjection / liveSequence
durableCheckpoint { projection, sequence, draftVersion }
tailEvents / tailBytes
serialized checkpoint promise / checkpointRequested
```

Checkpoint 捕获不可变 Projection 和精确 sequence，同一 Run 串行写库。Repository 只接受 `sequence/draftVersion` 单调前进的版本，旧写入不能覆盖新状态。这样实时流、`Checkpoint + Tail replay` 与 Latest Live Snapshot 对同一 sequence 都会得到相同的 `blocks[]`。

terminal 的要求更严格：先在内存提交 terminal Event 与 Projection，再用该精确 sequence 执行数据库 terminal CAS/checkpoint，成功后才广播 terminal Event 并关闭订阅；若数据库失败，则回滚尚未广播的 terminal Event 和 Live Snapshot，客户端不能先看到一个无法持久化的成功状态。

### 13.6 Replay、cursor 与客户端防旧写

订阅初始化必须在同一同步临界区内注册 subscriber、捕获 Live sequence 并准备恢复数据，避免 replay 和 live Event 之间的空窗。cursor 被 Tail 连续覆盖时精确 replay `seq > cursor`；cursor 缺失、过旧或存在 gap 时发送 Latest Live Snapshot，再继续 Live SSE。Active Run 已不在内存时只返回 PostgreSQL Durable Snapshot 并结束，不假装恢复执行。

客户端遵守四条规则：

- Snapshot 完整替换对应 Run Projection，但低于当前 cursor 的 Snapshot、Session Detail 和异步 HTTP 返回不得覆盖新状态。
- Event 只有满足 `seq === cursor + 1` 才能应用；重复 Event 忽略，gap 触发 Snapshot 恢复。
- 只有找到目标 Session/Message 且 Event 成功应用后才推进 cursor。
- Session 切换只改变选中视图，不取消后台 observer；Block 按稳定业务坐标插入或原位更新。

前端真实测试还发现了另一个竞争：点击“新建 Session”后立即发送时，旧 render Effect 可能把旧 sessionId 写回 `selectedSessionIdRef`。修复方式不是延迟提交，而是用一个同步 setter 同时更新 React state 和 ref，使命令目标在同一个浏览器任务内保持一致。

### 13.7 幂等、取消和终态 CAS

- Create Run 在事务中创建 user message、空 assistant draft 和 queued Run；`(sessionId, idempotencyKey)` 唯一，同 key 同 payload返回原 Run，不同 payload 返回 `IDEMPOTENCY_CONFLICT`。
- PostgreSQL partial unique index 保证每个 Session 最多一个 `queued/running/cancel_requested` Run；删除 active Session 返回 `SESSION_BUSY`。
- 状态仅允许 `queued -> cancelled`、`running -> cancel_requested`、`running -> completed/failed`、`cancel_requested -> cancelled/failed`，任何 terminal 状态都不能被覆盖。
- queued Run 取消直接进入 `cancelled`；running Run 先持久化 `cancel_requested` 再 Abort 本地句柄。
- reconciliation 通过 owner/status 条件隔离，不终止当前实例仍持有的执行；cancel 与 complete 竞争最终只能有一个合法 terminal 状态。

### 13.8 服务重启为什么不自动续跑

当前是单 API executor 实例，没有 Worker lease、Provider cursor、Tool 副作用幂等和 checkpoint-compatible Runtime。贸然自动重放可能重复调用工具或产生重复副作用。因此每个实例保存 `ownerInstanceId/heartbeat/version`，启动和定时 reconciliation 把遗留 active Run 收敛为 `failed + RUN_INTERRUPTED`，保留已有 draft、Activity 和 Sources，但不伪装成可继续执行。

等进入 Worker 阶段，再独立设计 lease/fencing、Runtime checkpoint、Tool exactly-once 或幂等键以及进程接管。本阶段不引入数据库 Event Log、Redis、Kafka 或 Temporal，是范围控制而不是能力遗漏。

### 13.9 如何验证时序问题真的解决了

验证分三层：

1. Unit 覆盖 Adapter/Runtime 的混合 Content + Tool Call、多 Tool Call、首字即时交付和多 Round 顺序；覆盖 Projection 原位更新、EventHub replay、Checkpoint 并发清理与 Web reducer cursor 规则。
2. Integration 覆盖 Repository 单调写、状态 CAS、terminal transaction、Create/Cancel API 和数据库恢复。
3. 真实浏览器黑盒覆盖真实模型与工具调用、Session 切换、离线重连、刷新、并行 Session、取消、双击提交、移动端和三轮上下文恢复。

只验证静态 Playwright Preview 不能证明真实 Agent Loop 的时序。真实 `agent-browser` 测试不仅确认了 `Round 前言 -> tools -> 下一轮正文 -> final` 的 DOM 顺序，还发现了“新建 Session 后立即发送”的 state/ref 竞争。这个结果说明确定性 reducer 测试负责穷举协议边界，真实黑盒测试负责发现跨网络、React 调度和实际 Provider 行为组合出来的问题，两者不能互相替代。

### 13.10 面试口述版

> 我最初看到的是切换会话后 Tool Activity 和最终回答错位，但没有把它当成单纯前端排序 bug。我先区分传输顺序和业务顺序：`eventSequence` 负责 cursor、replay 和 checkpoint 水位，`roundSequence + blockSequence` 负责模型轮次内 Content 与 Tool Call 的稳定位置；同时建立 Event、Projection 和 Checkpoint 必须属于同一版本的不变量。
>
> 方案讨论时我刻意收窄目标。当前只需要浏览器断线、切会话和刷新恢复，并假设 API 进程存活，所以没有引入 Redis、数据库 Event Store 或进程续跑，而是使用 PostgreSQL Checkpoint + checkpoint 后内存 Event Tail + Live SSE。普通 Tool Round 的 Content 仍即时流式输出，Round 完成后再判断它是工具前言还是最终正文，不牺牲首字速度。
>
> 最后我用 Unit、Integration 和真实浏览器三层验证。真实浏览器在时序主链之外又发现 React state/ref 的立即提交竞争，进一步证明可恢复系统不能只测 reducer，也必须用真实连接、真实会话切换和真实模型工具循环做黑盒验证。

## 14. Context Engineering 与应用层注意力保持

### 14.1 为什么 Context Engineering 不只是截断历史消息

Agent Context 同时包含 System Prompt、用户与 assistant 历史、assistant Tool Calls、Tool Results、Tool Definitions 和最终回答空间。简单按消息条数或字符数截断会产生三个问题：Token 与字符不是固定比例；Tool Call 和 Tool Result 可能被拆散，破坏供应商协议；输入塞满窗口后没有空间生成最终回答。

当前实现把编译放在 Agent Loop 的每个 Model Round 之前：

```text
canonical transcript + tool definitions
  -> 注入已有 compaction summary
  -> DeepSeek V3 tokenizer 估算
  -> 达到 trigger 时压缩封闭历史前缀
  -> 超过 prompt budget 时清理旧 Tool Result
  -> 仍超限则明确失败
  -> compiled messages 发送给模型
```

Prompt Budget 使用：

```text
contextWindowTokens
- maxOutputTokens
- max(4096, contextWindowTokens * 5%)
```

这使“最大输入”不再等同于“模型窗口”，为输出和 tokenizer/provider 差异保留了硬空间。

### 14.2 为什么 Tool Result 在 Context Engineering 层裁剪

Tool Module 应返回完整 canonical 结果，不应该知道当前模型窗口、历史占用或同轮其他工具结果。Runtime 收集同一批 Tool Result 后，由 Context Engineering 扣除 messages 和 Tool Definitions 的固定成本，再对候选结果共享分配剩余预算；裁剪使用首尾保留并写入原始 token 数标记。

职责边界是：

```text
Tool Module          负责能力执行和完整结果
Agent Runtime        负责调用顺序和协议配对
Context Engineering 负责进入模型前的预算与裁剪
Model Adapter        负责供应商请求编码
```

Runtime 必须先保存 `assistant(toolCalls)`，再按相同声明顺序保存每个 `tool(result)`。Context Engineering 可以缩短 Tool Result 内容，但不能重排、删除配对关系或把 Tool Result 变成普通 assistant 文本。

### 14.3 历史压缩为什么只处理封闭前缀

当前压缩保留最近 12 条消息，并向前移动边界以避免从 Tool Result 中间切开工具协议。只把边界之前尚未覆盖的历史交给模型生成 continuation summary。Run 内的 `summary + coveredMessageCount + version + tokenCount` 由 Runtime 保存在内存，后续 Round 用一条 `<compaction_summary>` system message 替代已覆盖前缀；只有 Run 成功结束才在 terminal transaction 中保存为 Session 正式状态，失败、取消或进程中断时不写入。

压缩可能在一个长 Agent Loop 中触发多次。每次只总结上次覆盖位置之后的新封闭前缀，并把旧摘要一并提供给摘要模型，因此不是不断重新总结完整历史。

### 14.4 模型 Attention 与应用层 Goal Reminder 的区别

Transformer Attention 是模型内部机制，应用无法在 Prompt 编排层修改。工程上所说的 Attention Refresh、Goal Reminder 或 Context Anchoring，是在长 Agent Loop 的特定节点重新注入任务锚点，降低大量 Tool Result 和中间步骤对原始目标的稀释，例如：

```text
Original request
Current objective
Completed work
Unresolved work
Important constraints
Next expected action
```

它属于 Context Engineering，但当前没有实现。原因不是它没有价值，而是 Goal Reminder 需要知道哪些信息是当前目标、进度和未完成项；在 Skills、Memory、`NOTES.md`、`TODO.md` 尚未形成事实源和生命周期之前，提前建设通用 Attention Engine 只能机械重复原始问题，既增加 token，也可能强化过时目标。

后续合理的触发点包括压缩之后、长 Loop 每 N 轮、进入最终回答之前，或者真实数据证明模型发生目标漂移时。实现位置应在 `ContextEngineeringService.compileRound()`，而不是 Tool Module 或 Model Adapter。

### 14.5 为什么当前阶段选择冻结

第一阶段已经解决容量安全和协议正确性：精确估算、输出预留、Tool Result 裁剪、历史压缩、超限失败和调试快照。下一阶段先建设 Skills、Memory 和文件化任务状态；有真实多来源 Context 后，再迭代相关性选择、优先级排序、预算分配和 Goal Reminder。这个顺序避免为不存在的数据源提前设计 Fragment DSL、审计流水或复杂策略引擎。

### 14.6 面试口述版

> 我把 Context Engineering 放在每个 Model Round 之前，而不是只在会话开始时处理一次。系统用本地 DeepSeek V3 tokenizer 对消息和工具定义统一计量，先为最大输出和安全边界留空间，再决定是否压缩封闭历史；同轮大型 Tool Result 则由 Context 层共享分配剩余预算，Runtime 继续保证 Tool Call 与 Tool Result 的配对顺序。
>
> 我也区分模型内部 Attention 和应用层注意力保持。后者本质是在长 Loop 中重新注入目标、进度与约束，属于 Context Engineering，但当前没有提前实现。因为 Skills、Memory、NOTES 和 TODO 还没有形成真实 Context 来源，现在做通用 Attention Engine 容易过度设计。第一阶段先保证容量和协议正确，等多来源 Context 落地后再基于真实目标漂移问题建设选择、优先级和 Goal Reminder。

## 15. 面试表达模板

### 问：你在这个项目中负责了什么？

答：我先搭建了 pnpm monorepo 和 React/Vite + NestJS + Prisma/PostgreSQL 的工程基线，再通过 OpenAI 官方 SDK 的 `baseURL` 接入 OpenAI-compatible 对话。当前完成了 Session/Message/Run/Step 持久化、Function Calling Agent Loop、Search/Fetch 有界联网调查、Activity/Sources 投影、客户端断线可恢复的 Durable Run，以及 Model Round 级 Context 编译、预算、裁剪和压缩。服务重启自动续跑和多实例 Worker lease 仍明确不在当前范围。

### 问：SSE 为什么没有直接使用 WebSocket？

答：事件主体仍是服务端单向推送，SSE 的部署和消费模型更简单；Create、Cancel 等客户端动作使用独立 HTTP command，不需要为了少量双向动作升级整条连接。恢复依赖 run-scoped sequence、Last-Event-ID、Checkpoint 水位后的 Event Tail 和 snapshot fallback，而不是恢复原 TCP 连接。未来若高频 steer 或多端协作成为主要需求，再评估 WebSocket。

### 问：为什么上下文由后端从 PostgreSQL 读取？

答：如果由 Web 回传完整历史，前端缓存会变成事实来源，刷新恢复、后台多会话流和未来多端访问都容易产生分叉。现在 Web 只提交本轮 content，API 先持久化 user message，再读取最近 20 条数据库历史。前端缓存只负责低延迟投影，流完成后由详情接口覆盖。

### 问：流式输出时如何保证用户消息立即出现？

答：提交时先完成本地状态事务：追加 user message、创建空 assistant 占位并清空输入框；网络请求只负责向已有 assistant message 追加 delta。这样 UI 不依赖模型完成时机，供应商失败时也不会丢失用户刚提交的内容。

### 问：Function Calling 是模型自己的 Agent Loop 吗？

答：模型只决定“返回最终文本”还是“返回工具名称和参数”，真正的 Loop 由应用实现。后端聚合分片参数、校验、执行工具、把结果放回上下文，再请求下一轮模型。20 次 Tool Call 上限、超时、取消和安全校验都必须由应用强制。

### 问：为什么 Web Fetch 不直接把整个网页放进上下文？

答：整页 HTML 同时包含脚本、导航、模板噪声和大量无关文本，直接注入会浪费上下文并放大 Prompt Injection。当前先提取 canonical Markdown，再做质量门、结构切块和 query-aware 排序，只返回可定位的抽取式 Passage。这是来源侧的安全阀；进入 Agent Loop 后，Context Engineering 还会统一计算 messages、Tool Definitions、Tool Results 和输出预留。

### 问：为什么取消 Agent 总超时，不会导致工具无限调用？

答：取消的是整个 run 的墙上时钟，不是取消所有边界。单次模型和 Tool 仍有独立超时，用户取消会立即传播；每个 assistant run 还有 20 次 Tool Call 上限。达到上限后，最终回答请求完全不发送工具定义，并在服务端缓冲校验。因此正常复杂任务不会被累计耗时误杀，异常循环也仍然确定收敛。历史版本中的 Web URL/Passage/无新增内容边界已经删除，不应再作为当前目标架构讲解。

### 问：DeepSeek V4 既然兼容 OpenAI API，为什么还需要专门的 Model Adapter 优化？

答：兼容的是请求外形，不代表上下文语义完全相同。DeepSeek Thinking + Tool Calling 要求历史工具轮携带原生 `reasoning_content`，否则 Tool Call 上下文可能不完整；但最终回答的 reasoning 又不应在后续轮次反复回放。我在 Adapter 中解码流式 reasoning，Runtime/Repository 保存供应商无关的 canonical transcript，请求编译时只对包含 Tool Call 的 assistant 消息恢复 `reasoning_content`，最终回答只发送正文。同时按 provider 和 reasoning format 校验真正需要 native replay 的工具单元，并把 raw reasoning 排除在用户 SSE 和 UI 之外。

### 问：为什么 Context Engineering 要在每个 Model Round 执行？

答：Agent Loop 每轮都会新增 assistant Tool Call 和 Tool Result，输入规模和结构持续变化，只在 Run 开始时计算一次预算会失真。当前每轮先注入已有摘要，再统一估算 messages 与 Tool Definitions；需要时压缩历史，保证 Tool Call/Result 协议完整，并为最终输出保留固定空间。

### 问：为什么现在不实现 Goal Reminder 或注意力刷新？

答：它属于应用层 Context Engineering，不是模型内部 Attention。它应该重新注入当前目标、已完成工作、未完成项和关键约束，而不只是机械重复原始问题。Skills、Memory、NOTES 和 TODO 尚未建立事实源与生命周期时，提前做通用 Attention Engine 很容易固化错误抽象；当前先解决容量和协议正确性，等真实多来源 Context 与目标漂移问题出现后再实现。

## 16. 后续追加规则

每个阶段只追加四类内容：

1. 实际使用的技术和边界。
2. 真实遇到的 bug 或设计难点。
3. 采取的解决方案和取舍。
4. 可以被测试或代码引用验证的面试表述。

没有实际难点的阶段只记录技术点和当前限制，不强行制造“挑战”。
