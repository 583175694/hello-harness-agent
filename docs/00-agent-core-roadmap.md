# Harness Agent Roadmap / 总指挥文档

> 文档状态：权威路线图。本文定义目标范围和顺序，实际完成状态以 `docs/implementation-status.md` 为准。

本文是项目范围、产品方向、架构不变量和里程碑顺序的最高优先级文档。

## 1. 产品定义

Harness Agent 是一个面向终端用户的本地任务工作台，产品形态参考 Manus。首个真实用户版本优先验证通用型 Agent 的完整任务体验，其中联网调查的黄金能力是：

```text
用户提出需要联网的信息任务或直接提供 URL
-> Agent 搜索并选择值得阅读的公开来源
-> 读取网页并筛选与当前问题相关的可定位原文片段
-> 过滤无效和低价值材料
-> 由模型判断继续调查、改换来源或交付回答
-> 基于真正读取过的来源完成普通回答
-> Conversation 与 Workbench 展示工具进度和轻量来源
```

首个真实用户版本不是 Agent Runtime SDK，也不是通用工具市场。Runtime、State、Context、Tooling 和 Workbench 都服务于通用 Agent 的端到端产品体验。当前阶段不把正式 Evidence、`[Sx]`、报告复核、Citation Validator 或 Artifact Finalizer 作为前置条件，也不承诺这些尚未确定的未来能力。

当前联网调查实施边界见 [17-implementation-plan.md](./17-implementation-plan.md) 和 [23-web-fetch-tool.md](./23-web-fetch-tool.md)；[13-research-workflow.md](./13-research-workflow.md) 只是可能的后续 Deep Research 设计草案，不约束当前实现。Model、Runtime、Tool 与 Projection 的决策权以 [25-model-led-tool-boundary.md](./25-model-led-tool-boundary.md) 为准；当前 Run、SSE 重连、快照与取消方案以 [26-connection-durable-agent-loop.md](./26-connection-durable-agent-loop.md) 为准；Reasoning、Tool transcript、跨轮回放和模型兼容边界以 [27-reasoning-context-transcript.md](./27-reasoning-context-transcript.md) 为准。

## 2. 当前基线

当前仓库已经具备工程基线、durable Session/Message、OpenAI-compatible 普通对话、Chat SSE、通用工具循环、`web_search -> web_fetch -> 相关 Passage -> 普通回答` 和真实 Workbench 投影。P7 General Web Research Hardening、P8 Model-led Tool Boundary、Connection-Durable Agent Loop 与 Reasoning Context Transcript 均已完成；Ordered Model Rounds、Canonical Live Projection、版本化 Checkpoint、Event Tail、严格 SSE cursor、Run 状态 CAS、durable model transcript 和选择性 reasoning replay 已落地。下一优先项是 Context Engineering；Memory 和 Delegation 尚未完成。评估体系暂缓，后续作为独立模块重新设计。

详细代码状态、验证记录和已知限制统一维护在 [implementation-status.md](./implementation-status.md)。只有代码、测试和验收记录同时存在时，能力才算完成。

## 3. 首次发布范围

首个真实用户版本必须包含：

- 本地 Web UI 和 API
- durable Session/Message，以及客户端断线可恢复的 Run/Step 与 UI snapshot
- OpenAI SDK 模型适配器，支持配置 `baseURL`、`apiKey` 和模型配置表
- 单 Lead 多 step loop
- `ask_clarification`
- `steer`，从下一安全 step 生效
- `cancel`
- 主搜索供应商和 fallback 搜索供应商
- 每个 assistant run 最多 20 次 Tool Call、Search/Fetch 单次能力边界，以及模型和工具各自独立的单操作超时与取消传播
- 搜索摘要 Clue、已读取 Source 和最终采用 Source 的轻量区分
- 正文可用性判断、单次调用内去重和模型主导的调查停止决策
- query-aware 原文 Passage 筛选，外部内容不能改变 Agent 指令和执行边界
- 基于真正读取来源的普通回答与 Sources / Activity Workbench
- 部分来源失败或触及通用硬边界时使用已有材料平稳交付

当前首次发布不要求服务端重启后自动续跑。进程重启导致的 active Run 必须明确收敛为 `failed + RUN_INTERRUPTED`；Checkpoint、Worker lease 和跨进程接管仅保留未来升级空间。

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

### 7.2 Context Engineering（后续方向）

当前不冻结 Context Compiler 接口。未来如果真实运行数据证明有必要，应面向 System Prompt、历史消息、用户输入、Assistant Tool Calls、Tool Results 和最终回答预留等完整上下文统一计量、选择、压缩和编译；不能用 Web Research 或 Tool observation 的局部字符预算代替。

### 7.3 Thin Runtime

Runtime 只拥有 lifecycle、step scheduling、action dispatch、steer/cancel 传播和 terminal handling。

Runtime 不做搜索结果理解、引用选择、报告 review、Memory 提炼或答案重写。

### 7.4 当前来源边界

```text
provider snippet  = discovery clue
fetched passage   = 已读取的不可信原文
used source       = 最终回答包含该来源 URL
```

外部内容只能作为不可信数据进入 Tool Message，不能成为 system/user instruction。当前 `used` 不表示逐句引用或正式 Evidence。

### 7.5 未确定能力

正式 Evidence、Citation Validator、报告复核和 Artifact Finalizer 当前不在实施范围，也不作为其他模块的前置依赖。未来如有明确产品需求，再分别制定契约和实施方案。

### 7.6 Capability Gating

未进入当前阶段的 capability 不创建空实现、不返回伪成功、不出现在工具集或 UI 中。

## 8. Runtime 主线

```text
User/API
-> Chat / Agent Runtime
-> Model semantic decision
-> Tool Registry / Tool execution
-> Tool Result message
-> Model continues or answers
-> Message persistence
-> Conversation / Workbench projection
```

当前生产 Runtime 将 Tool 的 canonical `output/error` 统一序列化为 Tool Message 并注入下一模型轮次。未来如果建设 Context Engineering，应面向完整上下文统一选择、压缩和编译，而不是围绕 Tool Result 建立局部字符预算。

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
P8  Recovery + Release Hardening
R1  First User-Ready General Agent Release
P9  User Memory Read Path
P10 User Memory Write/Review
P11 Bounded Delegation + Worker
P12 Multi-user Authentication + Remote Storage
```

P8 Recovery 切片采用 [Connection-Durable Agent Loop](./26-connection-durable-agent-loop.md)：Run 已独立于客户端连接，Snapshot/sequence、Tail replay、客户端 cursor 和取消终态的时序加固已经完成；不实现服务端重启后的自动恢复。`R1` 是第一次真实用户发布。Memory、Delegation 和 process-durable recovery 不阻塞 R1。

详细交付和验收见 [17-implementation-plan.md](./17-implementation-plan.md)。

## 10. R1 成功标准

1. 空环境按 README 可启动 PostgreSQL、API 和 Web。
2. 用户可以创建和恢复 durable session；刷新或客户端断线不会取消 active Run。
3. Agent 能对明确任务直接开始，对阻塞性歧义只问一个问题。
4. 运行中 steer 从下一安全 step 生效，cancel 可终止活动执行。
5. Agent 在通用执行边界内迭代 Search/Fetch，由模型根据 Tool Result 判断信息是否充分并及时交付。
6. 无效页面和无关 Passage 不被当作有效调查结果；单次工具调用中的重复输入不重复执行。
7. 搜索摘要 Clue 与成功读取的 Source 明确区分，最终普通回答优先使用真正读取过的来源。
8. URL、标题、provider、retrievedAt、相关 Passage 和工具 Activity 可以随会话轻量恢复。
9. 部分来源失败或通用硬边界触发时，Agent 能使用已有材料平稳交付并说明限制。
10. Workbench 能恢复 Search、Fetch、成功、失败和最终采用来源。
11. contract/integration/UI 测试通过。

## 11. 决策所有权

```text
Product Spec owns golden workflow and release quality.
Protocol owns canonical schemas.
Model owns semantic planning and task decisions.
Runtime owns execution flow and generic hard boundaries.
Context Engineering may own complete model-input compilation when implemented.
Agent Loop turns model decisions into bounded execution.
Tooling owns capability execution and canonical result normalization.
State owns durable execution facts.
Gateway owns frontend projection.
Memory owns later user-scoped cross-session recall.
Delegation owns later bounded fan-out/fan-in.
```

## 12. 变更规则

产品范围或里程碑变化时，先更新本文和 `13-research-workflow.md`，再同步实施计划、协议、存储和专题文档。专题文档不得悄悄扩大 R1 范围。
