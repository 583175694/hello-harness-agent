# Stream / Observe / Agent Gateway

> 文档状态：Greenfield R1 event/projection 契约。

## 1. 三层边界

```text
State            durable execution facts
Stream Events    client-facing recoverable projection events
Observe Signals  backend diagnostics and evaluation traces
```

Agent Gateway 把事实和状态变化安全地投影给 Web，不决定 Agent action。

## 2. SSE Envelope

```ts
type StreamEvent<T> = {
  version: string;
  eventId: string;
  seq: number;
  userId?: string; // 普通 payload 可省略
  sessionId: string;
  runId: string;
  type: StreamEventType;
  occurredAt: string;
  payload: T;
};
```

`seq` 在 run 内单调递增。事件先 durable 到 replay log，再发送。

## 3. R1 事件族

### Run / Control

```text
run_started
run_waiting_for_user
run_steered
run_cancel_requested
run_cancelled
run_failed
run_completed
```

### Progress

```text
step_started
step_completed
research_phase_changed
progress_updated
```

### Search / Evidence

```text
search_started
search_completed
search_failed
search_fallback_used
source_discovered
evidence_selected
```

`search_started/search_completed/search_failed/search_fallback_used` 的用户可见 projection payload 必须携带 `stepId` 和 logical `toolCallId`。同一 logical tool call 内的 provider attempts 不产生多个用户可见 execution。

### Report / Artifact

```text
report_draft_created
report_review_completed
report_revised
citation_validation_completed
artifact_created
artifact_completed
artifact_failed
answer_completed
```

## 4. 用户可见 Progress

Raw event 不直接等于 UI 文本。Projection 生成：

```text
正在规划调研
正在搜索公开来源
正在筛选可引用证据
正在撰写报告
正在复核结论与引用
正在验证引用
报告已完成 / 报告受证据限制
```

普通 UI 不显示 `model_action_ready`、context hash 或 provider raw error body。

## 5. Source Projection

```ts
type SourceProjection = {
  resultId: string;
  evidenceId?: string;
  displayId?: string;
  kind: 'clue' | 'evidence';
  title: string;
  url: string;
  provider: string;
  retrievedAt: string;
  preview?: string;
  locator?: EvidenceLocator;
  cited: boolean;
  citedBy?: string[];
};
```

Clue 必须有不同视觉/文字状态，不能伪装成可引用来源。

## 6. Report Projection

```ts
type ReportProjection = {
  status: 'drafting' | 'reviewing' | 'revising' | 'validating' | 'completed' | 'failed';
  quality?: 'standard' | 'limited';
  artifactId?: string;
  validation?: {
    passed: boolean;
    citationCount: number;
    errorCount: number;
  };
};
```

Draft delta 可以展示为 activity preview，但不能进入 final conversation answer。

## 7. Workbench Snapshot

```ts
type WorkbenchSnapshot = {
  runId: string;
  lastSeq: number;
  activity?: ActivityProjection;
  activityExecutions: ActivityExecutionProjection[];
  progress: ProgressProjection[];
  sources: SourceProjection[];
  report?: ReportProjection;
  artifacts: ArtifactProjection[];
  debugAvailable: boolean;
};
```

Snapshot 从 State/Evidence/Artifact 重建，不依赖 Observe trace。

Snapshot 只恢复资源和执行事实，不携带 `workbenchOpen`、active tab 或 focus target；这些属于客户端本地 UI selection。

## 8. Replay

客户端连接：

```text
GET events + Last-Event-ID
-> replay seq > last
-> continue live
```

Replay log 过期：

```text
STREAM_REPLAY_EXPIRED
-> GET run snapshot
-> GET workbench snapshot
-> reconnect from snapshot lastSeq
```

Reducer 必须对重复 event 幂等。

## 9. Payload Limits

Stream 只传 metadata/preview/ref：

- source preview 数量/字符受限
- report content 通过 Artifact API
- provider content 不进入 SSE
- Observe payload 不进入普通 channel
- error message 脱敏

## 10. Backpressure

Gateway 使用有界队列。慢客户端不能阻塞 Runtime/State commit。

Overload 时：

- progress preview 可合并
- terminal/control/artifact/source identity 事件不可丢
- 心跳可以跳过
- 返回结构化 overload/reconnect signal

## 11. Activity

```ts
type ActivityProjection = {
  runId: string;
  stepId: string;
  toolCallId?: string;
  kind: 'planning' | 'searching' | 'selecting_evidence' | 'drafting' | 'reviewing' | 'validating';
  title: string;
  detail?: string;
  status: 'pending' | 'running' | 'waiting' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
};

type ActivityExecutionProjection = ActivityProjection & {
  metrics?: {
    durationMs?: number;
    queryCount?: number;
    sourceCount?: number;
  };
};
```

Provider 名称可以作为来源 metadata 展示，但不展示 API Key、baseURL 或内部 fallback policy details。

普通 Activity 以 logical tool call 为最细执行单位。Provider attempt、request/response、内部 retry trace 只进入 Observe/Debug；普通 projection 仅提供用户可理解的 fallback/timeout 摘要。

## 12. Control Projection

Steer：立即显示“已接受，将在下一步骤应用”，应用后 progress 可确认方向更新。

Cancel：先显示 cancelling，收到 terminal event 后显示 cancelled。

Clarification：Conversation 展示单个问题，run 状态 waiting；用户回复后恢复 progress。

## 13. Observe Signals

### ToolTrace

- provider attempts/fallback reason
- latency/error/timeout
- clue/candidate counts
- budget before/after

### ContextTrace

- context hash/token estimate
- included/omitted refs
- untrusted evidence truncation

### ReportTrace

- draft/review/revision IDs
- unsupported claim counts
- citation validation outcome
- report quality

### EvaluationTrace

- fixture/eval case ID
- hard-rule results
- manual review reference

Observe 不反向控制当前 run。

## 14. Security Baseline

即使 R1 不做外发确认，Gateway/Observe 仍必须：

- redact API Key/authorization header
- 不记录 `.env`
- 不推 full provider payload
- 不推 system prompt
- 不允许 external content 决定 event channel/type

## 15. Client Capabilities

R1 客户端 capability：

```ts
type ClientCapabilities = {
  sourcePreview: boolean;
  reportPreview: boolean;
  markdownDelta: boolean;
  debugPanel: boolean;
};
```

Memory、Worker、Browser、Terminal events 不在 R1 protocol/capability 中。

## 16. Health

`healthz` 表示进程存活。`readyz` 至少检查 PostgreSQL、Artifact root、model config 和一个可用 search provider config。

## 17. R1 验收

1. seq/replay 有序。
2. reducer 幂等。
3. terminal/control events 不丢。
4. clue/evidence 显示不同。
5. limited report 明确展示。
6. report/source 可由 snapshot 恢复。
7. provider content/secret 不进入 SSE。
8. 慢客户端不阻塞 Runtime。
