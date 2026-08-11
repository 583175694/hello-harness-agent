# Delegation Policy

> 文档状态：未进入当前路线图的探索草案，不代表已承诺 capability 或冻结协议。

## 1. 定义

Delegation Policy 是 Lead Loop 选择 `delegate_to_workers` 时必须满足的约束，不是独立 planner 或模型调用。

```text
Policy decides whether delegation is allowed and worthwhile.
Executor performs one bounded fan-out/fan-in round.
Lead remains owner of the user task and final report.
```

## 2. 前置条件

P11 只能在以下基线稳定后启用：

- R1 单 Lead research workflow
- EvidenceSource/citation contract
- Report review/revise pipeline
- Runtime cancel/recovery
- user/session ownership
- scoped toolset and budget

Delegation 不得改写这些契约。

## 3. 输入

Policy 只能基于当前 `CompiledStepContext` 已披露内容判断：

- task frame
- open research gaps
- current phase
- selected evidence/clues
- remaining budget
- available worker capability
- optional selected User MemoryCards

Policy 不直接读取 full State、prior sessions、raw provider responses 或 full Memory。

## 4. 何时委派

适合：

- 存在两个以上相互独立的 research gaps
- 可并行验证不同假设/对象/地域
- 多来源交叉验证能显著增加可靠性
- 子任务可以有明确输入 refs 和输出 contract
- 剩余时间/provider/model budget 足够

不适合：

- 单次 `web_search` 或 `web_fetch` 即可推进
- 任务需要用户澄清
- 子任务强依赖、无法隔离
- 只是为了“任务很难”而并行
- 已有 evidence 足以进入 report pipeline
- delegation 会突破 3-5 分钟/预算目标且用户未选择更深模式

## 5. Action

```ts
type DelegateToWorkersAction = {
  type: 'delegate_to_workers';
  intent: 'collect' | 'compare' | 'verify' | 'analyze';
  objective: string;
  gapRefs: StateRef[];
  inputRefs: StateRef[];
  resultContract: {
    requiredFields: string[];
    evidenceRequired: boolean;
  };
  workerHints?: Array<{
    objective: string;
    required: boolean;
  }>;
};
```

模型不能在 action 中指定 provider credential、任意 user/session ID、MCP endpoint 或无限预算。

## 6. Guardrails

P11 默认：

```text
max delegation rounds/run   2
max workers/round           4
max nesting                 1
worker-to-worker            disabled
worker delegation           disabled
worker final report         disabled
```

具体限制由 Runtime config 决定，模型不能扩大。

## 7. Ownership / Authorization

- 所有 input refs 属于当前 user。
- 默认只使用当前 session/run refs。
- Prior-session refs 只能来自已授权 User Memory sourceRefs。
- Worker 只收到显式 granted refs。
- Worker toolset 不继承 Lead toolset。

## 8. Evidence Contract

Worker 可以返回 evidence candidates 和 passage refs，但不能自行提交最终 `[Sx]` 报告。

Delegation merge 后：

```text
worker results
-> merged_result
-> Lead selects/normalizes durable EvidenceSource
-> Lead report draft/review/revise
-> CitationValidator
-> Finalizer
```

## 9. Result

Policy 不生成结果。Executor 产出：

```text
worker_result[]
delegation_result
merged_result
```

下一 Lead step 决定是否继续搜索、补证据或进入 report pipeline。

## 10. Failure

部分 worker 失败默认成为 gaps/errors，不直接使 run failed。Required gap 无法满足时，Lead 决定 fallback、limited report 或 failed。

## 11. Observe / UI

普通 UI 展示用户可读进度，例如“正在并行验证 3 个方向”，不展示 policy prompt 或 worker raw trace。

Debug 可记录 delegation reason、estimated benefit、budget 和 outcome。

## 12. P11 验收

1. 简单查询不委派。
2. 无清晰 gapRefs 不委派。
3. 不超过 round/worker/nesting limits。
4. Worker refs/toolset 显式授权。
5. Worker 不能交付 final report。
6. merged result 回到 Lead Evidence/Report pipeline。
7. cancel/timeout 可传播。
