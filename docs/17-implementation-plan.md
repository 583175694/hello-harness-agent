# Incremental Implementation Plan

> 文档状态：权威实施目标与顺序。实际完成状态以 `docs/implementation-status.md` 为准；阶段完成必须有代码、测试和验收记录。

> P0-P7 中未落地的接口和能力只保留历史规划价值，不会自动成为当前承诺。当前实施目标从 P8、`25-model-led-tool-boundary.md` 和 `26-connection-durable-agent-loop.md` 读取；Evidence、Citation Validator、权限策略和 Artifact Finalizer 等未确定能力需重新立项后才进入计划。

## 1. 实施原则

### 1.1 纵向切片

每个阶段形成可运行增量：

```text
Web -> API -> Runtime/Fixture -> State/Event -> Web
```

### 1.2 先确定性，后智能化

```text
fixed fixture
-> scripted action
-> real model final answer
-> real search tooling
-> general web research quality and boundaries
-> later Memory and Delegation
```

### 1.3 Canonical Protocol

跨模块 action、state、API、event、evidence、citation 和 Workbench schema 只定义在 `packages/agent-protocol`。

### 1.4 Thin Runtime

Runtime 只管理 lifecycle、step scheduling、dispatch、steer/cancel 和 terminal handling。搜索理解、证据选择、report review、citation validation 和 finalization 都由独立模块负责。

### 1.5 Capability Gating

阶段外能力不创建空目录、假接口、伪成功或无行为 UI。

## 2. 阶段总览

```text
P0  Architecture and Product Freeze
P1  Workspace + Local Web/API Skeleton
P2  Deterministic Session/Run Vertical Slice
P3  Live Event Projection + Control Fixtures
P4  PostgreSQL Durable State + Local Artifact Foundation
P5  Real Model Final Answer + Clarification
P6  Search Provider Tooling + Iterative Research
P7  General Web Research Hardening
P8  Recovery + Evaluation + Release Hardening
R1  First User-Ready General Agent Release
R-Reasoning  Reasoning Context Transcript
Later Context Engineering
Later Agent Loop Semantics（留档，未排期）
P9  User Memory Read Path
P10 User Memory Write/Review
P11 Bounded Delegation + Worker
P12 Multi-user Authentication + Remote Storage
```

Memory 和 Delegation 不阻塞 R1。

## 3. P0: Architecture and Product Freeze

目标：冻结通用 Agent 黄金能力、领域语言、依赖方向和 R1 停止点。

交付：

- 本文档、`00-agent-core-roadmap.md` 和 `23-web-fetch-tool.md`
- ADR：pnpm / React/Vite / NestJS / Prisma / PostgreSQL
- ADR：NestJS 不侵入 Runtime core
- ADR：OpenAI SDK + configurable baseURL
- ADR：primary/fallback search provider
- canonical action/status/event/evidence 命名
- capability gate 表

必须固定的接口：

```text
StateStore
ArtifactStore
EventSink
ContextCompiler
ModelAdapter
ActionDispatcher
  SearchProvider
Clock
IdGenerator
```

验收：

- 文档只描述 greenfield 目标。
- `user -> session -> run` 语义一致。
- R1 每项能力都有明确阶段。
- Memory 仅 user scope 且位于 R1 后。
- action schema 只有一个计划落点。

## 4. P1: Workspace + Local Web/API Skeleton

状态：`completed`（2026-08-03）。

目标：从空环境启动 Web/API 和 PostgreSQL，不执行 Agent。

创建：

```text
apps/web
apps/api
packages/agent-protocol
packages/agent-testkit
scripts/setup-local-postgres.mjs
```

工程基线：

- pnpm workspace
- React + Vite
- NestJS
- Prisma
- 本地 PostgreSQL 服务
- ESLint / formatter / typecheck
- Vitest or framework-aligned unit tests
- Playwright smoke test
- config validation
- structured logging and secret redaction

API：

- `GET /healthz`
- `GET /readyz`
- `POST /api/agent/sessions` 返回明确 `NOT_IMPLEMENTED`

Web：

- `/agent`
- development-only `/agent/preview` fixed fixtures；不得被误认为 production capability
- session list empty state
- task composer
- Conversation / Run Progress / Activity / Sources / Report shell
- 统一错误展示

验收：

```text
pnpm db:local:init
pnpm install
pnpm dev
-> healthz/readyz healthy
-> /agent 可用
-> submit 明确显示 capability unavailable
```

验收记录：

- Web `4317`、API `4318`、PostgreSQL `5432` 的开发端口已落地。
- Prisma migration `20260803102537_init` 已应用，API 启动可幂等初始化 `local-user`。
- `pnpm check`、API integration tests 和 Playwright desktop/mobile E2E 已通过。
- 工作台提交任务时收到 HTTP 501 和 canonical `CAPABILITY_NOT_IMPLEMENTED`。

明确不做 Runtime、StateStore、模型、搜索、SSE 和真实 Artifact preview。Preview route 中的 running/waiting/failed/sources/report 均为本地 UI fixture。

### 4.1 当前 UI / 目标契约对齐基线（2026-08-04）

当前 production `/agent` 符合 P1 边界：空 Conversation、健康状态、Composer 和明确 501 capability boundary；没有把 preview fixture 冒充真实 Agent 能力。

Development-only `/agent/preview` 已覆盖空会话、直接回答、running、waiting、steer、cancelling、cancelled、failed、sources、limited report 和 final report 的视觉状态。

已完成的桌面 P3 fixture 交互：

- Run progress card 具有 `runId`，tool call rows 具有 `runId/stepId/toolCallId`，点击 card 或具体调用可以打开 Workbench 并精确定位。
- Progress fixture 通过有序 Tool Activity block 与 Workbench projection 展示；Activity 更新按 `runId/stepId/toolCallId` 定位，不再批量覆盖同类项。
- Workbench tab/selection 由 AppShell 受控，支持 auto-follow、manual pin、关闭后当前 run 自动打开抑制。
- Activity 使用纵向 timeline + detail，展示脱敏业务输入、结果摘要和安全聚合指标。
- Preview 中 Composer 根据 fixture 状态模拟必要输入；生产普通 Chat 当前不展示 RunCard，工具调用以内联 Activity 展示，Steer/Cancel 的 durable Agent Run 语义后置。
- 新 run 的首次工具调用自动打开 Workbench；手动点击调用后进入 pinned。

以上仍是本地 fixture，不能作为 SSE、真实 Runtime 或 API 阶段完成证明。其余差异：

- Sidebar 只有静态当前项；new/open/delete session 尚无行为。
- 当前提交把 `{ prompt }` 直接发送到 session capability boundary，尚未按目标协议拆分 create session 与 create run，也没有 canonical idempotency key。
- UI state/type 仍直接定义在 `app.tsx`，虽已使用 `completed` 和 execution identity，但尚未消费 canonical protocol schema 或真实 projection event。
- Composer 模式、steer、clarification、cancel 和 auto-open 仍是本地 fixture mutation，尚未连接 control API/SSE。
- Progress/Activity 仍来自 fixed fixture，尚未由 event projector/reducer 生成。
- Sources fixture 未区分 clue/evidence，筛选按钮无行为，所有条目都按正式 `[Sx]` 展示。
- Report fixture 未覆盖完整 drafting/reviewing/revising/validating 生命周期；没有 Markdown renderer，citation 是纯文本，Artifact 按钮无行为。
- Final delivery 尚无 canonical Artifact card 与 Open report 导航。
- 外链目前只显式设置 `noreferrer`，尚未按契约同时声明 `noopener noreferrer`。
- Desktop 有 Workbench 收起布局；mobile 当前为 Conversation + Workbench 纵向堆叠，尚不是 Activity/Sources/Report 顶层 view 切换。
- Session/run snapshot、SSE replay、selection fallback、跨面板 focus 和 citation scroll recovery 尚未实现。
- Debug tab、脱敏 trace 和 capability gating 尚未实现。

差异按阶段关闭：

```text
P2  session/run identity、真实 Conversation projection、Sidebar 基本行为
P3  frontend reducer、inline Tool Activity、Workbench open/focus fixture contract
P4  durable session/run snapshot recovery
P5  composer clarification/steer/new-run modes
P6  logical tool Activity execution、clue projection、tool-call focus
P7  discovered/fetched/used source distinction、Fetch budget/quality/stop、source navigation
P8  replay/fallback、mobile top-level views、keyboard/focus/E2E hardening、Debug gating
```

后续阶段验收必须以目标契约为准；preview 中“看起来存在”的状态不提前提升阶段状态。

## 5. P2: Deterministic Session/Run Vertical Slice

目标：不用模型和 durable DB，跑通 deterministic completed run。

新增：

- in-memory StateStore/EventSink
- fixed Clock/IdGenerator
- local user fixture
- durable-domain `Session` / `Message` / `Run` types
- LeadRuntime skeleton
- ActionDispatcher
- scripted FinalAnswerAction
- deterministic assistant delivery
- create/get session and run API
- Web projection

数据流：

```text
create session
-> submit message
-> create run/step
-> scripted final_answer
-> assistant delivery commit
-> completed facts
-> Web final message
```

测试：Runtime lifecycle、canonical validation、assistant delivery snapshot、API integration、Web completed-run。

## 6. P3: Live Event Projection + Control Fixtures

状态：`in progress`（2026-08-04 完成桌面 UI fixture 交互；SSE、projector、control API 待实施）。

目标：用 scripted run 验证实时投影、steer 和 cancel 协议。

新增：

- basic SSE endpoint
- run-scoped monotonic event sequence
- event projector
- frontend reducer/projection
- inline Tool Activity identity 与本地 `FOCUS_WORKBENCH_TARGET`
- 内容块 reducer 与 logical tool call projection
- Workbench open/close、Activity tab、selected execution 和纵向 master/detail fixture
- 每个新 run 首次 tool call auto-open；auto-follow、manual pin 和 current-run close suppression
- 桌面 Workbench resize+slide、tab/detail、Tool Activity 状态变化的克制过渡；支持 reduced motion
- connection state
- `POST /runs/:runId/steer`
- `POST /runs/:runId/cancel`
- scripted safe-step boundary

最小事件：

```text
run_started
step_started
progress_updated
run_steered
run_cancel_requested
answer_completed
run_completed
run_cancelled
run_failed
```

验收：重复 event 不重复投影；点击 Conversation 内联 Tool Activity 打开 Workbench 并定位到同一 run 的 Activity execution；用户手动 pin 或关闭后不被同一 run 后续调用抢占。

明确不做 SSE replay、真实模型和真实 provider。

P3 只实现桌面 fixture 交互，不修改 mobile Workbench 形态；mobile 顶层 view 在 P8 统一实现和验收。

## 7. P4: PostgreSQL Durable State + Local Artifact Foundation

目标：切换到 PostgreSQL/Prisma，并支持 API 重启后的 session/run 恢复。

范围：

- minimal `users` 表
- 自动初始化 local user
- `sessions/messages/runs/steps/state_records/runtime_events`
- `artifacts` metadata
- 本地 ArtifactStore，按 user/session 分目录
- Prisma migrations
- repository contracts
- run/session detail query
- refresh recovery
- session delete transaction and file cleanup

要求：

- 所有 session 归属 `user_id`。
- run/message/state/artifact 归属 session。
- session 删除级联删除数据库记录和本地文件。
- Artifact 写入采用 temp + atomic rename。
- PostgreSQL 由本机服务提供。

测试：migration、repository contract、API restart 后的 snapshot query recovery、delete cleanup、Artifact atomic write；这里不表示自动恢复执行中的 Run。

明确不做 Memory tables、搜索证据表和自动 resume execution。

## 8. P5: Real Model Final Answer + Clarification

目标：接入真实 OpenAI-compatible 模型，只允许回答、澄清或失败。

新增：

- OpenAI official SDK
- `.env` 中 `OPENAI_BASE_URL` / `OPENAI_API_KEY`
- 非敏感模型配置表
- ModelAdapter
- ContextMaterialLoader
- pure ContextCompiler
- AgentLoop
- canonical action validation
- bounded invalid-action repair
- `ask_clarification`
- `waiting_for_user` recovery

action 集合：

```text
final_answer / ask_clarification / fail
```

模型 endpoint 可以配置；只有进入测试清单的 model profile 获得正式支持，其他为 best-effort。

验收：明确任务直接完成；阻塞性歧义只问一个问题；waiting 不消耗搜索预算；API Key 不进入日志或 State。

## 9. P6: Search / Fetch Tooling + Iterative Research

目标：完成真实的多 step 搜索研究，不生成最终正式报告。

新增：

- SearchProvider adapter contract
- primary/fallback router
- Bocha/SERP 配置入口
- canonical `web_search` tool
- canonical `web_fetch` tool
- 1-5 URL batch contract and partial-success result
- minimum URL/SSRF safety policy
- Crawlee `HttpCrawler` bounded batch fetch and cache policy
- JSDOM + Mozilla Readability + Turndown 主要正文提取和 canonical Markdown 规范化
- character n-gram extractive passage selection
- input validation
- provider response normalization
- clue/evidence-candidate classification
- untrusted evidence context block
- ResearchBudget enforcement
- query/gap observation
- `runId + stepId + toolCallId` 到用户可见 Activity execution 的稳定投影

action 集合：

```text
tool_call / ask_clarification / finish_research / fail
```

搜索约束：

- 3-6 query budget
- primary 失败、限流或结果不足时才 fallback
- snippet-only result 只能作为 clue
- provider content 或 `web_fetch` 原文 passage 才能成为 evidence candidate
- 完整正文不进入普通 SSE、长期 Message metadata 或 user Memory
- 外部内容不能改变 instructions/toolset/budget

验收：模型能基于 gap 迭代查询并执行 `web_search -> web_fetch`；一次 Fetch 可处理 1-5 个 URL 并保留逐项失败；fallback 原因可观测；重复查询受抑制；预算耗尽后不再调用 provider；非法 URL、私网地址、超时、超大响应和不支持的 Content-Type 被确定性拒绝；`HttpCrawler` 不使用 Dataset、Storage 或自动 enqueue；规范化 Markdown 是 V1 canonical document，Hash、Passage 和 Locator 均以它为基准，模型只消费有界 Markdown passages；Fetch 结果包含字符 n-gram 筛选的抽取式 passage、W3C 风格 quote/position locator、retrievedAt 和 contentHash；进程内 LRU 有界且按 TTL 失效；Conversation 中的 progress card 能定位到对应 logical tool call，provider attempts 不重复生成用户可见 execution。V1 不实现 DocumentBlock 或 canonical plain text + block 双表示。

## 10. P7: General Web Research Hardening

目标：把现有 `web_search -> web_fetch -> Passage -> 普通回答` 完善为通用 Agent 好用、透明、受控的联网调查闭环，不提前实现学术级 Evidence/Report pipeline。

> 本节记录 P7 当时已经落地的历史方案，其中 URL/Passage 跨调用预算、allowlist、连续无新增内容早停和 Tool 控制意图已在 P8 架构复核中决定移除；当前目标以第 11 节和 `25-model-led-tool-boundary.md` 为准。

新增：

- 代码常量定义的 25 个唯一 URL 运行级硬安全上限；模型信息充分时提前停止，不实现软预算申请状态机
- 已用/剩余/是否可 Fetch 的简洁预算 observation；预算耗尽后由工具领域请求结束工具阶段，Runtime 统一进入无工具最终回答
- network attempts 与 successful unique documents 分开计数
- input URL、normalized URL、final URL 和 contentHash 去重
- Document Quality Gate：识别验证码、登录/付费墙、JavaScript 空壳、空正文、模板噪声和 query 无关正文
- 稳定的 `ACCESS_BLOCKED`、`JS_RENDER_REQUIRED`、`CONTENT_EXTRACTION_FAILED`、`CONTENT_NOT_RELEVANT` 等错误语义
- 现有 n-gram Passage Ranker 的轻量标题/章节权重、噪声和重复优化
- 基于保守字符数或粗略 Token 的累计 Passage 上下文安全阀
- 无新增唯一正文或相关 Passage 时的早停与基础来源多样性
- `discovered` Clue、`fetched` Source 和最终回答 `used` Source 的轻量区分
- 用户直接提供 URL 时无需先 Search 即可 Fetch
- 模型、Search、Fetch 各自独立的单操作超时和端到端取消传播；不设置整个 Agent run 的总执行时间预算
- Activity / Sources 投影和恢复；展示成功、失败、重复、预算和最终采用来源
- 通用 Agent 固定题集和 Fetch 运行指标

流程：

```text
user task or direct URL
-> search when needed
-> select URLs
-> bounded fetch
-> document quality gate
-> query-aware passage selection
-> dedup + marginal-gain/stop check
-> continue investigation or answer
-> lightweight used sources + Workbench projection
```

验收：

- URL 上限提高后仍受网络、工具、时间、响应大小和累计上下文安全预算约束。
- 预算耗尽后不再重复生成相同 Fetch 失败；部分 URL 失败不阻塞基于已有材料回答。
- normalized/final URL 和相同正文不会被重复读取或重复计作有效材料。
- HTTP 200 的验证码、登录页、JavaScript 空壳和无有效正文页面不会进入 Passage 上下文。
- 连续调用没有新增唯一正文或相关 Passage 时能够早停。
- Search snippet 只保持 `discovered` Clue 身份；普通回答的主要来源来自成功读取的网页。
- 模型只消费有界相关 Passage，触及累计安全阀时停止继续注入并为最终回答保留空间。
- 用户直链、产品比较、时事解释、技术排障、旅行规划和政策解读固定题通过。
- Workbench 与刷新恢复能区分 Search、Fetch、成功、失败、重复和最终采用来源。
- 本阶段不创建 `EvidenceSource`、`[Sx]`、Report Artifact、ReportReview 或 CitationValidator。

正式 Evidence/Citation、报告复核和可验证 Markdown Report 不属于当前阶段，未来是否实现根据产品需求再决定。完整上下文的 Token 计量、选择、压缩、淘汰、动态加载和最终回答预留等待 Context Engineering。后台执行与客户端断线恢复已进入当前 Connection-Durable Agent Loop 方案；Worker 独立上下文继续等待 Delegation。

## 11. P8: Recovery + Evaluation + Release Hardening

目标：让 P1-P7 达到真实用户可用门槛。

P8 的 [Connection-Durable Agent Loop](./26-connection-durable-agent-loop.md) 已完成时序加固：Run 与 Chat HTTP/SSE 连接解耦，使用 PostgreSQL Run/Step/assistant draft checkpoint、进程内 Event Hub、标准 SSE cursor 和独立 Cancel 实现客户端断线恢复；Ordered Model Rounds、Canonical Live Projection、版本化 Checkpoint、Checkpoint 水位后的 Event Tail、Latest Live Snapshot fallback、严格客户端 cursor 和最小状态 CAS 均已落地。当前不引入数据库 Event Log、Redis，也不实现服务端重启后的自动续跑；重启遗留 Run 收敛为 `RUN_INTERRUPTED`。

P8 首个架构收敛项 [Model-led Tool Boundary](./25-model-led-tool-boundary.md) 已于 2026-08-11 完成：

- 删除 `ToolExecutionResult.control`、Tool `modelContent`、`forceFinalAnswer` 和 `disableTools`；Runtime 统一序列化 canonical `output/error` 为 Tool Message。
- 删除领域共享用的 `ToolRunState`、`WebResearchRunState`、`latestUserContent` 和 `runState`。
- Search 与 Fetch 只返回结构化结果，不登记来源、不维护跨调用预算，也不请求结束工具阶段。
- 删除 Web 运行级 URL/contentHash/Passage 去重、URL provenance allowlist 和连续无新增内容强制早停。
- 允许模型 Fetch 任意通过 URL/DNS/redirect 安全 Guard 的公开 URL；由 Projection 派生 provenance 并归并 canonical source。
- 保留 Runtime 每个 assistant run 最多 20 次 Tool Call、模型单轮超时、取消和最终回答协议校验。
- Tool 声明不可由模型覆盖的外层 `executionPolicy.timeoutMs`，Runtime 统一组合并执行；Tool 内部保留更细的 transport timeout。
- 保留 Fetch 单次调用的 URL 数量、网络安全、响应大小、提取、Passage、Locator 与 LRU。
- 删除 Tool Result 字符硬上限、独立 observation/delivery 和注入状态；当前 Tool Result 始终进入下一模型轮次。
- 将 `WebFetchResult.budget` 改为只描述本次调用事实、不带控制语义的 `stats`。
- 同步简化共享协议、SSE/metadata、Workbench、评测规则和回归测试。

验收时 Tool 在类型层无法返回控制命令，Runtime 不含 Web 领域状态或停止条件；未达到 20 次 Tool Call 且未取消时，继续调用工具或回答完全由模型下一轮决定。完成该迁移后再基于真实 Eval 判断是否存在重复调用、上下文过大或效率问题，不预先增加第二套 Runtime/Research Decision Policy，也不为未来 Context Engineering 冻结局部字符预算协议。

范围：

- SSE replay / Last-Event-ID
- create-run 与 subscribe 分离、后台 Run 执行和独立 cancel
- PostgreSQL Run/Step/assistant draft snapshot
- Ordered Model Rounds：`roundSequence + blockSequence` 稳定排序，Content 首字即时交付，Round 结束后确认工具前言或最终正文语义
- Canonical Live Projection、版本化 Checkpoint 和 Checkpoint 水位后的 Event Tail
- cursor 连续时 replay，断档时 Latest Live Snapshot fallback
- 前端成功 apply 后推进 cursor、sequence gap 检测和旧 Snapshot 保护
- queued cancel、terminal compare-and-set 和终态不可反转
- bounded retry and timeout
- provider overload/backoff
- API restart interruption reconciliation；不自动恢复执行
- orphan temp Artifact cleanup
- provider/tool result short retention cleanup
- context/tool/event payload limits
- fixed Chinese general-agent evaluation set
- Search/Fetch degradation checks and repeated-call efficiency signals
- manual answer/source quality rubric
- Playwright desktop/mobile E2E

R1 发布门槛：

- contract/integration/UI tests 全部通过
- 固定题集不突破通用 Tool Call 硬边界，重复 Search/Fetch 进入效率评审
- 无 search-snippet-as-fetched-source
- 无 invalid-page-as-successful-document
- steer/cancel/fallback/partial-source-failure 场景通过
- 人工抽检完成

## 12. R1: First User-Ready General Agent Release

R1 交付：

```text
single local user
durable sessions
single Lead agent loop
primary/fallback search
bounded general web research
query-aware fetched passages
lightweight real sources
Workbench
steer/cancel
recovery and evaluation baseline
```

Memory、Delegation、认证、远程存储和服务端重启自动续跑不是 R1 release blocker。

## 12.1 R-Reasoning: Reasoning Context Transcript

目标：在 Context Engineering 前补齐 Thinking 模型协议、完整工具链上下文和用户可理解的时序投影。

实施范围：

- Model Adapter 捕获并规范化 reasoning stream，按目标 provider/model capability 编码回请求。
- Composer 提供无思考、轻度、中度、高度四档选择；canonical `off/low/high/max` 由 Adapter 映射到供应商参数。
- Runtime 保持 reasoning、Tool Call、Tool Result 和 final answer 的稳定顺序与关联。
- Runtime 内部保留独立 reasoning event，普通 Conversation SSE/UI 不展示 raw reasoning；前端按时序展示 text 与 Tool Activity，首版不折叠。
- 新增 durable canonical transcript，跨用户轮次完整回放 Tool Call 关联单元与最终正文，不回放无 Tool Call 最终 Round 的 reasoning；本次断代不兼容旧 Session，旧数据由临时清库脚本删除。
- 同一 run 冻结 provider、model 和 thinking profile；模型切换时执行显式兼容判断。
- Run 持久化 requested/effective reasoning effort，重试、重连和恢复不得改变档位。
- Public Config 暴露 canonical reasoning capability，前端不按模型名称硬编码。
- Create Run 幂等 hash 覆盖 content、reasoning effort 和未来影响执行语义的 run profile。
- completed transcript 原子提交到 Session；failed/cancelled 半成品不进入下一 Run 上下文。
- 模型/Provider 变化时执行历史兼容检查，不兼容且无转换路径时阻止原 Session 继续发送。
- 未实施 Context Engineering 前不主动摘要或静默截断；达到上下文限制时返回明确错误。

不属于本阶段：token 预算、材料排名、压缩、摘要、淘汰和最终回答空间预留。这些仍由后续 Context Engineering 统一实现。

详细方案与验收标准见 [27-reasoning-context-transcript.md](./27-reasoning-context-transcript.md)。

### 后续候选：Agent Loop Semantics（当前只留档）

当前 Runtime 仍以 Model-led Tool Loop 为主：模型声明 Tool Call 时继续执行并回填结果，没有 Tool Call 时交付文本并结束。后续迭代完整 Agent 能力时，需要重新评估以下语义是否应成为显式、可持久化的 Runtime 状态：

- Goal / Task State
- 显式 Plan / Todo
- Plan 动态修订
- 结构化 Observation
- Progress 状态
- Completion Policy
- Ask User / Clarification
- Reflect / Re-plan

本节当前只用于防止后续遗漏，不代表已经立项或冻结设计。以上能力不进入当前 Context Engineering 实施范围，不预先创建协议、数据库表、Runtime 接口或占位模块。正式启动前应先结合真实评测决定哪些能力需要显式建模、哪些继续由模型隐式完成，并保证简单任务不被迫经过完整规划与反思流程。

## 13. P9: User Memory Read Path

目标：从当前 user 的 active Memory 中检索相关 MemoryCard，并允许显式展开 prior-session sourceRefs。

范围：

- `memory_records`，固定 user scope
- MemoryCard retrieval
- relevance/freshness/confidence ranking
- ContextCompileInput injection
- MemoryInjectionTrace
- sourceRef ownership check

明确不做 project/workspace/org scope 和自动写入。

## 14. P10: User Memory Write/Review

目标：安全生成跨 session user Memory。

规则：

- 用户明确表达的长期偏好可 auto-active。
- 推断偏好和其他信息只能 candidate。
- 网页事实和单次调研内容禁止写入 Memory。
- 每条 active Memory 必须有 sourceRefs。
- 删除 session 时重新评估引用它的 Memory。

范围：Extractor、Policy、candidate review UI、dedup/conflict、delete/expire/supersede。

## 15. P11: Bounded Delegation + Worker

目标：在单 Lead 质量稳定后增加一轮 bounded fan-out/fan-in。

限制：单层、worker 不再 delegation、worker 不直接向用户交付最终结果、scoped context/toolset/budget、结果回到 Lead 汇总。

Delegation 不能改变 R1 的工具安全、来源边界、预算和最终交付所有权。

## 16. P12: Multi-user Authentication + Remote Storage

未来范围：

- user authentication
- session ownership enforcement
- remote ArtifactStore adapter
- quotas and abuse controls
- multi-user migration

不引入 project/workspace/org Memory scope，除非后续产品决策明确改变。

## 17. 每阶段共同完成条件

每个阶段必须：

1. 从声明的环境启动。
2. 有独立 Demo。
3. 有自动化测试。
4. 不依赖下一阶段才能运行。
5. 不重写上一阶段的核心契约。
6. 更新 capability gate 和文档状态。
7. 对新持久化数据提供 migration 和 cleanup 语义。
