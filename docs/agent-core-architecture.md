# Harness Agent Architecture

> 文档状态：Greenfield 顶层架构。R1 产品范围以 `00-agent-core-roadmap.md` 和 `13-research-workflow.md` 为准。

## 1. 架构目标

系统首先是终端用户产品，其内部 Agent Core 提供可恢复、可观察、证据驱动的执行闭环。

```text
Local Web
-> NestJS API
-> Lead Harness Runtime
-> Context Engineering
-> Agent Loop
-> Search Tooling / Report Pipeline
-> State + Evidence + Artifact
-> Agent Gateway / SSE
-> Conversation + Progress + Sources + Report Workbench
```

R1 只实现单 Lead 网络调研。Memory 和 Delegation 是后续 capability，不进入 R1 action/toolset/UI。

## 2. 模块文档

- [总路线图](./00-agent-core-roadmap.md)
- [Lead Runtime](./02-lead-harness-runtime.md)
- [Context Engineering](./03-context-engineering.md)
- [Agent Loop](./04-agent-loop.md)
- [Tooling](./05-tooling-execution.md)
- [State](./09-state-layer.md)
- [Stream / Gateway](./10-stream-observe.md)
- [API](./11-api-protocol.md)
- [Storage](./12-storage-schema.md)
- [Research Workflow](./13-research-workflow.md)
- [State Machine](./14-runtime-state-machine.md)
- [Implementation Plan](./17-implementation-plan.md)
- [Project Structure](./18-project-structure.md)
- [Frontend](./19-agent-frontend.md)
- [Workbench](./20-agent-workbench.md)
- [Memory, post-R1](./06-memory.md)
- [Delegation Policy, post-R1](./01-delegation-policy.md)
- [Delegation Executor, post-R1](./07-delegation-executor.md)
- [Worker Runtime, post-R1](./08-worker-harness-runtime.md)

## 3. 领域模型

```text
User
  -> Session
      -> Message
      -> Run
          -> Step
              -> ModelAction
              -> ToolCall
          -> StateRecord
          -> RuntimeEvent
          -> EvidenceSource
      -> Artifact
```

定义：

- `User`：数据所有者。R1 只有自动创建的 local user。
- `Session`：长期对话和任务容器，可包含多次 run。
- `Run`：一次用户任务执行，从 created 到 terminal。
- `Step`：一次 context compile、model decision 和 action dispatch。
- `StateRecord`：durable execution fact。
- `EvidenceSource`：可支撑正式引用的持久化原文片段。
- `Artifact`：报告、草稿或大内容的文件元数据与 content ref。

后续 user Memory 位于 User 之下，通过 sourceRefs 指向 prior-session facts；它不改变 Session/Run 主链路。

## 4. R1 数据流

```text
User message
  -> create Run
  -> load StateSnapshot
  -> compile CompiledStepContext
  -> AgentLoop decides
       ask_clarification
       tool_call(web_search / web_fetch)
       finish_research
       fail
  -> dispatch
  -> append facts/events
  -> next Step
```

报告链路：

```text
SearchResult
  -> clue or evidence candidate
  -> selected cited passages
  -> EvidenceSource[]
  -> report_draft Artifact
  -> ReportReview
  -> revised report Artifact
  -> CitationValidator
  -> Finalizer
  -> completed standard/limited report
```

## 5. Context Boundary

所有模型输入必须是 `CompiledStepContext`。

模型不直接读取：

- full database state
- raw provider response
- API Key/env
- full Artifact
- Observe trace
- prior session history
- future full MemoryRecord

ContextMaterialLoader 负责 I/O 和授权，ContextCompiler 负责纯函数编译。

外部搜索内容进入独立 untrusted evidence section，不能与 system/user instructions 混合。

## 6. Action Boundary

R1 Lead action 随阶段 gated，目标集合：

```text
tool_call
ask_clarification
finish_research
fail
```

P5 baseline 临时启用 `final_answer` 验证模型闭环；P6 起 research run 使用 `finish_research` 进入 Report Pipeline，不能用 `final_answer` 绕过 review/validation。

`steer` 和 `cancel` 是用户控制命令，不是模型 action。

Report draft/review/revision 使用 canonical structured output schema，但不是面向用户的 Lead action。

Post-R1 才增加：

```text
request_ref_expansion for user Memory evidence
delegate_to_workers
```

## 7. Runtime Boundary

Runtime 负责：

- run/step lifecycle
- safe-step scheduling
- canonical action dispatch
- budget/timeout
- steer inbox
- cancel propagation
- terminal handling

Runtime 不负责：

- prompt/content selection
- provider response interpretation
- evidence eligibility
- report writing/review
- citation validation logic
- Memory extraction
- worker result merge

能力通过 `ActionHandler` 或显式 pipeline service 接入。

## 8. Search Tooling

模型只看到 `web_search` 和 `web_fetch`。Tooling 内部拥有：

```text
SearchProvider registry
-> primary provider
-> fallback policy
-> provider adapter
-> normalization
-> clue/evidence-candidate metadata
-> ToolExecutionResult
```

Tool 不生成业务结论，不决定报告完成，也不分配 `evidenceId/displayId`。

## 9. Evidence and Citation

Evidence Layer 是 R1 的核心边界：

```text
snippet-only          clue
content/passage       evidence candidate
selected passage      durable EvidenceSource
[Sx]                  presentation alias to EvidenceSource
```

CitationValidator 确定性检查引用存在性、资格、来源列表映射和 Artifact hash。语义支持度由 report review 和 evaluation suite 检查。

## 10. State / Artifact

PostgreSQL 保存：

- user/session/message/run/step
- StateRecord/StateRef
- runtime/stream event
- tool call metadata
- evidence metadata and cited passages
- Artifact metadata
- later Memory metadata

本地文件系统保存：

- report drafts/final reports
- large provider response under short retention
- other Artifact content

State 是事实源，Stream/Workbench 是投影。

## 11. Stream / Workbench

```text
State + RuntimeEvents
  -> Agent Gateway projector
  -> SSE
  -> frontend projection/reducer
  -> Conversation / Progress / Sources / Report / Activity
```

用户可见 logical tool execution 通过稳定的 `runId/stepId/toolCallId` 连接 Conversation run progress card 与 Workbench Activity；该连接是 projection identity，不改变 Tooling 或 State 的所有权边界。

Debug 是唯一默认显示 raw events/state 的区域。R1 不展示 Browser、Terminal、Memory 或 Worker tab。

## 12. User Control

`ask_clarification`：run 进入 `waiting_for_user`，不消耗搜索预算。

`steer`：持久化并排入 control inbox，从下一安全 step 生效，不重写当前 action，默认不重置预算。

`cancel`：阻止新 step，尝试取消当前 provider/model call，保留已完成 facts 和 partial Artifact，run 进入 `cancelled`。

## 13. Completion

Run terminal status：

```text
completed / failed / cancelled / timeout / interrupted
```

报告质量独立表达：

```text
standard / limited
```

零 eligible evidence 不允许 completed。`limited` 不新增 terminal status。

## 14. Framework Boundary

```text
React/Vite        presentation
NestJS            HTTP/SSE/config/DI/module assembly
Prisma            PostgreSQL repository implementation
OpenAI SDK        model transport adapter
Provider clients  search adapter implementation
```

Canonical protocol 和 domain core 不依赖这些框架。

## 15. Post-R1 Capabilities

### User Memory

- 只有 user scope。
- 可跨 session retrieval。
- prior-session evidence 只能通过 Memory sourceRefs 显式展开。
- 明确长期偏好可 auto-active。
- 推断偏好进入 candidate。
- 网页事实和单次调研内容不写入 Memory。

### Delegation

- 一轮 bounded fan-out/fan-in。
- worker 不再次 delegation。
- worker 不交付最终报告。
- Lead 仍执行 report review、citation validation 和 finalization。

## 16. 依赖方向

```text
agent-protocol
  <- domain core
      <- NestJS adapters/modules
  <- agent-testkit
  <- Web projections
```

State、Tooling、Evidence、Report、Memory 和 Delegation 通过显式接口连接，不互相读取私有 repository。

## 17. 架构验收

架构成立的判据不是目录齐全，而是：

1. R1 黄金流程闭环。
2. 外部内容与指令分区。
3. 引用可追溯且可确定性验证。
4. Runtime 不承接模块业务逻辑。
5. Session/Run 可恢复。
6. capability 可以按阶段增加而不改写主循环。
