# 阶段面试知识点

> 文档用途：记录本项目已经真实实现过的工程知识点，作为面试复盘和项目讲解提纲。
>
> 维护原则：只记录当前代码已经验证的内容；没有真实难点时不强行包装。每完成一个阶段，再追加对应章节。
>
> 当前覆盖：工程基线、OpenAI-compatible 模型适配、持久化对话、Chat SSE、会话并发隔离、Function Calling Agent Loop、Search/Fetch 联网调查与真实 Workbench 投影。

## 1. 项目一句话介绍

这是一个基于 pnpm workspace 的本地单用户 Agent 工作台：前端使用 React/Vite，后端使用 NestJS，数据层使用 Prisma/PostgreSQL，当前已经打通持久化对话、Function Calling Agent Loop、`web_search -> web_fetch -> 相关 Passage -> 普通回答` 和可刷新恢复的 Workbench。

面试时需要主动区分：

```text
已经完成：持久化 Session/Message、Chat SSE、简化 Agent Runtime、Search/Fetch、Workbench 实时投影与消息快照恢复
尚未完成：durable Run/Step/Event、断线 replay、Context Compiler、正式 Evidence/Citation、Memory 和 Delegation
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

这仍是 Chat SSE，不是 durable Agent Run Event SSE。当前已传递文本增量、工具生命周期和消息完成事件，但还没有：

- run-scoped sequence
- 断线重连和 replay
- steer/cancel event
- 跨进程的活动 Run 恢复

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

当前恢复依赖最终 assistant metadata 的轻量 execution/source 快照，不是 Agent Event Store。因此已完成的消息可刷新恢复，正在运行的任务仍没有断线 replay、run-scoped sequence 或真实 steer/cancel。

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

OpenAI-compatible 流中的函数名和 JSON arguments 都可能跨 chunk 返回，因此必须按 tool-call `index` 累加，等本轮结束后再解析，不能对单个 delta 直接 `JSON.parse`。同一模型响应含多个调用时按返回顺序串行执行，使用 20 次通用工具硬上限防止失控，但不要求模型用满预算。

工具层拆成稳定的通用边界：

```text
AgentTool             定义名称、Function Schema、可用性和 execute
Tool Catalog          作为工具白名单与唯一注册入口
Tool Registry         负责发现、JSON/Zod 校验和分派
Agent Runtime         负责模型-工具循环、通用预算、超时和终止
Tool implementation   只负责具体能力和自己的业务不变量
```

新增工具时，只需实现 `AgentTool` 并加入 Catalog，Registry 和 Runtime 不应出现 `if (toolName === ...)` 式的业务执行逻辑。Prompt 负责引导模型何时用工具，具体 Tool/Executor 负责强制权限、参数、来源和资源不变量；不能把安全性寄托在 Prompt 上。

通用 Runtime 把执行过程转换为 `tool.started/completed/failed/cancelled`，Conversation 和 Workbench 只消费这些 canonical lifecycle event，不解析 OpenAI 原始 chunk 或具体 Provider 响应。当前这仍是 Chat SSE 投影，不是 durable Run Event Store。

## 10. Web Search：Clue 发现与搜索投影

模型只看到统一的 `web_search({query})`，不能选择 Provider、API 地址、密钥或供应商私有参数。后端 `SearchService` 再根据配置路由到 Bocha 或 Serper Adapter，并统一归一化为标题、URL、domain、snippet、publishedAt 和 source。当前单次最多返回 10 条，不做 fallback、并行 Provider 或分页。

搜索标题和摘要只是 `clue`，目的是帮助模型选择值得读正文的 URL，不是直接冒充事实依据。Search 成功后会把 clue URL 登记到当前 Run Ledger，成为 Fetch 可接受的候选；用户当前消息中的 HTTP/HTTPS 直链也可以直接登记。模型自行猜测的 URL 在网络请求前被拒绝。

Search 和 Fetch 在可用时同时暴露，调用顺序由模型决定，不把 Agent Loop 写死成固定流程。Prompt 引导没有直链的联网任务先搜索，执行层则通过 URL provenance 确保只读取用户直链或真实 clue。

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

### 11.2 Run-scoped 资源台账与平稳早停

单次 Fetch 的 `maxItems` 不能约束多轮 Agent Loop。General Web Research V1 因此为每个 Runtime run 创建独立 `RunResourceLedger`，累计唯一初始 URL、final/normalized URL alias、contentHash、网络尝试、成功文档和注入 Passage 字符。运行状态不放在 singleton Tool/Service 上，避免并发会话互相污染。

预算超限和网络失败不是同一语义。批次只有部分 URL 能被接受时，前缀继续执行，其余以 `skipped` 返回；重复 URL 或重复正文也是 `skipped`，不伪装成上游错误。连续两次 Fetch 没有新增唯一文档，或者触及 URL、Passage 或调查时间边界后，Runtime 动态移除 Search/Fetch，再给模型一次无工具最终回答机会。这使“安全停止”成为可交付状态，而不是连续红色失败。

调查 deadline 与用户 Abort 必须分开：内部 deadline 触发后使用已有材料作答；用户主动取消或 SSE 断开则立即中止，不生成和持久化一份用户不再需要的最终回答。

### 11.3 轻量 Source 语义不等于 Evidence

搜索标题和 snippet 是 `clue`，成功读取并经质量门/相关性筛选的网页是 `fetched`。最终回答完成后，后端抽取回答中的 HTTP/HTTPS URL，执行去 fragment、tracking 参数和参数排序的同一规范化，再确定性设置 `used`。`used=true` 只表示回答采用了该链接，不能表述成“该来源逐句支撑了某个事实”。这个边界以很低的复杂度给通用 Agent 提供真实来源透明度，同时不冒充后续 Deep Research 的 Evidence/Citation Validator。

### 11.4 网页内容是数据，不是指令

Search snippet 和 Fetch Passage 都以带 `untrustedExternalData` 语义的独立 tool message 进入模型上下文。网页里的“忽略原有指令”、角色声明、工具调用要求或外链都只是不可信数据，不能改变 system prompt、工具集、预算、完成条件或 URL 来源规则。完整 Raw HTML、Cookie、Authorization、API Key 和内部 prompt 不进入模型或 Workbench。

这里需要区分两种不可信内容：前端的“不可信 Markdown”解决渲染与链接安全；Agent 上下文中的“不可信 Tool Result”解决 Prompt Injection 和能力边界。两者的信任边界不同，不能只做 HTML sanitization 就宣称解决了 Agent Prompt Injection。

## 12. 面试表达模板

### 问：你在这个项目中负责了什么？

答：我先搭建了 pnpm monorepo 和 React/Vite + NestJS + Prisma/PostgreSQL 的工程基线，再通过 OpenAI 官方 SDK 的 `baseURL` 接入 OpenAI-compatible 对话。当前完成了 Session/Message 持久化、Chat SSE、会话级并发隔离、Function Calling Agent Loop、Search/Fetch 有界联网调查，以及 Activity/Sources 的实时 Workbench 投影和消息快照恢复。当前 Runtime 仍是单次 Chat 请求内的非持久化循环，不冒充 durable Run/Event Store。

### 问：SSE 为什么没有直接使用 WebSocket？

答：当前阶段是服务端单向推送文本 delta，客户端只需要提交一次请求并接收增量结果，SSE 的语义和 HTTP 部署链路更简单。后续 Agent Run 需要 steer/cancel、双向控制和事件恢复时，会重新评估控制请求与事件流的组合，而不是把当前 Chat SSE 直接当成完整 Agent 协议。

### 问：为什么上下文由后端从 PostgreSQL 读取？

答：如果由 Web 回传完整历史，前端缓存会变成事实来源，刷新恢复、后台多会话流和未来多端访问都容易产生分叉。现在 Web 只提交本轮 content，API 先持久化 user message，再读取最近 20 条数据库历史。前端缓存只负责低延迟投影，流完成后由详情接口覆盖。

### 问：流式输出时如何保证用户消息立即出现？

答：提交时先完成本地状态事务：追加 user message、创建空 assistant 占位并清空输入框；网络请求只负责向已有 assistant message 追加 delta。这样 UI 不依赖模型完成时机，供应商失败时也不会丢失用户刚提交的内容。

### 问：Function Calling 是模型自己的 Agent Loop 吗？

答：模型只决定“返回最终文本”还是“返回工具名称和参数”，真正的 Loop 由应用实现。后端聚合分片参数、校验、执行工具、把结果放回上下文，再请求下一轮模型。工具预算、超时、取消和安全校验都必须由应用强制。

### 问：为什么 Web Fetch 不直接把整个网页放进上下文？

答：整页 HTML 同时包含脚本、导航、模板噪声和大量无关文本，直接注入会浪费上下文并放大 Prompt Injection。当前先提取 canonical Markdown，再做质量门、结构切块和 query-aware 排序，只返回可定位的抽取式 Passage。这是 Context Compiler 前的最小上下文安全阀，不等同于完整 Context Engineering。

## 13. 后续追加规则

每个阶段只追加四类内容：

1. 实际使用的技术和边界。
2. 真实遇到的 bug 或设计难点。
3. 采取的解决方案和取舍。
4. 可以被测试或代码引用验证的面试表述。

没有实际难点的阶段只记录技术点和当前限制，不强行制造“挑战”。
