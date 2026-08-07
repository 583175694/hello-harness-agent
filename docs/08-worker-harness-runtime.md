# Worker Harness Runtime

> 文档状态：Greenfield P11 capability。Worker 不属于 R1。

## 1. 定义

Worker Runtime 是受限的子任务执行实例：

```text
WorkerTaskFrame
-> worker-scoped context
-> narrow action loop
-> scoped tools
-> structured WorkerResult
```

Worker 不是小号 Lead，不拥有 session/run 主控制权，也不面向用户交付报告。

## 2. 与 Lead 的关系

Lead 和 Worker 可以复用框架无关的 step execution primitives、ContextCompiler、ModelAdapter 和 Tooling interfaces，但拥有不同 authority/action schema。

Worker State 使用独立 workerRunId，并关联 parent run/delegation round。

## 3. 输入

```ts
type WorkerRuntimeInput = {
  userId: string;
  sessionId: string;
  parentRunId: string;
  delegationRoundId: string;
  frame: WorkerTaskFrame;
  grantedRefs: StateRef[];
  grantedToolCards: ToolCard[];
};
```

## 4. Worker Actions

```text
tool_call
request_granted_ref_expansion
produce_worker_result
fail_worker
```

禁止：

- final_answer
- ask_clarification
- delegate_to_workers
- arbitrary prior-session search
- Memory management
- tool/provider registration
- budget expansion

## 5. Context

Worker 只看到：

- objective/constraints/output contract
- granted current-session refs
- explicitly authorized prior-session Memory evidence refs
- worker-specific observations
- remaining worker budget
- narrow toolset

Worker 不读取完整 Conversation、Session State、User Memory 或 Lead private reasoning。

## 6. Tools

Toolset 是显式 grant。Research worker 通常只获得 `web_search` / `web_fetch`，但 provider call/query/model step 上限独立且更小。

Worker tool result 仍遵守 clue/evidence candidate/untrusted content contract。

## 7. Loop

```text
compile worker context
-> decide one worker action
-> validate authority/budget
-> dispatch
-> durable worker fact/observation
-> next worker step or WorkerResult
```

Worker 达到 frame output contract 后必须 produce result，不得扩展目标。

## 8. WorkerResult

Worker 输出 claim、evidence candidate refs、confidence、gaps、errors 和 artifact refs。

它不能：

- 创建最终 report Artifact
- 分配最终 `[Sx]`
- 宣布 parent run completed
- 调 CitationValidator/Finalizer

## 9. User Memory

默认不注入。只有 Lead/Executor 明确授权、Memory policy 允许且 ref 与 frame 相关时，Worker 才收到 MemoryCard 或具体 sourceRef。

Worker 不能查询全量 user Memory。

## 10. State / Visibility

Worker raw events/results 默认 internal。Gateway 只投影用户可理解进度。Worker State 必须带 user/session/parentRun/round/workerRun ownership。

## 11. Cancel / Timeout

父 cancel、round cancel 或 worker timeout 都通过 AbortSignal 传播。Worker terminal 后不自动重试；是否重试由 Executor policy 决定。

## 12. Failure

Worker failure 返回结构化 error/gaps。它不直接使 parent run failed。Executor merge 后由 Lead 决定继续搜索、limited report 或 fail。

## 13. Security / Authority

- 不猜测或扫描 ref IDs。
- 不继承 Lead 全部工具。
- 不读取其他 worker context。
- 不动态注册 provider/MCP。
- 不写 User Memory。
- 不直接执行外部 side-effect tool（P11 默认）。

## 14. Observe

记录 worker objective、budget、context hash、tool calls、result status 和 latency。普通用户只看到聚合 progress。

## 15. P11 验收

1. Action schema 比 Lead 更窄。
2. Context/refs/tools/budget 全部 scoped。
3. 无递归 delegation。
4. 无 final report/final answer。
5. clue/evidence/untrusted content contract 不变。
6. cancel/timeout 传播。
7. structured WorkerResult 可 deterministic merge。
