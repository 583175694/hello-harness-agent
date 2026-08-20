# Runtime State Machine

> 文档状态：后续完整 durable Runtime 状态草案。当前 Connection-Durable Agent Loop 只冻结 `queued/running/cancel_requested/completed/failed/cancelled`，不实现 `waiting_for_user`、可恢复 `interrupted`、Checkpoint resume 或服务端重启自动续跑；具体以 [26-connection-durable-agent-loop.md](./26-connection-durable-agent-loop.md) 为准。
>
> K3.1/K3.2 实施时，Interrupt/Resume、`waiting_for_user`、`paused`、恢复回到 `queued` 以及 Cancel 竞态以 [28-interrupt-resume-control-plane.md](./28-interrupt-resume-control-plane.md) 和 [29-clarification-and-tool-approval.md](./29-clarification-and-tool-approval.md) 为准。本文的 `interrupted`、`timeout`、Steer 和完整 Retry 状态仍是远期草案，不能覆盖 K3 已冻结契约。

## 1. 原则

- terminal 状态不可自动回退。
- `waiting_for_user` 不是 terminal。
- steer 是 queued control，不是 run status。
- report quality 与 run terminal status 分离。
- downstream durable facts 先于下一 step。
- cancel/timeout 向当前 model/provider/tool 传播。
- resume 依赖 PostgreSQL State，不依赖进程内对象。

## 2. RunStatus

```ts
type RunStatus =
  | 'created'
  | 'queued'
  | 'running'
  | 'waiting_for_user'
  | 'interrupted'
  | 'cancelled'
  | 'timeout'
  | 'failed'
  | 'completed';
```

```text
created -> queued -> running
running -> waiting_for_user -> running
running -> completed
running -> failed
running -> cancelled
running -> timeout
running -> interrupted
waiting_for_user -> cancelled / timeout / running
```

`completed` 必须满足报告或 final answer 的 deterministic commit 条件。

## 3. ResearchPhase

```ts
type ResearchPhase =
  | 'clarifying'
  | 'planning'
  | 'searching'
  | 'selecting_evidence'
  | 'drafting'
  | 'reviewing'
  | 'revising'
  | 'validating'
  | 'finalizing';
```

Phase 是 progress/recovery 信息，不替代 RunStatus。

## 4. ReportQuality

```ts
type ReportQuality = 'standard' | 'limited';
```

只有 completed research run 才能有 reportQuality。证据不足但仍有可靠结果使用 `completed + limited`；零 eligible evidence 使用 `failed`。

## 5. StepStatus

```ts
type StepStatus =
  | 'created'
  | 'compiling_context'
  | 'calling_model'
  | 'action_ready'
  | 'dispatching'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';
```

```text
created
-> compiling_context
-> calling_model
-> action_ready
-> dispatching
-> completed
```

Step completed 条件：action 和 downstream outcome 已 durable，或 clarification 已提交并将 run 转为 waiting。

## 6. ModelAction

```ts
type ModelActionStatus = 'received' | 'validating' | 'valid' | 'invalid' | 'dispatched';
```

Action 一旦 dispatched 不原地修改。Invalid action 只能在有界 repair 内产生新的 candidate action。

## 7. ToolCallStatus

```ts
type ToolCallStatus =
  | 'created'
  | 'validating'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timeout';
```

Search fallback 仍属于同一个 logical tool call，但每次 provider attempt 都记录 trace/attempt fact。

未来 durable Tool succeeded 必须先保存 normalized result 和必要的 execution fact，再推进下一 step；当前不预设独立 `tool_observation` 记录，完整持久化顺序需在 durable Run 方案中重新冻结。

## 8. SearchResult Lifecycle

```ts
type SearchResultKind = 'clue' | 'evidence_candidate';
```

Provider result normalized 后立即分类。只有 `evidence_candidate` 中实际被选择的 passage 才创建 EvidenceSource。

## 9. EvidenceStatus

```ts
type EvidenceStatus = 'eligible' | 'invalidated';
```

EvidenceSource 创建后 immutable。来源失效通过 status/new fact 表达，不改写 passage。

## 10. ArtifactStatus

```ts
type ArtifactStatus = 'pending' | 'completed' | 'failed' | 'deleted';
```

```text
pending -> completed
pending -> failed
completed -> deleted
failed -> deleted
```

Finalizer 只能引用 completed Artifact。

## 11. Report Pipeline

```text
research complete
-> report_draft Artifact completed
-> ReportReview durable
-> revised report Artifact completed
-> CitationValidation passed
-> Finalizer commit
-> run completed
```

Citation validation failed 时允许有界修复回到 revising；超过上限进入 failed。

## 12. Waiting For User

`ask_clarification`：

1. question message/state durable。
2. run -> waiting_for_user。
3. 当前 step completed。
4. 搜索预算暂停。
5. 匹配 questionId 的 clarification 创建下一 step。

普通 steer 不能恢复 waiting run；用户必须回答 clarification endpoint。

## 13. Steer Lifecycle

```ts
type RunControlStatus = 'pending' | 'applied' | 'rejected';
```

```text
steer accepted
-> control pending
-> current action finishes/cancels normally
-> next safe-step boundary
-> context includes pending steer
-> control applied
```

Terminal run 的 steer rejected。Steer 默认不重置 ResearchBudget。

## 14. Cancel Propagation

```text
cancel accepted
-> run_cancel_requested
-> prevent new step/provider/model call
-> abort active call when supported
-> preserve completed facts/partial Artifact
-> active step/tool terminal
-> run cancelled
```

Cancel endpoint 返回 accepted 时 run 可能仍在 cancellation propagation。

## 15. Timeout

Timeout 来源：run、step、model call、tool call、provider attempt。

- provider attempt timeout 可触发 fallback，但仍计入 provider call budget。
- tool/run budget timeout 不能无限 fallback。
- waiting_for_user timeout policy 独立于 active execution timeout。

## 16. Failure

可恢复 downstream failure 优先形成结构化结果让模型决定下一步；以下直接失败：

- 零 eligible evidence 且预算耗尽
- citation validation 有界修复失败
- model/provider 不可用且无 fallback
- durable commit 失败
- inconsistent State snapshot

## 17. Resume

Resume 决策：

1. 读取 run/active step/status/version。
2. 查找 downstream terminal facts。
3. 检查 pending controls。
4. 检查 Artifact/Evidence durable 状态。
5. terminal run 只恢复投影，不继续执行。
6. waiting run 等 clarification。
7. running/interrupted run 从下一个未提交动作恢复。

不得重复执行已有 terminal tool call、report validation 或 Finalizer commit。

## 18. Idempotency

状态转换使用 optimistic version/transaction。重复 event、control、provider callback 或 finalization 必须返回已有结果，不追加重复用户可见产物。

## 19. Post-R1

Memory extraction 是 run terminal 后的异步流程，不改变 run status。

Delegation/Worker 状态机在 P11 加入，但必须服从同一 cancel/timeout/durable-outcome-before-next-step 原则。
