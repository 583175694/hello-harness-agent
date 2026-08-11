# 阶段面试知识点

> 文档用途：记录本项目已经真实实现过的工程知识点，作为面试复盘和项目讲解提纲。
>
> 维护原则：只记录当前代码已经验证的内容；没有真实难点时不强行包装。每完成一个阶段，再追加对应章节。
>
> 当前覆盖：工程基线、OpenAI-compatible 模型适配、持久化对话、Function Calling Agent Loop、Search/Fetch 联网调查、真实 Workbench 投影，以及 Connection-Durable Agent Loop 的 Run/Step、snapshot、SSE replay、cancel 和重启中断收敛。

## 1. 项目一句话介绍

这是一个基于 pnpm workspace 的本地单用户 Agent 工作台：前端使用 React/Vite，后端使用 NestJS，数据层使用 Prisma/PostgreSQL，当前已经打通持久化对话、Function Calling Agent Loop、`web_search -> web_fetch -> 相关 Passage -> 普通回答`、Connection-Durable Run 和可断线恢复的 Conversation/Workbench。

面试时需要主动区分：

```text
已经完成：持久化 Session/Message/Run/Step、后台 Agent Runtime、Run SSE sequence/replay、draft snapshot、独立 cancel、Search/Fetch 和 Workbench 恢复
尚未完成：服务重启后续跑、多实例 Worker lease、Context Compiler、正式 Evidence/Citation、Memory 和 Delegation
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

当前恢复同时使用 assistant draft metadata、Run snapshot 和进程内 replay window。Workbench 的 open/tab/focus/pinned 属于本地选择，不被 server snapshot 覆盖；blocks、execution、source 和 Run 状态属于服务端投影。系统实现了真实 cancel，但 steer、pause 和跨进程 Event Store 仍不在当前范围。

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

这一修正接受模型可能重复读取来源或执行效率下降的代价。此类问题先由 Eval 的效率评分和人工复核观测，不再预置隐藏 planner；只有真实数据表明存在安全、成本或平台稳定性风险时，才增加工具无关、不可由模型覆盖的硬边界。

### 12.5 关键取舍

这个方案没有追求一次性解决所有极端情况。当前阶段没有加入总 Token/成本预算、相似查询检测、供应商熔断、证据评分、持久化 Run State 或分布式任务恢复。原因是这些机制需要更多运行数据才能确定正确策略，过早引入会增加状态组合、误判和排障成本。

目前接受一个明确限制：如果搜索供应商持续失败，模型仍可能重复搜索，直到消耗完 20 次通用工具额度。它不够高效，但运行一定会收敛，并且完整上游错误原因会进入服务端日志。等 Harness Agent、评测集和运行观测完善后，再根据真实失败分布决定是否增加熔断或成本预算。

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

第一组验收验证 Tool Call 的计数与消息闭合。Runtime 计数的是模型声明的 Tool Call，而不是成功执行数或 `tool.started` 事件数；成功、结构化失败、非法参数、未知 Tool 和同一 assistant 响应中的多个调用都要占用额度。第 21 次调用不执行，但仍要补齐 `TOOL_CALL_LIMIT_EXCEEDED` Tool Message，确保模型声明的每个 Tool Call 都有对应结果，随后再进入无工具最终回答。持久化的 `agent.toolCallCount` 是 Eval 的调用次数事实源，不能用只覆盖真实启动执行的 `tool.started` 数量代替。

第二组验收验证双层投影。Execution 保存每次真实发生的 Search/Fetch，不做跨调用去重；Source snapshot 则按 requested/final/normalized URL 或 `contentHash` 归并为一条 canonical source，并聚合 `toolCallIds` 与更高优先级 provenance。测试使用同一事件序列分别驱动 Web 实时状态和 assistant metadata 刷新恢复，再比较二者得到的 SourceView，防止“流式时两张卡片、刷新后只剩一张”之类的语义分叉。

第三组验收验证统计和命名都表达事实而非控制意图。Web Fetch `stats` 只描述本次调用的请求、网络尝试、成功、失败、跳过、Passage 和缓存命中，不决定 Runtime 是否继续。评测指标原名 `modelProposedFetchCount` 容易被误解为 Fetch 调用次数，实际统计的是最终 source snapshot 中 provenance 为 `model_proposed` 的 canonical fetched source 数量，因此改为 `modelProposedSourceCount`。

这套验收可以概括为：用混合失败证明通用调用边界，用 Tool Message 配对证明协议闭合，用实时与恢复对照证明投影一致，用反向硬规则证明 Eval 读取了正确事实源。这样才能说明 Model-led 不只是接口换名，而是决策权、执行权和观测投影真正完成了职责迁移。

## 13. Connection-Durable Agent Loop

### 13.1 为什么不能让 Run 依附 SSE

早期链路把“执行命令”和“观察结果”合并在一个 `POST chat/stream` 请求里。刷新、路由切换或网络断开会关闭 response，后端很容易把 transport close 误认为用户取消；未完成正文也只存在请求内存，刷新后无法回答这轮任务是否仍在执行。

当前拆成三个独立边界：Create Run 只负责持久化命令并立即返回；Run Executor 只接受 `runId` 并在后台驱动 Runtime；SSE 只订阅 Event Hub。核心不变量是：

```text
SSE close != Run cancel
subscriber count == 0 != Run stop
只有 Cancel API 可以触发用户主动取消
```

### 13.2 为什么 PostgreSQL 和内存 Event Hub 同时存在

逐 token 写 PostgreSQL 会产生高频小事务、写放大和大量低价值事件，因此 PostgreSQL 只保存 Run/Step、完整 assistant draft、blocks、execution/source projection 和 terminal 状态。正文约每 1 秒或新增约 1 KiB flush，Tool/Run 语义边界立即持久化。

进程内 Event Hub 负责低延迟广播、run-scoped sequence、最多 500 条且约 2 MiB 的 Ring Buffer、多 subscriber 和有界队列。cursor 仍在窗口时 replay `seq > cursor`；过期时发送完整 `run.snapshot`，客户端替换服务端投影后再接 live tail。这里的 snapshot 用于恢复 UI，不是恢复模型执行的 checkpoint。

### 13.3 一致性、幂等和取消

- Create Run 在一个事务中创建 user message、空 assistant draft 和 queued Run；`(sessionId, idempotencyKey)` 唯一，同 key 同 payload 返回原 Run，不同 payload 返回 `IDEMPOTENCY_CONFLICT`。
- PostgreSQL partial unique index 保证每个 Session 最多一个 `queued/running/cancel_requested` Run；删除 active Session 返回 `SESSION_BUSY`。
- completed/failed/cancelled 使用 terminal transaction 同时更新 Run 和 assistant delivery，失败或取消草稿保留展示，但不会进入后续模型历史。
- Cancel 先持久化 `cancel_requested`，再 Abort 本进程执行句柄；Cancel 与 Executor 启动都使用条件状态更新，避免已取消 Run 被重新改回 running。

### 13.4 服务重启为什么不自动续跑

当前是单 API executor 实例，没有 Worker lease、Provider cursor、Tool 副作用幂等和 checkpoint-compatible Runtime。贸然自动重放可能重复调用工具或产生重复副作用。因此每个实例保存 `ownerInstanceId/heartbeat/version`，启动和定时 reconciliation 把遗留 active Run 收敛为 `failed + RUN_INTERRUPTED`，保留已有 draft、Activity 和 Sources，但不伪装成可继续执行。

### 13.5 面试口述版

> 我把原来依附一次 Chat SSE 请求的 Tool Loop 改成了独立 Durable Run。Create API 在事务里创建用户消息、assistant draft 和 queued Run 后立即返回，后台 Executor 只按 runId 驱动 Runtime，SSE 只是可随时断开重建的观察通道。PostgreSQL 保存 Run、语义 Step 和阶段性完整 draft，内存 Event Hub 保存 sequence、snapshot 和有限 replay window，所以刷新后可以先恢复 snapshot，再用 Last-Event-ID 接续事件。
>
> 我没有把每个 token 持久化，也没有引入 Redis。token delta 只走内存广播，正文按时间、大小和 Tool/terminal 边界合并写库。Cancel 是独立持久化命令，SSE close 不会传播 Abort。服务重启后当前也不自动重放，因为缺少 lease、checkpoint 和副作用幂等；遗留 Run 会明确标成 RUN_INTERRUPTED。这让连接恢复、执行恢复和分布式接管三个问题保持清晰边界。

## 14. 面试表达模板

### 问：你在这个项目中负责了什么？

答：我先搭建了 pnpm monorepo 和 React/Vite + NestJS + Prisma/PostgreSQL 的工程基线，再通过 OpenAI 官方 SDK 的 `baseURL` 接入 OpenAI-compatible 对话。当前完成了 Session/Message/Run/Step 持久化、Function Calling Agent Loop、Search/Fetch 有界联网调查、Activity/Sources 投影，以及客户端断线可恢复的 Durable Run。服务重启自动续跑和多实例 Worker lease 仍明确不在当前范围。

### 问：SSE 为什么没有直接使用 WebSocket？

答：事件主体仍是服务端单向推送，SSE 的部署和消费模型更简单；Create、Cancel 等客户端动作使用独立 HTTP command，不需要为了少量双向动作升级整条连接。恢复依赖 run-scoped sequence、Last-Event-ID、Ring Buffer 和 snapshot，而不是恢复原 TCP 连接。未来若高频 steer 或多端协作成为主要需求，再评估 WebSocket。

### 问：为什么上下文由后端从 PostgreSQL 读取？

答：如果由 Web 回传完整历史，前端缓存会变成事实来源，刷新恢复、后台多会话流和未来多端访问都容易产生分叉。现在 Web 只提交本轮 content，API 先持久化 user message，再读取最近 20 条数据库历史。前端缓存只负责低延迟投影，流完成后由详情接口覆盖。

### 问：流式输出时如何保证用户消息立即出现？

答：提交时先完成本地状态事务：追加 user message、创建空 assistant 占位并清空输入框；网络请求只负责向已有 assistant message 追加 delta。这样 UI 不依赖模型完成时机，供应商失败时也不会丢失用户刚提交的内容。

### 问：Function Calling 是模型自己的 Agent Loop 吗？

答：模型只决定“返回最终文本”还是“返回工具名称和参数”，真正的 Loop 由应用实现。后端聚合分片参数、校验、执行工具、把结果放回上下文，再请求下一轮模型。20 次 Tool Call 上限、超时、取消和安全校验都必须由应用强制。

### 问：为什么 Web Fetch 不直接把整个网页放进上下文？

答：整页 HTML 同时包含脚本、导航、模板噪声和大量无关文本，直接注入会浪费上下文并放大 Prompt Injection。当前先提取 canonical Markdown，再做质量门、结构切块和 query-aware 排序，只返回可定位的抽取式 Passage。这是 Context Compiler 前的最小上下文安全阀，不等同于完整 Context Engineering。

### 问：为什么取消 Agent 总超时，不会导致工具无限调用？

答：取消的是整个 run 的墙上时钟，不是取消所有边界。单次模型和 Tool 仍有独立超时，用户取消会立即传播；每个 assistant run 还有 20 次 Tool Call 上限。达到上限后，最终回答请求完全不发送工具定义，并在服务端缓冲校验。因此正常复杂任务不会被累计耗时误杀，异常循环也仍然确定收敛。历史版本中的 Web URL/Passage/无新增内容边界已经删除，不应再作为当前目标架构讲解。

## 15. 后续追加规则

每个阶段只追加四类内容：

1. 实际使用的技术和边界。
2. 真实遇到的 bug 或设计难点。
3. 采取的解决方案和取舍。
4. 可以被测试或代码引用验证的面试表述。

没有实际难点的阶段只记录技术点和当前限制，不强行制造“挑战”。
