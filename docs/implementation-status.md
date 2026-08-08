# Implementation Status

> 文档类型：研发状态快照。它记录当前代码、验证结果和已知限制，不替代产品契约、架构文档或实施计划。
>
> 最后更新：2026-08-08

## 1. 当前结论

项目已经完成工程基线、持久化普通对话和 `web_search -> web_fetch` Function Calling 闭环。模型可以先通过 Bocha 或 Serper 发现网页线索，再批量读取 1-5 个公开静态网页的可定位原文；真实工具 Activity、搜索 clue 和 Evidence Candidate 会投影到生产 Workbench，并随 assistant metadata 刷新恢复。

当前状态可以描述为“具备线索发现、静态网页读取和 Evidence Candidate 管道的简化研究 Agent Loop”，但不能描述为完整调研 Agent。正式 Evidence、`[Sx]`、Run/Event Store、引用校验、报告 Artifact、steer/cancel 和搜索 fallback 仍未实现；预览页面中的 waiting、report 和控制状态仍为本地确定性 fixture。

## 2. 已完成

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
- 模型同时可以调用 `web_fetch({urls, query?})`，每次读取 1-5 个公开静态网页，每轮最多消耗 10 个去重 URL；批量结果支持逐项成功或失败。
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

### Web 工作台

- `/agent` 已接入真实 Session Sidebar、Conversation、Composer 和 URL 恢复。
- `/agent?session=<sessionId>` 可刷新恢复；无有效参数时打开最近会话，无会话时进入未持久化空白草稿。
- Web 按 `sessionId` 保存独立消息缓存和 pending 状态，切换会话不会让后台 delta 串入当前视图。
- 首轮回复完成后异步请求模型标题；失败保留临时标题，不影响聊天交付。
- 删除会话有确认交互；删除当前、非当前和最后会话分别按约定选择恢复落点。
- Sidebar 会话项采用单行标题和按需 `…` 菜单，不展示时间或装饰图标；重命名和置顶状态可跨刷新恢复。
- 生产空状态不渲染空 Workbench。
- 生产聊天先以内联 Activity 展示工具调用；第一条 clue 或 Evidence Candidate 到达后才自动打开 Workbench，用户手动收起后本轮不再强制打开。
- Sources 使用 `R1` 标识搜索 clue、使用 `F1` 标识原文候选，二者均不带方括号；只有未来正式 Evidence 才允许使用 `[Sx]`。
- Evidence Candidate 卡片展示来源元数据、缓存状态、截断状态、可展开 Markdown 原文、sectionPath 和 code-point 区间。
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

## 3. 可用入口

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

## 4. 验证记录

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

## 5. 当前未完成

以下内容仍按 `docs/17-implementation-plan.md` 和相关契约文档执行，不能从 Preview 状态推断已经完成：

- Run、State、Artifact 的持久化和恢复；Session/Message 普通对话持久化已经完成。
- durable Agent Run、Run/Step/Event、断线 replay 和运行级恢复；当前 `AgentRuntimeService` 仍是一次 Chat 请求内的非持久化 Runtime，不具备运行恢复能力。
- 搜索 fallback、正式 Evidence 持久化和正式引用校验；网页原文当前只具备 `evidence_candidate` 资格。
- Markdown Report Artifact 的真实生成、保存、下载和重开。
- 面向 Agent Run 的 SSE/事件投影、真实 steer/cancel 控制链路；普通对话 Chat SSE 已完成。
- user Memory、Delegation、Worker 和多用户认证。

### Web Fetch / Evidence Candidate 后续 TODO

当前 `web_search -> web_fetch -> evidence_candidate -> 普通回答` 已经可用，但仍需继续完善以下产品化和质量能力：

- [ ] 增加来源质量评分和域名信誉策略，降低营销软文、聚合转载和低质量 SEO 页面在候选来源中的权重。
- [ ] 增加检索去重、早停和查询预算策略；真实 QA 中一次复杂问题执行了 8 次 Search、3 次 Fetch，功能正确但仍有减少无效轮次和整体耗时的空间。
- [ ] 优化大量 Clue 的 Workbench 展示；当前复杂调研可能产生数十条线索，需要真正可用的筛选、折叠、分组或虚拟列表，而不是一次平铺全部来源。
- [ ] 增加 Evidence Candidate 选择与淘汰策略，只保留真正可能支撑结论的高价值 Passage，并明确展示 Fetch 逐项失败和证据缺口。
- [ ] 增加真实固定调研题集的质量评测，统计来源有效率、原文命中率、低质量来源比例、首个 Candidate 延迟和完整任务耗时。
- [ ] 为 Web Fetch 增加运行指标和可观测性，包括 cache hit、响应字节、提取失败类型、URL 安全拒绝、Passage 数量和各阶段耗时；日志继续禁止正文和敏感 URL query。
- [ ] 在公网或多用户部署前补充连接 IP pinning、网络出口隔离和更完整的 DNS rebinding 防护。
- [ ] 按需支持 JavaScript Browser Fetch、PDF 和其他文件来源；当前只支持公开静态 HTML/XHTML/plain text。

### 正式 Evidence / Report 下一阶段 TODO

- [ ] 从 Candidate Passage 中选择实际支撑结论的正式 Evidence，创建 durable `EvidenceSource`。
- [ ] 为报告分配稳定、report-scoped 的 `[S1]`、`[S2]`，禁止 Clue 或 Candidate 冒充正式引用。
- [ ] 生成 Markdown Report Artifact，并保存、下载、刷新恢复和重新打开。
- [ ] 先生成草稿，再执行一次同模型复核与修订。
- [ ] 在交付前执行确定性 Citation Validator，检查每个 `[Sx]` 是否存在、Locator 是否可恢复、引用是否支撑相邻事实结论。
- [ ] 证据不足时交付受限报告，明确证据缺口和未确认结论；完全没有可引用证据时才失败。
- [ ] 使用固定调研题集进行自动化质量评测和人工抽检，形成阶段验收基线。

## 6. 下一阶段建议

下一阶段建议实现正式 Evidence Layer：从 Evidence Candidate 中选择实际支撑结论的原文 Passage，创建 durable EvidenceSource，分配 report-scoped `[Sx]`，并接入报告草稿、同模型复核和确定性 Citation Validator。详细 Fetch 契约见 `docs/23-web-fetch-tool.md`。

durable Run/Step/Event、断线 replay、运行恢复、动态 Browser Fetch 和 PDF 仍按后续独立阶段推进。

## 7. 关联文档

- 产品与范围：[docs/00-agent-core-roadmap.md](./00-agent-core-roadmap.md)
- 实施阶段：[docs/17-implementation-plan.md](./17-implementation-plan.md)
- 前端契约：[docs/19-agent-frontend.md](./19-agent-frontend.md)
- Workbench 契约：[docs/20-agent-workbench.md](./20-agent-workbench.md)
- API 协议：[docs/11-api-protocol.md](./11-api-protocol.md)
- 工程结构：[docs/18-project-structure.md](./18-project-structure.md)
- 面试知识点：[docs/interview-knowledge.md](./interview-knowledge.md)
- Web Fetch 设计：[docs/23-web-fetch-tool.md](./23-web-fetch-tool.md)

## 8. 维护规则

- 每完成一个可验证的阶段或跨模块切片，更新本文件的“当前结论”“已完成”“验证记录”和“下一阶段建议”。
- 设计变更写入对应契约文档，不在本文件复制完整规范。
- 所有状态必须区分 production capability、development-only fixture 和 planned capability。
- 每次更新保留日期，并记录实际执行过的验证命令。
