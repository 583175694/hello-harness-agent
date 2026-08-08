# Harness Agent Roadmap / 总指挥文档

> 文档状态：权威路线图。P1 工程基线已实现；P2 及之后的 Agent 能力仍为待实现目标。

本文是项目范围、产品方向、架构不变量和里程碑顺序的最高优先级文档。

## 1. 产品定义

Harness Agent 是一个面向终端用户的本地任务工作台，产品形态参考 Manus，但首个版本只把一个黄金任务做到完整可用：

```text
用户提出调研目标
-> Agent 迭代搜索公开来源
-> 读取搜索供应商返回的正文或可定位原文片段
-> 基于证据生成草稿
-> 同模型复核与修订
-> 确定性校验引用
-> 交付带内联引用的 Markdown 报告
```

首个真实用户版本不是 Agent Runtime SDK，也不是通用工具市场。Runtime、State、Context、Tooling 和 Workbench 都服务于上述端到端产品体验。

完整产品契约见 [13-research-workflow.md](./13-research-workflow.md)。

## 2. 当前基线

当前仓库已完成 P1：

- pnpm workspace，包含 React/Vite Web、NestJS API 和共享 package
- 本地 PostgreSQL、Prisma schema 和首个 migration
- `users` 最小表及唯一 `local-user` 自动初始化
- `/healthz`、`/readyz` 和明确返回未实现错误的 session 创建入口
- `/agent` 工作台壳层、任务输入和 Sources/Report 空状态
- 环境校验、结构化日志、secret redaction 和本地 Artifact 根目录检查
- unit、API integration、Playwright desktop/mobile 测试

本地开发端口固定为 Web `4317`、API `4318`、PostgreSQL `5432`，均可通过配置调整。开发环境直接使用本机 PostgreSQL，不依赖 Docker。

已经实现 OpenAI-compatible 普通对话、Chat SSE 和 durable Session/Message；尚未实现 Agent Runtime、durable Run/State、搜索、正式 Artifact、Memory 或 Delegation。只有代码、测试和验收记录同时存在时，能力才算完成。

## 3. 首次发布范围

首个真实用户版本必须包含：

- 本地 Web UI 和 API
- durable session、message、run、step 和 State
- OpenAI SDK 模型适配器，支持配置 `baseURL`、`apiKey` 和模型配置表
- 单 Lead 多 step loop
- `ask_clarification`
- `steer`，从下一安全 step 生效
- `cancel`
- 主搜索供应商和 fallback 搜索供应商
- 3-6 次迭代查询预算
- 5-10 个有效引用来源目标
- 搜索正文证据与摘要线索分离
- 草稿、同模型 review、修订和确定性引用校验
- Markdown Report Artifact
- Sources / Report / Activity / Debug Workbench
- 证据不足时交付受限报告
- 完全没有可引用证据时失败
- 固定调研题集评测和人工抽检

首次发布明确不包含：

- user Memory
- Delegation / Worker
- browser automation
- 网页正文额外抓取器
- 动态 MCP 注册
- 多用户认证和权限 UI
- 项目、组织或 workspace scope
- 远程对象存储
- 多模型路由 UI

## 4. 产品默认值

```text
运行形态       本地 API + 本地 Web，浏览器访问
目标用户       单个本地用户
默认深度       3-6 次查询，5-10 个有效来源
目标耗时       3-5 分钟
搜索执行       primary provider + fallback provider
外部发送授权   配置相应 API Key 即视为同意；任务执行时不逐次确认
正式证据       供应商返回的正文或可定位原文片段
线索           标题/URL/摘要，不可单独支撑正式引用
报告格式       Markdown Artifact
引用格式       事实性结论后使用 [S1][S3]，文末来源列表
质量流程       draft -> review -> revise -> validate -> deliver
```

## 5. 领域层级

```text
User
  -> Session
      -> Message
      -> Run
          -> Step
          -> StateRecord
          -> RuntimeEvent
      -> Artifact

User
  -> MemoryRecord                 # 后续 capability，可跨 session
      -> sourceRefs
          -> prior Session/Run/State/Artifact
```

约束：

- R1 创建一个最小 `users` 表并初始化唯一 local user。
- 不实现登录、密码或权限 UI。
- `session` 是长期可恢复的会话聚合根，可包含多条消息和多次 run。
- session 删除时级联清理其数据。
- 后续 user Memory 仅允许 `user` scope，不支持 project/workspace/org scope。
- 跨 session 证据只能从命中的 Memory `sourceRefs` 显式展开。

## 6. 工程选择

```text
pnpm workspace
React + Vite
NestJS
Prisma
PostgreSQL
local filesystem Artifact store
Local PostgreSQL service for development
OpenAI official SDK with configurable baseURL
```

模块形态采用 modular monolith。NestJS 负责 API、配置、依赖注入和模块装配；Runtime、Context Compiler、Action Schema 和 State 语义保持框架无关。

## 7. 六条架构不变量

### 7.1 Canonical Protocol

Action、State、API、Event、Citation 和 Workbench schema 的唯一来源是：

```text
packages/agent-protocol
```

前后端和 testkit 只消费导出，不复制 union、enum 或 runtime schema。

### 7.2 Pure Context Compiler

```text
compile(StateSnapshot, ContextCompileInput, ContextCompileConfig)
  -> CompiledStepContext
```

相同输入和版本必须产生相同输出。数据库读取、搜索执行、Memory retrieval 和模型辅助选择都发生在 compiler 外。

### 7.3 Thin Runtime

Runtime 只拥有 lifecycle、step scheduling、action dispatch、steer/cancel 传播和 terminal handling。

Runtime 不做搜索结果理解、引用选择、报告 review、Memory 提炼或答案重写。

### 7.4 Evidence Boundary

```text
provider snippet  = discovery clue
provider content  = untrusted evidence material
cited passage     = durable evidence
model conclusion  = must reference durable evidence when factual
```

外部内容只能进入不可信证据区，不能成为 system/user instruction。

### 7.5 Deterministic Commit

Citation Validator 和 Finalizer 都是确定性组件：

- Validator 校验 report-scoped `displayId`、证据资格和引用完整性。
- Finalizer 提交已经通过验证的报告、消息、State facts 和 projection events。
- 二者都不调用模型或工具。

### 7.6 Capability Gating

未进入当前阶段的 capability 不创建空实现、不返回伪成功、不出现在工具集或 UI 中。

## 8. Runtime 主线

```text
User/API
-> Lead Harness Runtime
-> Context Material Loader
-> Pure Context Compiler
-> Agent Loop
-> Canonical Action Validation
-> Runtime Action Dispatch
-> Search Tooling / Clarification / Report Pipeline / Finalizer
-> State + Evidence + Artifact
-> next step or terminal
-> Agent Gateway / SSE / Workbench projection
```

下一轮模型默认消费 observation、evidence cards 和 refs，不直接消费未裁剪的原始供应商响应。

## 9. 渐进实施顺序

```text
P0  Architecture and Product Freeze
P1  Workspace + Local Web/API Skeleton
P2  Deterministic Session/Run Vertical Slice
P3  Live Event Projection + Control Fixtures
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

`R1` 是第一次真实用户发布。Memory 和 Delegation 不阻塞 R1。

详细交付和验收见 [17-implementation-plan.md](./17-implementation-plan.md)。

## 10. R1 成功标准

1. 空环境按 README 可启动 PostgreSQL、API 和 Web。
2. 用户可以创建和恢复 durable session。
3. Agent 能对明确任务直接开始，对阻塞性歧义只问一个问题。
4. 运行中 steer 从下一安全 step 生效，cancel 可终止活动执行。
5. Agent 在预算内执行迭代搜索并使用 primary/fallback provider。
6. 只有 eligible evidence passage 能获得稳定 `evidenceId` 和 report-scoped `displayId`。
7. 报告经过 draft、review、revise 和 deterministic citation validation。
8. 每个重要事实、数字和比较带内联引用。
9. 引用片段、URL、标题、provider 和检索时间可恢复。
10. 证据不足交付受限报告；零正式证据时失败。
11. Markdown Artifact 和 Sources 可在 Workbench 恢复。
12. contract/integration/UI 测试通过。
13. 固定调研题集评测通过并完成人工抽检。
14. Conversation 内联 Tool Activity、citation 和 Artifact card 能分别精确定位 Workbench 的 Activity execution、Source evidence 和 Report。

## 11. 决策所有权

```text
Product Spec owns golden workflow and release quality.
Protocol owns canonical schemas.
Runtime owns control flow.
Context Compiler owns deterministic model input compilation.
Agent Loop owns model decisions.
Tooling owns provider execution and normalization.
Evidence Layer owns source eligibility and citation records.
Report Pipeline owns draft/review/revise orchestration.
Finalizer owns deterministic commit.
State owns durable execution facts.
Gateway owns frontend projection.
Memory owns later user-scoped cross-session recall.
Delegation owns later bounded fan-out/fan-in.
```

## 12. 变更规则

产品范围或里程碑变化时，先更新本文和 `13-research-workflow.md`，再同步实施计划、协议、存储和专题文档。专题文档不得悄悄扩大 R1 范围。
