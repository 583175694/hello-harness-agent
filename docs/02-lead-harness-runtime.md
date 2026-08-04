# Lead Harness Runtime

> 文档状态：Greenfield R1 Runtime 契约。

## 1. 定义

Lead Runtime 是 run-level lifecycle shell：

```text
run lifecycle + safe-step scheduling + action dispatch + controls + terminal handling
```

它串联 Context Engineering、Agent Loop、Tooling、Research Pipeline、State、Artifact 和 Gateway，但不实现这些模块的业务逻辑。

## 2. 输入

```ts
type LeadRuntimeInput = {
  userId: string;
  sessionId: string;
  runId: string;
  inputMessageId: string;
  limits: {
    maxSteps: number;
    maxModelCalls: number;
    maxSearchQueries: number;
    maxProviderCalls: number;
    runTimeoutMs: number;
  };
};
```

R1 user 是 bootstrap local user。Runtime 仍要求显式 user/session ID，避免全局裸读。

## 3. 依赖

```text
StateStore
ContextMaterialLoader
ContextCompiler
AgentLoop
ActionDispatcher
ReportPipeline
EventSink
ArtifactStore
ResponseFinalizer
ControlInbox
Clock / IdGenerator
```

依赖都是 interface，不是 NestJS/Prisma/OpenAI SDK concrete type。

## 4. 主循环

```text
load run
-> check terminal/cancel/timeout
-> apply pending steer at safe boundary
-> create step
-> load frozen materials
-> compile context
-> AgentLoop.decide
-> validate canonical action
-> durable model_action
-> dispatch
-> durable outcome/observation
-> next step or phase pipeline
-> deterministic finalization
```

每个 next step 都从最新 durable StateSnapshot 重新编译 context。

## 5. R1 Action Dispatch

### final_answer (P5 baseline only)

普通 final answer 仅用于 P5 baseline，P6 起从 research action gate 移除。

### tool_call

R1 只允许 `web.search`。Runtime 把 canonical request 交给 Tooling，不解析 provider raw output。

### ask_clarification

提交 question message/state/event，run 进入 waiting_for_user。用户回复后在同一 run 创建下一 step。

### finish_research

表示模型认为当前 evidence/gaps 已达到报告条件。Runtime 校验至少存在 eligible evidence candidate 和剩余 report budget，然后进入 ReportPipeline。它本身不包含最终报告正文。

### fail

提交 structured failure 和用户可见错误，run 进入 failed。

Post-R1 才增加 Memory ref expansion 和 delegation handler。

## 6. Research Phase Orchestration

Runtime 只调度 phase service：

```text
planning/searching/selecting_evidence
-> ReportPipeline determines ready-for-draft by explicit contract
-> drafting
-> reviewing
-> revising
-> validating
-> finalizing
```

Runtime 不生成 query、选择证据、写 review 或解释 citation failure。

## 7. Completion Guard

Research run completed 前必须满足：

- 至少一个 eligible EvidenceSource。
- revised report Artifact completed。
- ReportReview durable。
- CitationValidation passed。
- reportQuality 为 standard 或 limited。
- Finalizer commit transaction 成功。

零 evidence、未验证 Artifact 或 clue-only citation 都不能 completed。

## 8. Safe Step

Safe boundary 是：

- 当前 model action 尚未开始；或
- 当前 downstream action 已 terminal 且 facts 已 durable；或
- phase service 即将编译下一 context。

Steer 只在 safe boundary 应用。

## 9. Steer

```text
API append control(pending)
-> event run_steered
-> current action continues
-> next safe boundary
-> ContextMaterialLoader includes steer
-> control applied
```

Steer：

- 不改写当前 model_action。
- 不直接取消 tool。
- 默认不重置 ResearchBudget。
- 多条 steer 按 durable sequence 应用。

## 10. Cancel

```text
cancel requested
-> prevent new step
-> propagate AbortSignal
-> preserve completed facts/partial Artifact
-> active action terminal
-> run cancelled
```

Late provider/model result 不得在 cancel terminal 后触发下一 step。

## 11. Clarification

Waiting run：

- 不运行 model/provider。
- active execution timeout 暂停。
- clarification deadline 可独立配置。
- 只接受匹配 questionId 的回答。
- 普通 steer 不能代替 clarification。

## 12. Budget

Runtime 持有权威 budget counters。模型、Tooling 和 provider 只能消费授权额度。

```text
model call
search query
provider attempt
step
elapsed time
```

Fallback provider attempt 计数。Waiting 时间不计入 active search duration，但可计入 run wall-clock policy。

## 13. Durable Ordering

```text
downstream result
-> Artifact/content durable if required
-> StateRecord/refs durable
-> observation durable
-> events durable/projectable
-> current step completed
-> next step
```

Finalizer：

```text
validated report action + completed Artifact + passed CitationValidation
-> assistant delivery message
-> final State facts
-> answer/report/run completed events
-> run completed
```

## 14. Resume

Runtime 恢复时检查：

- run/step status/version
- terminal downstream facts
- pending controls
- active phase
- Evidence/Artifact/CitationValidation

已经 durable 的 tool call、review、validation 或 finalization 不重复执行。

## 15. Idempotency

Runtime start、dispatch、control application 和 finalization 都需要 idempotency key/unique transition guard。重复调用返回已有 outcome。

## 16. Events

Runtime 产生 domain source events；Gateway 决定用户投影。至少包括 run/step/control/phase/terminal 事件。Provider、Evidence、Report 细节由对应模块产生。

## 17. 不负责

- 直接使用 PrismaClient
- 拼 system prompt
- 调 OpenAI SDK
- 调搜索 SDK
- 解析网页内容
- 分配 `evidenceId/displayId`
- 写/审报告
- 校验 citation 业务规则
- 提炼 Memory
- merge worker result

## 18. Post-R1

P9/P10 Memory 通过 ContextMaterialLoader 和 async terminal hook 接入，不修改主循环。

P11 Delegation 通过新增 action handler 接入；worker outcome 仍回到下一 Lead step，最终报告仍走同一 ReportPipeline。
