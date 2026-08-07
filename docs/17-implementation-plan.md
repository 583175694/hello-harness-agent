# Incremental Implementation Plan

> 文档状态：权威实施计划。P0 文档冻结和 P1 工程基线已完成；P2-P12 待实施。阶段完成必须有代码、测试和验收记录。

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
-> evidence and report quality
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
P0  Architecture and Product Freeze                         completed
P1  Workspace + Local Web/API Skeleton                      completed
P2  Deterministic Session/Run Vertical Slice
P3  Live Event Projection + Control Fixtures                    in progress
P4  PostgreSQL Durable State + Local Artifact Foundation
P5  Real Model Final Answer + Clarification
P6  Search Provider Tooling + Iterative Research
P7  Evidence/Citation + Report Review + Workbench
P8  Recovery + Evaluation + Release Hardening
R1  First User-Ready Research Release
P9  User Memory Read Path
P10 User Memory Write/Review
P11 Bounded Delegation + Worker
P12 Multi-user Authentication + Remote Storage
```

Memory 和 Delegation 不阻塞 R1。

## 3. P0: Architecture and Product Freeze

目标：冻结黄金任务、领域语言、依赖方向和 R1 停止点。

交付：

- 本文档和 `13-research-workflow.md`
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
EvidenceStore
CitationValidator
ResponseFinalizer
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
P7  evidence/source distinction、report lifecycle、citation/Artifact navigation
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
- deterministic Finalizer
- create/get session and run API
- Web projection

数据流：

```text
create session
-> submit message
-> create run/step
-> scripted final_answer
-> Finalizer
-> completed facts
-> Web final message
```

测试：Runtime lifecycle、canonical validation、Finalizer snapshot、API integration、Web completed-run。

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

测试：migration、repository contract、API restart recovery、delete cleanup、Artifact atomic write。

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

## 10. P7: Evidence/Citation + Report Review + Workbench

目标：把研究结果变成可验证、可恢复的正式交付物。

新增：

- `evidence_sources`
- cited passage persistence
- stable `evidenceId` and report-scoped `displayId` allocation
- report draft Artifact
- structured ReportReview
- revised report Artifact
- deterministic CitationValidator
- report quality `standard | limited`
- deterministic Finalizer
- Sources / Report / Activity / Debug projection
- Conversation / Workbench cross-panel navigation
- Activity execution history and focus recovery
- inline citation renderer
- Markdown preview

流程：

```text
research
-> select durable evidence
-> draft
-> same-model review
-> revise
-> citation validation
-> final Artifact + delivery message
```

验收：

- `[Sx]` 全部可解析。
- clue-only result 不可引用。
- cited passage、URL、provider、retrievedAt 可恢复。
- 有部分证据时生成 limited report。
- 零 eligible evidence 时 failed。
- Workbench 不显示未实现的 Browser/Terminal/Memory/Worker tab。
- inline Tool Activity、citation 和 Open report 分别精确定位 Activity、Sources 和 Report。
- terminal run 与 snapshot recovery 不会定位到错误 execution/resource。

## 11. P8: Recovery + Evaluation + Release Hardening

目标：让 P1-P7 达到真实用户可用门槛。

范围：

- SSE replay / Last-Event-ID
- bounded retry and timeout
- provider overload/backoff
- API restart recovery
- orphan temp Artifact cleanup
- uncited provider result short retention cleanup
- context/tool/event payload limits
- fixed Chinese research evaluation set
- citation hard-failure checks
- manual report review rubric
- Playwright desktop/mobile E2E

R1 发布门槛：

- contract/integration/UI tests 全部通过
- 固定题集无 invalid `displayId`
- 无 clue-as-evidence
- 无 zero-evidence completed run
- steer/cancel/fallback/limited-report 场景通过
- 人工抽检完成

## 12. R1: First User-Ready Research Release

R1 交付：

```text
single local user
durable sessions
single Lead iterative research
primary/fallback search
evidence-backed Markdown report
same-model review
deterministic citations
Workbench
steer/cancel
recovery and evaluation baseline
```

Memory、Delegation、认证、远程存储不是 R1 release blocker。

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

限制：单层、worker 不再 delegation、worker 不交付最终报告、scoped context/toolset/budget、结果回到 Lead review pipeline。

Delegation 不能改变 R1 的 EvidenceSource、CitationValidator 和 Finalizer 契约。

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
