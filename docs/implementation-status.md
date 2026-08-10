# Implementation Status

> 文档类型：研发状态快照。它记录当前代码、验证结果和已知限制，不替代产品契约、架构文档或实施计划。
>
> 最后更新：2026-08-11

## 1. 当前结论

项目已经完成工程基线、持久化普通对话和 General Web Research V1。模型可以通过 Bocha 或 Serper 发现网页线索，再批量读取 1-5 个公开静态网页的可定位相关原文；当前每轮受 25 个唯一 URL、60,000 字符 Fetch Passage 和最多 20 次工具调用等结构性边界约束，不再设置整个 Agent run 的 wall-clock 总截止时间。

当前状态可以描述为“P7 已完成，进入 P8 Evaluation / Release Hardening”：有界联网调查闭环已具备独立真实黑盒评测工具，可以用固定题集检查生产 Session、Chat SSE、Search/Fetch、最终回答和持久化快照。正式 Evidence、`[Sx]`、报告 Artifact 和引用校验保留给后续 Deep Research；Run/Event Store、Context Compiler、steer/cancel 和搜索 fallback 仍未实现。

## 2. 从空项目到当前 Agent 的阶段演进

这一节记录的不是功能清单，而是每个实际阶段面对的问题、采取的方案、留下的边界和下一步动因。它用于解释项目为什么演进成现在的形态，避免后续只看到最终代码而丢失关键工程判断。

### 阶段一：从空仓库到可运行工程基线

**当时的问题**：项目没有可启动的 Web/API、数据库、共享协议、配置校验和测试入口。此时直接开发 Agent Loop，会把业务问题与环境、协议和部署问题混在一起，后续无法判断失败来自模型还是工程基线。

**解决方式**：建立 pnpm monorepo、React/Vite、NestJS、Prisma/PostgreSQL、共享协议包、环境变量校验、健康检查、日志脱敏、Vitest、integration test 和 Playwright 基线。生产 `/agent` 只展示真实空状态和明确的 capability unavailable；复杂 Workbench 状态先放在 development-only Preview，不用假数据冒充生产能力。

**阶段结果**：仓库从空项目变成了可以确定性安装、启动、检查和部署的应用骨架。前后端、协议、数据库和测试的责任边界先于智能能力稳定下来。

**仍未解决**：没有真实模型、会话、流式回答或 Agent 行为。下一阶段需要先打通最小 AI 对话闭环，而不是同时引入工具、Memory 和多 Agent。

### 阶段二：从普通 HTTP 接口到基础 AI 对话

**当时的问题**：模型供应商存在 base URL、模型名和流式协议差异；如果前端直接依赖供应商响应，Provider chunk、错误结构和密钥边界会扩散到整个系统。非流式回答又无法满足长生成过程中的用户反馈。

**解决方式**：使用 OpenAI 官方 SDK 接入 OpenAI-compatible Chat Completions，并通过项目内 `ModelAdapter`、canonical message 和模型事件隔离供应商协议。API 把模型文本转换为 Chat SSE，Web 使用乐观 user message 和空 assistant 占位实时追加 delta；长度截断、供应商失败和客户端断开都有明确失败语义。

**阶段结果**：形成了“用户提交 -> 后端模型调用 -> SSE 增量回答”的真实基础 AI 对话，模型与 Web 不再直接耦合。

**仍未解决**：对话历史仍需要可靠事实源，会话刷新、切换、并发和失败后的数据一致性尚未解决。下一阶段需要先把 Session/Message 持久化做扎实。

### 阶段三：从一次性对话到可恢复会话

**当时的问题**：如果由前端回传完整历史，浏览器缓存会成为上下文事实源；刷新、后台生成、会话切换和未来多端访问都可能产生历史分叉。流式过程中先写什么、失败时保存什么也缺少确定性规则。

**解决方式**：PostgreSQL 成为 Session/Message 权威来源，Web 只提交当前用户内容；API 先持久化 user message，再读取数据库最近 20 条消息，完整 assistant 回答成功后才落库。增加 session-scoped 执行注册表、会话 CRUD、标题生成、级联删除、前端分会话缓存和 URL 恢复。失败时保留用户已提交事实，但不持久化不完整 assistant 内容。

**阶段结果**：普通 AI 对话具备刷新恢复、会话切换、并发隔离和确定性持久化语义，前端缓存回归为低延迟投影而不是事实源。

**仍未解决**：模型只能依靠已有对话知识回答，不能主动获取外部信息。下一阶段需要引入 Function Calling，但必须由应用拥有循环、校验和预算，而不是把工具执行权交给模型或前端。

### 阶段四：从 AI 对话到会调用工具的 Agent

**当时的问题**：模型返回的 Function Calling 参数可能跨 chunk、JSON 不完整、工具不存在或参数无效；同一响应还可能声明多个调用。只有 `tools` 参数而没有应用侧循环、权限、预算和生命周期，就不是可控 Agent。

**解决方式**：实现 `AgentRuntimeService`、Tool Catalog、通用 Registry 和 `AgentTool` 契约。Runtime 聚合 tool-call chunk、解析并校验参数、串行执行工具、把 assistant tool-call message 与 tool result 放回上下文，再让模型继续决策。加入 20 次通用工具调用上限、取消传播、工具生命周期事件和 Workbench Activity/Sources 投影；首个真实工具是统一 Provider 边界后的 `web_search`。后续重构进一步引入通用 `ToolRunState`、`logFields` 和控制意图，移除 Runtime 对具体工具名称、输入输出、领域预算和指标的理解；工具领域自行维护运行状态，Registry 和 Runtime 只负责通用发现、校验、执行与编排。

**阶段结果**：系统从“模型生成文本”升级为“模型决定下一步、应用确定性执行并继续循环”的基础 Agent，用户可以看到真实工具进度和搜索 clue。Runtime 最终收敛为工具中立编排器，新增工具原则上只需要实现 `AgentTool`、自己的领域状态并加入 Catalog，不需要修改核心循环。

**仍未解决**：搜索摘要只是线索，模型没有真正读取网页正文；重复 URL、模型自造 URL、低质量页面和上下文膨胀仍可能损害回答。下一阶段需要建设有界 Web Fetch 和来源语义。

### 阶段五：从搜索 Agent 到有边界的 General Web Research

**当时的问题**：直接把网页 HTML 注入模型会带来脚本/导航噪声、Prompt Injection、上下文浪费和无法定位原文；多轮 Fetch 还会绕过单次限制，重复读取 URL 或正文，并在无新信息时继续消耗资源。

**解决方式**：实现 `web_fetch` 的 URL/DNS/redirect guard、Crawlee 有界获取、Readability 正文提取、canonical Markdown、Document Quality Gate、字符 n-gram 相关性筛选和可定位 Passage。通过 run-scoped `WebResearchRunState` 限制 URL 来源，只允许用户直链或 Search clue，并累计 25 个 URL、60,000 Passage 字符、URL/contentHash 去重和连续两次无新增内容早停。Workbench 区分 clue、fetched 和轻量 used 来源。

**后续加固**：在能力闭环完成后，本阶段继续删除会误伤健康长任务的 Agent run 总截止时间，保留普通模型单轮 120 秒、最终回答单轮 30 秒、Search 10 秒、Fetch 20 秒和用户取消；用 20 次通用工具调用及 Web Research 自己的 URL/Passage/无新增内容边界保证结构性收敛。最终回答完全省略工具定义，服务端整轮缓冲并校验空响应、长度截断、结构化工具调用和 DSML，污染时整轮丢弃并最多重试一次；上游失败日志保留脱敏后的真实原因、HTTP 状态、请求 ID、上游地址和响应摘要。

**阶段结果**：形成了 `search -> fetch -> relevant passages -> answer` 的完整联网调查闭环。Agent 不只“搜到链接”，而是基于真正读取过的公开静态网页完成普通回答，并能在部分来源失败时继续交付。健康长任务不再被总时钟误杀，单操作故障仍能隔离；异常工具循环有确定上限；协议污染不会进入 SSE、数据库或后续上下文；Search 和 Fetch 在同一次 run 内共享 Web Research 状态但不污染并发会话。

**当前仍未解决**：

- 首次真实 Smoke 只有 2/6 题通过硬规则；直链题工具选择、execution/source 快照一致性、题目工具调用上限、模型流中断和 Judge 超时仍需分类和校准。
- Runtime 仍属于一次 Chat 请求内的内存循环，没有持久化 Run/Step/Event、断线 replay、后台继续执行、真正的 steer 和可恢复 cancel。
- 上下文仍主要使用最近消息和本轮工具历史，没有独立 Context Compiler、精确 Token 预算、旧观察压缩和相关材料动态进出。
- Search 仍是单 Provider，没有 fallback、运行内熔断或失败查询抑制；重复上游失败会安全地消耗 20 次额度，但不够高效。
- `used` 只表示最终回答出现了来源 URL，不是逐句 Evidence/Citation；没有 Report Artifact、引用校验或独立复核。
- Fetch 只覆盖公开静态网页；JavaScript 页面、PDF、登录态内容、浏览器操作和完整公网 SSRF/DNS rebinding 防护尚未实现。

**下一阶段结论**：进入 P8 Evaluation / Release Hardening，不继续横向增加工具。先用真实评测把协议一致性、工具选择和失败分类修准，再补最小 durable Run/Event 恢复能力；只有评测证明主要瓶颈是上下文质量时，才进入 Context Compiler。这个顺序先解决“现有能力是否稳定可信”，再解决“任务能否跨连接恢复”，最后才解决“更长任务如何管理上下文”。

## 3. 已完成

### 工程与基础设施

- pnpm workspace 已建立。
- Web：React + Vite + TypeScript。
- API：NestJS，监听 `4318`。
- PostgreSQL：本机 PostgreSQL 服务，监听 `5432`。
- Prisma schema、migration、数据库 readiness 和本地用户初始化已接入。
- canonical 协议包和 agent-testkit 已建立；Chat、Function Calling、搜索结果、工具生命周期 SSE 和可恢复快照均由共享 Zod schema 约束。
- 配置校验、请求 ID 和敏感字段脱敏已接入；生产环境保留结构化 JSON 日志。
- 开发环境日志已切换为彩色中文单行格式，关闭常规 HTTP 请求/响应明细和 Nest 启动路由噪声；模型链路只记录生成开始、首字响应、完成或失败，并提供会话短 ID、模型、上下文条数、首字耗时、总耗时和输出字数。
- OpenAI 官方 SDK 和 OpenAI-compatible Chat Completions 已接入；`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL` 从环境变量读取。
- 已实现最多 20 次通用工具调用的模型-工具循环，支持分片 arguments 聚合、参数校验、串行执行、错误回传和预算终止。
- 模型调用已通过 `ModelAdapter` 与 OpenAI SDK 隔离；`AgentRuntimeService` 只依赖 canonical message、模型事件和工具契约。
- 工具层已拆为 `AgentTool`、集中式 Tool Catalog 和通用 Registry；新增工具不再需要把业务逻辑写入 Registry。
- Chat 链路已拆出 Runtime、搜索投影、assistant 交付仓库、标题服务和 SSE Writer，`ChatService` 只保留会话准备与兼容事件编排。
- 模型流、Runtime 事件流和 Chat SSE 继续使用 `AsyncGenerator` 表达逐步产出；单次数据库操作、工具执行和标题生成使用普通 `async/await`。
- 模型只看到统一 `web_search({query})`；后端通过 `SEARCH_PROVIDER=bocha|serp` 启用一个 Provider，每次返回最多 10 条标准化结果。
- 模型同时可以调用 `web_fetch({urls, query?})`，每次读取 1-5 个公开静态网页，每轮默认最多接受 25 个唯一 URL；批量结果支持逐项 `succeeded/failed/skipped` 的部分成功语义。
- 每轮 Runtime 只创建通用、run-scoped 的 `ToolRunState`；Web Research 领域通过类型化 key 自行创建和维护 `WebResearchRunState`，跟踪 URL、final/normalized URL alias、contentHash、网络尝试、成功唯一文档、Passage 字符和连续无新增 Fetch。
- Search 与 Fetch 在可用时同时暴露，并通过同一个 `WebResearchRunState` 登记用户当前消息直链和本轮 Search clue；模型自行拼出的 URL 不会发起网络请求，Runtime 不解析 URL 或理解具体工具结果。
- URL、上下文或无新增信息边界由 Web Research 请求 `forceFinalAnswer`，20 次通用工具调用边界由 Runtime 触发；两者都只进入一次最多 30 秒的无工具最终回答。普通模型单轮请求最多 120 秒，Search 与 Fetch 分别保留 10 秒和 20 秒的单操作超时；这些都不是 Agent 总运行时限。
- `DocumentQualityGate` 在写入 LRU 和 Passage Ranking 前拒绝过短正文、登录/付费墙/验证码、JavaScript 空壳和高度重复模板；query 无相关 Passage 返回稳定错误。
- Web Fetch 使用无持久化 Crawlee `HttpCrawler`、最小 URL/DNS/逐跳重定向安全校验、5 MiB 流式响应上限、20 秒超时和一次有限重试；不携带 Cookie、Authorization、代理或用户 Header。
- HTML 通过 JSDOM、Mozilla Readability、Turndown + GFM 转换为 canonical Markdown；字符 n-gram Ranker 只返回连续抽取式原文，Locator 同时保存 quote、Unicode code-point position 和 sectionPath。
- 完整 canonical Markdown 只存在于请求生命周期和 15 分钟、32 MiB 的进程内 LRU；模型、SSE 和 Message metadata 只消费或保存整批不超过 24,000 code points 的有界 Passage。
- Bocha/Serper Adapter 已统一标题、URL、domain、摘要、发布日期和来源字段；搜索超时为 10 秒，不记录 Key 或原始响应。
- 普通对话和启用 Tools 的模型轮次都支持真实 SSE 流式输出；模型文本 delta 到达 Runtime 后立即向 Web 传递，不再等待整轮完成后回放。
- assistant turn 使用有序 `text/tool_activity` 内容块；工具开始插入一次，完成、失败或取消按 `toolCallId` 原位更新，成功交付后将相同顺序保存到 Message metadata。
- `tool.started` 由 API 下发稳定用户可见标题；正常取消和 AbortError 都投影为独立 `tool.cancelled`，不会误标失败或遗留永久运行状态。
- 下一轮模型上下文只使用持久化 Message 的纯文本正文，不注入 Tool Activity 的展示文案。
- Prisma 已实现 `Session`、`Message` 及数据库级联删除；会话和消息固定归属 `local-user`。
- 已实现会话创建、列表、详情、重命名、置顶、删除、session-scoped Chat SSE 和模型标题生成 API。
- 普通对话上下文由 API 从 PostgreSQL 读取最近 20 条消息，Web 不再提交完整历史。
- 首次发送前只保留本地空白草稿；首次发送创建 Session，用户消息先落库，完整 assistant 回复结束后再落库。
- 不同 Session 可并行生成；同一 Session 由内存执行注册表限制为单流，活跃会话禁止删除。
- 用户消息、模型消息和后续报告共用 `MarkdownContent` 组件，支持 GFM、代码块、表格和安全外链。
- 根目录 `pnpm dev` 会分别启动 Web/API，等待健康检查通过后输出可点击地址。
- 新增独立 `@harness/agent-evals` workspace 包；默认串行运行 6 题 Smoke，发布前运行 24 题 Full，不进入生产 Runtime 或数据库 Schema。
- 评测通过生产 Session/Chat SSE 黑盒采集标准事件与 assistant metadata，并输出确定性硬规则、聚合指标、无联网检索权限的模型 Judge 和稳定人工抽检 CSV。
- 评测 Session 默认在结果采集后删除；支持 `--keep-sessions`、单题、跳过 Judge、自定义 API 和输出目录。

### Web 工作台

- `/agent` 已接入真实 Session Sidebar、Conversation、Composer 和 URL 恢复。
- `/agent?session=<sessionId>` 可刷新恢复；无有效参数时打开最近会话，无会话时进入未持久化空白草稿。
- Web 按 `sessionId` 保存独立消息缓存和 pending 状态，切换会话不会让后台 delta 串入当前视图。
- 首轮回复完成后异步请求模型标题；失败保留临时标题，不影响聊天交付。
- 删除会话有确认交互；删除当前、非当前和最后会话分别按约定选择恢复落点。
- Sidebar 会话项采用单行标题和按需 `…` 菜单，不展示时间或装饰图标；重命名和置顶状态可跨刷新恢复。
- 生产空状态不渲染空 Workbench。
- 生产聊天先以内联 Activity 展示工具调用；第一条 clue 或 fetched Source 到达后才自动打开 Workbench，用户手动收起后本轮不再强制打开。
- Sources 使用 `R1` 标识搜索 clue、使用 `F1` 标识已读取网页，并以 `used` 区分最终回答中出现的链接；这不等同于逐句事实支撑验证。
- fetched Source 卡片展示来源元数据、缓存状态、截断状态、可展开 Markdown 原文、sectionPath 和 code-point 区间。
- 最终 assistant metadata 保存有序内容块、工具执行与来源轻量快照；刷新、切换会话或点击历史 Tool Activity 均可恢复 Workbench。
- `/agent/preview?state=...` 仅在开发环境启用。
- Preview 已覆盖 empty、direct-answer、search running、fetch running、fetch candidate、fetch failed、waiting、steer、cancelling、cancelled、failed、sources、limited-report、final-report 等状态。
- Conversation 已移除独立 RunCard，工具调用以紧凑 Tool Activity 穿插在 assistant 文本中展示，避免同一执行状态重复投影。
- 点击内联 Tool Activity 可以打开 Workbench 并定位到对应 execution。
- Activity 已实现 execution timeline、当前调用详情、auto-follow 和手动 pinned 行为。
- Workbench 已实现 Activity、Sources、Report 统一外壳和动态 Tab；没有内容时不显示空工具 Tab。
- Composer 支持 Enter 发送、Shift+Enter 换行；提交后立即清空输入框，用户消息和流式 assistant 占位即时显示。
- Workbench、Tab、Activity detail 和内联 Tool Activity 已加入克制动画，并支持 `prefers-reduced-motion`。
- 使用现有 `lucide-react` 图标库；本地资源目录为 `apps/web/src/assets/`。
- 前端已按 `components`、`fixtures`、`model` 和 `config` 拆分 Agent feature；页面层继续集中维护 session 选择、缓存和 SSE 生命周期，避免同一状态机出现多个事实源。
- 跨前后端协议已按 `common`、`sessions` 拆分内部模块；共享限制、工具名和错误码，以及 API/Web 各自的稳定配置均已集中治理。
- 新增和重构的业务函数已补充精简中文注释；对象型常量的每个字段均单独说明用途。

## 4. 可用入口

```text
Web production:  http://127.0.0.1:4317/agent
Web preview:     http://127.0.0.1:4317/agent/preview?state=tool-running-open
API health:      http://127.0.0.1:4318/healthz
API readiness:   http://127.0.0.1:4318/readyz
PostgreSQL:      127.0.0.1:5432
```

启动前需要准备 `.env`、依赖和 PostgreSQL：

```bash
pnpm install
pnpm db:local:init
pnpm db:deploy
pnpm dev
```

`pnpm dev` 输出的 Web/API 地址以当前配置为准；如果 `4317` 或 `4318` 已被占用，启动脚本会直接报告冲突，不会打印误导性的成功链接。PostgreSQL 使用本机服务，不再依赖 Docker。

首次完成 `db:local:init` 和 `db:deploy` 后，日常开发只需运行 `pnpm dev`；PostgreSQL 由本机服务管理。

## 5. 验证记录

最近一次 UI/工程验证已通过：

```text
pnpm check
pnpm test:integration
pnpm --filter @harness/web test:e2e
```

2026-08-05 完成会话持久化、Sidebar 操作和日志治理后再次执行：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
git diff --check
```

结果为全量 lint、typecheck、unit test 和 build 通过；API integration 共 9 项通过。另使用临时 API 端口验证开发日志：启动过程仅输出一条中文就绪信息，访问 `/healthz` 不产生请求头、响应对象或 `request completed` 噪声。

2026-08-05 完成 Function Calling、联网检索和生产 Workbench 投影后再次执行：

```text
pnpm check
pnpm test:integration
git diff --check
```

结果为 workspace lint、typecheck、41 项 unit test 和 production build 全部通过，API integration 9 项通过。新增回归覆盖模型长度截断不落库、工具失败后的受限回答、重复 URL 来源合并，以及 20 次通用工具预算耗尽后的强制最终回答。另使用 Mock model/provider 验证完整工具闭环，没有在自动测试中请求真实搜索 API；使用 1440×900 和 390×844 视口检查生产 Workbench 结构与 Sources 列表，无横向溢出或内容遮挡。

2026-08-06 完成后端职责拆分、前端 feature 拆分、协议包内部拆分和常量治理。模型流式处理、Function Calling 循环、工具执行、搜索投影、持久化和 SSE 传输现在具备独立边界；本轮属于保持既有产品行为的结构重构，不新增用户可见能力。详细取舍见 `docs/22-code-refactor-plan.md`。

2026-08-07 修复 Tools 可用时模型文本被整轮缓冲的问题，并将 Conversation 升级为可恢复的有序内容块。Runtime 现在在模型吐字时立即 yield；Web 按 `blockId` 合并文本并按 `toolCallId` 原位更新 Tool Activity；成功消息持久化相同的 `text → tool_activity → text` 顺序。独立 RunCard 已从生产组件、状态类型和 Preview fixture 中删除。深度复核后又补齐了 `tool.cancelled` 全链路、异常工具终态、服务端 Activity 标题以及流式期间乐观消息 ID 到服务端 Workbench ID 的定位。

同日深度复核后执行 workspace lint、typecheck、unit test、production build、API integration 和 Playwright E2E。新增回归直接验证：Tools 可用时首个 delta 早于模型流结束、`text → tool_activity → text` 顺序、工具终态原位更新且不重复、取消与失败分离、未来工具实时/恢复标题一致，以及 assistant 仍使用乐观 ID 时能够定位服务端 Workbench。

2026-08-08 完成 Web Fetch V1 与 Evidence Candidate 管道后执行 `pnpm check`、API integration、Playwright E2E 和 `git diff --check`。共享协议、API、Web 与 testkit 共 60 项 unit test 通过，API integration 9 项通过，Playwright desktop/mobile 共 16 项通过。新增回归覆盖批量输入与部分成功、URL/DNS/重定向安全、Crawlee 无持久化抓取、正文提取、字符 n-gram、Unicode Locator、缺失父级标题时的非稀疏 sectionPath、新建草稿同步清空 session ref、来源升级后的唯一 R/F 编号、24,000 字符批次预算、LRU cache、10 URL 运行预算、Search→Fetch 来源升级、candidate 恢复和 `R/F` 标识。另用 Agent Browser 真实执行多轮 Search→Fetch→回答，并在 1440×900 与 1280×800 下检查：Candidate、刷新恢复和直接回答均符合预期，body、workspace 和 Passage 无横向溢出，浏览器控制台无遗留错误。

2026-08-10 完成 General Web Research V1 hardening 后执行 `pnpm check`、`pnpm test:integration`、`pnpm test:e2e` 和 `git diff --check`。workspace lint、typecheck、production build 全部通过；共享协议 12 项、API 44 项、Web 17 项、testkit 1 项 unit test 通过，API integration 9 项通过，Playwright desktop/mobile 16 项通过。新增回归覆盖 Runtime Policy 常量、URL 确定性规范化、Search/Fetch 稳定工具集、用户直链/Search clue 来源登记、模型自造 URL 网络前拒绝、Run Ledger 的 URL/正文去重与早停、Document Quality Gate、动态 Passage 预算、partial-success skipped、同一模型响应的后续调用静默补齐、当时实现的内部调查超时与强制最终回答，以及最终回答带追踪参数 URL 的 `used` 规范化匹配。自动验收没有请求真实外部搜索或网页 Provider。该条是历史验收记录，其中的内部调查超时已于 2026-08-11 被单轮模型超时替代。

2026-08-10 新增 General Web Research 真实评测 V1。题集版本为 `v1`，包含 Smoke 6 题和 Full 24 题；评测包 26 项 Mock 自动测试覆盖 SSE 半包、生产 API 客户端、硬规则、指标、Judge 修复、本地能力预检、workspace 根 `.env` 定位、Session 标题边界、Runner 清理/保留/异常恢复、CLI 和报告输出。本轮 `pnpm check`、评测包独立 build 和 `git diff --check` 均通过。真实外部 Smoke 需要 API、PostgreSQL、主模型和 Search Provider 就绪后单独执行；首次结果只作为人工校准基线，不作为冻结发布阈值。

同日首次真实 Smoke 已执行：6 题中硬规则 2 题通过、4 题失败，评测 Session 清理全部成功。首轮暴露的主要问题包括直链题仍先调用 Search、部分工具 execution/source 快照与 SSE 不一致、部分题超出题目工具调用上限、模型流中断，以及 Judge 请求超时。原始结果保存在 `.eval/research/2026-08-10T12-09-47-750Z/`。评测报告已补充逐题问题、Agent 最终回答、失败规则、工具摘要、来源摘要和 Judge 信息；下一轮继续观察真实链路后再决定哪些属于 Agent 行为缺陷、哪些属于评测规则需要校准。

2026-08-11 完成 Agent 运行边界和 Runtime 工具中立化重构。删除会误伤正常长任务的 120 秒 Agent 总截止时间，改为普通模型单轮 120 秒、最终回答单轮 30 秒以及 Search/Fetch 各自 10/20 秒的故障隔离；保留 20 次通用工具调用、25 个 URL、60,000 Passage 字符和连续两次无新增内容等结构性边界。强制最终回答不再发送任何工具定义，服务端完整缓冲并拒绝 DSML 或结构化工具调用污染，最多重试一次；污染内容不会进入 SSE、数据库或后续上下文。

同次重构将 URL provenance、URL/正文去重、Web 资源预算和无新增内容状态从 Runtime 下沉到 `WebResearchRunState`，Runtime 只创建通用 `ToolRunState`，按统一契约执行任意命名工具并处理 `logFields`、`disableTools` 和 `forceFinalAnswer`。上游调用失败日志继续保留脱敏后的真实原因、HTTP 状态、请求 ID、上游地址和响应摘要。执行 `pnpm check` 与 `git diff --check` 全部通过：Protocol 12 项、API 56 项、Web 18 项、Evals 26 项、Testkit 1 项 unit test 通过，workspace lint、typecheck 和 production build 全部通过。本轮没有重复执行依赖数据库或浏览器环境的 integration/E2E。

覆盖范围包括：

- Web lint、TypeScript typecheck、unit tests、production build。
- API health/readiness 和 capability boundary integration tests。
- Session CRUD、置顶排序、重命名、详情恢复、local-user 归属、级联删除、并发冲突、活跃删除和标题 fallback。
- 开发/生产日志配置分支、HTTP 自动访问日志关闭，以及模型生成关键耗时日志。
- Web 首次发送绑定真实 Session、session-scoped SSE、URL 刷新恢复和持久化 Markdown 消息。
- Function Calling 直接回答、搜索执行、工具错误与快照持久化；Bocha/Serper 请求和结果归一化使用 Mock 验证。
- Web 工具生命周期 SSE、实时 Sources 投影和 assistant metadata 恢复。
- Playwright desktop/mobile E2E。
- production 空状态无空 Workbench。
- running / Sources / Report / waiting / failed / cancel fixture。
- Conversation 内联 Tool Activity 到 Workbench 的定位、状态切换和 1280px 布局。

## 6. 当前未完成

以下内容仍按 `docs/17-implementation-plan.md` 和相关契约文档执行，不能从 Preview 状态推断已经完成：

- Run、State、Artifact 的持久化和恢复；Session/Message 普通对话持久化已经完成。
- durable Agent Run、Run/Step/Event、断线 replay 和运行级恢复；当前 `AgentRuntimeService` 仍是一次 Chat 请求内的非持久化 Runtime，不具备运行恢复能力。
- 搜索 fallback；正式 Evidence 持久化、正式引用校验和 Markdown Report Artifact 已调整为后续 Deep Research 范围。
- 面向 Agent Run 的 SSE/事件投影、真实 steer/cancel 控制链路；普通对话 Chat SSE 已完成。
- user Memory、Delegation、Worker 和多用户认证。

### General Web Research V1 完成边界

当前 `web_search -> web_fetch -> 相关原文 Passage -> 普通回答` 已按本阶段边界完成：

- [x] 25 个唯一 URL 代码常量硬限制、预算快照和 partial-success skipped；资源停止由 Web Research 请求统一进入无工具最终回答。
- [x] Search/Fetch 保持稳定工具集；Fetch 执行层只接受用户当前直链或本轮 Search clue，模型自造 URL 不发起网络请求。
- [x] 网络尝试/成功唯一文档分开计数，以及 input/final/normalized URL 与 contentHash 去重。
- [x] Document Quality Gate、query 无关正文错误、动态单批/累计 Passage 预算。
- [x] 两次连续 Fetch 无新增唯一文档早停，Prompt 约束相同 URL 不重复、普通批次每域名最多两个。
- [x] `clue/fetched + used` 来源协议、确定性 URL 匹配、已读来源优先 fallback 和 Workbench 恢复。
- [x] 用户直链 Fetch Prompt、普通模型单轮 120 秒超时、最终回答单轮 30 秒超时和用户 Abort 分离；Agent run 无总截止时间。
- [x] Workbench 展示成功/失败/跳过、网络请求、相关 Passage、URL 预算和采用/已读/线索数量。
- [x] 通用 Agent 固定题集、真实 API 黑盒 Runner、指标聚合、模型 Judge 和人工抽检文件已实现；真实基线运行与两轮人工阈值校准仍待执行。
- [ ] 公网/多用户部署前的连接 IP pinning、网络出口隔离和完整 DNS rebinding 防护仍属后续安全加固。

当前阶段的完成标准是：对需要联网的普通用户问题，Agent 能在合理时间和有限资源内自主找到并读取足够的公开静态网页，过滤无效与重复内容，只注入相关原文，在信息充分或触及资源边界时停止，并基于真正读取过的来源完成普通回答；部分网页失败不能导致重复调用或整体任务失败。

### Runtime 工具中立化（已实现）

`AgentRuntimeService` 已移除对 Search/Fetch 名称、Web URL 解析、领域资源账本和专属指标字段的依赖。Runtime 只创建通用 `ToolRunState` 并传递 `latestUserContent`、标识和取消信号；Web Research 领域自行维护 `WebResearchRunState`、URL provenance、URL/Passage 预算、去重和无新增内容状态，通过统一 `logFields` 与 `forceFinalAnswer` 控制意图和 Runtime 协作。未使用且与领域预算重复的 per-tool units 接口已删除。

### 后续阶段边界

- 完整 Context Engineering 再实现 Evidence Card、语义重排、旧工具结果压缩与淘汰、按任务动态加载和精确 Token 编译。
- Durable Run / Event Store 与 Delegation 再实现后台执行、断线恢复、Worker 独立上下文和大规模 Wide Research；这些能力不属于当前 Web Fetch 模块本身。
- 正式 `EvidenceSource`、report-scoped `[Sx]`、Report Artifact、同模型复核和 Citation Validator 保留为后续 Deep Research 或严谨垂直场景能力，不阻塞通用 Agent 当前阶段。
- JavaScript Browser Fetch、PDF、登录态网页、页面操作和其他来源格式属于独立的工具能力扩展，不并入当前阶段。

## 7. 下一阶段建议

当前进入 P8 Evaluation / Release Hardening。下一阶段按以下顺序推进：

1. **先修评测事实源**：统一 SSE、tool execution 和 assistant metadata snapshot 的投影结果；把 Agent 流中断、Provider 失败、Judge 超时、规则不匹配和真实行为缺陷拆成可聚合分类。
2. **再校准真实行为**：修复直链任务仍优先 Search、无效重复调用和题目工具上限偏差；连续运行至少两轮 Smoke 并人工检查全部 6 题，冻结可信硬规则后再运行 Full 24 题。
3. **补最小恢复闭环**：设计并实现 durable Run/Step/Event、事件序号、断线 replay、后台继续执行和真实 cancel；steer 只在明确 safe step 生效。不要把当前 Chat SSE 直接扩写成不可恢复的伪 Run 协议。
4. **用评测决定 Context Compiler**：如果失败主要来自长工具历史、相关材料不能动态进出或最终回答空间不足，再实现纯函数 Context Compiler、精确 Token 预算、工具观察压缩和选择；如果主要是 Provider 可用性，则优先实现 Search fallback 和有限熔断。
5. **保持能力边界**：正式 Evidence/Citation、Report Artifact、Browser/PDF Fetch、Memory 和 Delegation 继续独立排期，不与 P8 稳定性修复混成一次大重构。

P8 的完成标准不是“再增加一个工具”，而是现有 `Chat -> Agent Loop -> Search/Fetch -> Final Answer -> Persistence/Recovery` 链路具备一致事实、可诊断失败、可重复评测和最小恢复能力。

### 评测报告 TODO

- [x] `summary.md` 展示总体指标和每题状态。
- [x] `review.md` 展示每题问题、Agent 最终回答、失败规则、工具执行、来源摘要和 Judge 结果。
- [x] `human-review.csv` 保留人工评分字段，同时带上自动诊断上下文。
- [ ] 将 Judge 超时、Agent 流中断和工具快照不一致拆成可聚合的失败分类。
- [ ] 为直链题、搜索题和 Fetch 题分别校准硬规则，避免单一规则把行为问题和协议投影问题混在一起。
- [ ] 根据至少两轮真实 Smoke 结果冻结语义质量阈值，再决定 Full suite 是否进入发布门槛。

Context Engineering、durable Run/Step/Event、断线 replay、Worker 独立上下文、正式 Evidence/Report、动态 Browser Fetch 和 PDF 仍按上述后续边界独立推进。

## 8. 关联文档

- 产品与范围：[docs/00-agent-core-roadmap.md](./00-agent-core-roadmap.md)
- 实施阶段：[docs/17-implementation-plan.md](./17-implementation-plan.md)
- 前端契约：[docs/19-agent-frontend.md](./19-agent-frontend.md)
- Workbench 契约：[docs/20-agent-workbench.md](./20-agent-workbench.md)
- API 协议：[docs/11-api-protocol.md](./11-api-protocol.md)
- 工程结构：[docs/18-project-structure.md](./18-project-structure.md)
- 面试知识点：[docs/interview-knowledge.md](./interview-knowledge.md)
- Web Fetch 设计：[docs/23-web-fetch-tool.md](./23-web-fetch-tool.md)
- 真实评测：[docs/24-general-web-research-evaluation.md](./24-general-web-research-evaluation.md)

## 9. 维护规则

- 每完成一个可验证的阶段或跨模块切片，更新本文件的“当前结论”“已完成”“验证记录”和“下一阶段建议”。
- 设计变更写入对应契约文档，不在本文件复制完整规范。
- 所有状态必须区分 production capability、development-only fixture 和 planned capability。
- 每次更新保留日期，并记录实际执行过的验证命令。
