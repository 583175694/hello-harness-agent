# Harness Agent Roadmap / 总指挥文档

> 文档状态：权威路线图。本文定义目标范围和顺序，实际完成状态以 `docs/implementation-status.md` 为准。

本文是项目范围、产品方向、架构不变量和里程碑顺序的最高优先级文档。

## 1. 产品定义

Harness Agent 是一个面向终端用户的本地任务工作台，产品形态参考 Manus。首个真实用户版本优先验证通用型 Agent 的完整任务体验，其中联网调查的黄金能力是：

```text
用户提出需要联网的信息任务或直接提供 URL
-> Agent 搜索并选择值得阅读的公开来源
-> 读取网页并筛选与当前问题相关的可定位原文片段
-> 过滤无效、重复和低价值材料
-> 在有限资源内继续调查或主动早停
-> 基于真正读取过的来源完成普通回答
-> Conversation 与 Workbench 展示工具进度和轻量来源
```

首个真实用户版本不是 Agent Runtime SDK，也不是通用工具市场。Runtime、State、Context、Tooling 和 Workbench 都服务于通用 Agent 的端到端产品体验。正式 Evidence、`[Sx]`、报告复核和 Citation Validator 保留为后续 Deep Research 或严谨垂直场景能力，不作为当前版本前置条件。

当前联网调查实施边界见 [17-implementation-plan.md](./17-implementation-plan.md) 和 [23-web-fetch-tool.md](./23-web-fetch-tool.md)；[13-research-workflow.md](./13-research-workflow.md) 保留为后续 Deep Research 产品契约。

## 2. 当前基线

当前仓库已经具备工程基线、durable Session/Message、OpenAI-compatible 普通对话、Chat SSE、通用工具循环、`web_search -> web_fetch -> 相关 Passage -> 普通回答`、真实 Workbench 投影和独立真实评测工具。P7 General Web Research Hardening 已完成，当前进入 P8 Evaluation / Release Hardening；durable Run/State、Memory 和 Delegation 尚未完成。

详细代码状态、验证记录和已知限制统一维护在 [implementation-status.md](./implementation-status.md)。只有代码、测试和验收记录同时存在时，能力才算完成。

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
- 有界的 Search、Fetch、工具调用、总执行时间和累计上下文安全预算
- 搜索摘要 Clue、已读取 Source 和最终采用 Source 的轻量区分
- URL/final URL/contentHash 去重、正文可用性判断和无新增信息早停
- query-aware 原文 Passage 筛选，外部内容不能改变 Agent 指令和预算
- 基于真正读取来源的普通回答与 Sources / Activity Workbench
- 部分来源失败或触及资源边界时使用已有材料平稳交付
- 通用 Agent 固定题集评测和人工抽检

首次发布明确不包含：

- user Memory
- Delegation / Worker
- browser automation
- JavaScript Browser Fetch、PDF、登录态网页和其他来源格式
- 正式 Evidence/Citation、Report Artifact 和 Deep Research review pipeline
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
P7  General Web Research Hardening
P8  Recovery + Evaluation + Release Hardening
R1  First User-Ready General Agent Release
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
5. Agent 在预算内执行迭代 Search/Fetch，信息充分时早停，预算耗尽后不重复调用不可用工具。
6. 无效页面、重复 URL/正文和无关 Passage 不被当作有效调查结果。
7. 搜索摘要 Clue 与成功读取的 Source 明确区分，最终普通回答优先使用真正读取过的来源。
8. URL、标题、provider、retrievedAt、相关 Passage 和工具 Activity 可以随会话轻量恢复。
9. 部分来源失败、总时间或上下文安全阀触发时，Agent 能使用已有材料平稳交付并说明限制。
10. Workbench 能恢复 Search、Fetch、成功、失败、重复、预算和最终采用来源。
11. contract/integration/UI 测试通过。
12. 通用 Agent 固定题集评测通过并完成人工抽检。

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
