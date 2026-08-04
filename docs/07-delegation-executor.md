# Delegation Executor

> 文档状态：Greenfield P11 capability。Executor 不属于 R1。

## 1. 定义

Executor 接收已经通过 Policy/Action validation 的 `DelegateToWorkersAction`，执行一轮 bounded fan-out/fan-in。

它不决定是否委派、不改写用户目标、不生成最终报告。

## 2. 输入

```ts
type DelegationExecutorInput = {
  userId: string;
  sessionId: string;
  runId: string;
  leadStepId: string;
  action: DelegateToWorkersAction;
  limits: {
    maxWorkers: number;
    roundTimeoutMs: number;
    maxModelCallsPerWorker: number;
    maxProviderCallsPerWorker: number;
  };
};
```

## 3. DelegationRound

```ts
type DelegationRoundStatus =
  | 'created'
  | 'validating'
  | 'running'
  | 'merging'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'timeout';
```

每轮有稳定 ID、sequence、action ref、worker run refs、budget 和 terminal result ref。

## 4. WorkerTaskFrame

Executor 确定性地把 action 拆为有限 WorkerTaskFrame：

```ts
type WorkerTaskFrame = {
  workerId: string;
  objective: string;
  gapRefs: StateRef[];
  inputRefs: StateRef[];
  constraints: string[];
  expectedOutput: WorkerResultContract;
  grantedToolNames: string[];
  budget: WorkerBudget;
  required: boolean;
};
```

如果 action 无法形成清晰、隔离的 frame，Executor validation failed，不允许自由让 worker 重新规划整个任务。

## 5. Ref Grant

```text
validate current user ownership
-> validate current session or authorized Memory source path
-> freeze allowed refs
-> ContextMaterialLoader creates worker-scoped cards
```

Worker 不能通过猜 ID 扩大 scope。

## 6. Tool Grant

Worker toolset 由 Runtime/Tooling policy 与 task need 交集产生。

P11 research worker 通常只允许 scoped `web.search`，且 provider/tool budget 独立计数。不能注册新工具、provider 或 MCP endpoint。

## 7. Fan-out

- 有界 worker pool。
- 每个 worker 独立 State scope/run ID。
- 公平调度，不允许单 worker 吞掉 round budget。
- 父 run cancel/timeout 传播到全部 active workers。

## 8. Worker Result

```ts
type WorkerResult = {
  workerId: string;
  status: 'completed' | 'partial' | 'failed' | 'cancelled' | 'timeout';
  summary: string;
  findings: Array<{
    claim: string;
    evidenceCandidateRefs: StateRef[];
    confidence: 'low' | 'medium' | 'high';
  }>;
  gaps: string[];
  errors: string[];
  artifactRefs: StateRef[];
};
```

Worker result 是内部材料，不是用户报告。

## 9. Fan-in / Merge

Merger 是确定性结构合并器：

- 收集 terminal results
- 按 gap/objective 分组
- 去重 refs
- 保留冲突，不替 Lead 裁决
- 标记 required worker/gap 缺失
- 生成 delegation_result 和 merged_observation

Merger 不调用模型、不写最终结论。

## 10. Enough-to-merge

允许以下情况开始 merge：

- 全部 worker terminal
- required workers terminal 且 optional 超时
- 父 run cancel/timeout
- round budget 耗尽

不得因为“看起来够了”丢弃仍在运行的 required worker，除非有明确 cancellation policy。

## 11. Partial Failure

```text
optional failure -> round may complete/partial
required failure -> round partial or failed
all unusable      -> failed
parent cancel     -> cancelled
deadline          -> timeout/partial based on usable results
```

可用部分结果仍必须 durable 并回到 Lead。

## 12. Durable Ordering

```text
create round
-> create worker runs/frames/grants
-> worker terminal facts
-> worker_result records/artifacts
-> delegation_result
-> merged_observation
-> round terminal
-> next Lead step
```

下一 Lead step 不能早于 merged_observation durable。

## 13. Cancel / Timeout

父 cancel：阻止新 worker，abort active worker/provider calls，等待有界 cleanup，保留 terminal partial facts。

Round timeout 不自动等于 parent run timeout；Lead 可以基于 partial observation 继续或交付 limited report。

## 14. Resume / Idempotency

Resume：

- 不重启 terminal worker。
- 只恢复未 terminal worker/merge。
- 已存在 delegation_result/merged_observation 时不重复生成。
- merge 输入集合和版本决定 deterministic hash。

## 15. Events

内部：round/worker started/completed/failed/merged。

用户 projection：并行方向数量、整体进度、部分失败提示。Raw WorkerTaskFrame/trace 只在 Debug。

## 16. Evidence / Report Boundary

Executor 不分配最终 report source alias，不运行 CitationValidator，不调用 Finalizer。

Lead 接收 merged_observation 后选择真正用于报告的 EvidenceSource，完成 review/revise/validate。

## 17. P11 验收

1. 有界 fan-out。
2. 显式 refs/tool grants。
3. worker 隔离。
4. partial/timeout/cancel 语义稳定。
5. deterministic merge。
6. downstream facts 先于 Lead next step。
7. worker result 不绕过 Report Pipeline。
