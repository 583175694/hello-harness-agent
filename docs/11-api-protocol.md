# API / Protocol

> 文档状态：R1 API 目标契约。健康检查和普通对话 Session/Message API 已实现；Run、Workbench 和 Artifact endpoint 按后续阶段实现。

## 1. 原则

```text
Commands        REST
Live events     SSE
Recovery        REST snapshots + SSE replay
Large content   Artifact API
Schemas         packages/agent-protocol
```

API 使用 `User / Session / Run / Item` 语义。R1 user 由服务端固定解析为 local user，不接受客户端伪造 `userId`。

## 2. Endpoint 总览

```text
GET    /healthz
GET    /readyz

GET    /api/agent/config/public

POST   /api/agent/sessions
GET    /api/agent/sessions
GET    /api/agent/sessions/:sessionId
DELETE /api/agent/sessions/:sessionId
POST   /api/agent/sessions/:sessionId/chat/stream
POST   /api/agent/sessions/:sessionId/title/generate

POST   /api/agent/sessions/:sessionId/runs
GET    /api/agent/runs/:runId
GET    /api/agent/runs/:runId/events            SSE
POST   /api/agent/runs/:runId/clarification
POST   /api/agent/runs/:runId/steer
POST   /api/agent/runs/:runId/cancel

GET    /api/agent/runs/:runId/workbench
GET    /api/agent/runs/:runId/sources

GET    /api/agent/artifacts/:artifactId
GET    /api/agent/artifacts/:artifactId/content
```

Post-R1：

```text
GET/PATCH/DELETE /api/agent/memories
POST             /api/agent/memory-candidates/:id/review
```

## 3. Error Envelope

```ts
type ApiError = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    requestId: string;
    details?: Record<string, unknown>;
  };
};
```

错误不得包含 API Key、完整 provider payload、system prompt 或 stack trace。

## 4. Session

```ts
type SessionSummary = {
  id: string;
  title: string;
  status: 'active';
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};
```

创建：

```http
POST /api/agent/sessions
Content-Type: application/json

{ "title": "新能源市场调研" }
```

重命名或置顶使用局部更新：

```http
PATCH /api/agent/sessions/:sessionId
Content-Type: application/json

{ "title": "中国新能源市场", "isPinned": true }
```

会话列表默认按置顶优先、最近更新时间其次排序。

删除 session 是真实删除：数据库子记录在事务内清理，Artifact 文件异步/事务后可靠清理，相关 user Memory 在 P10 重新评估。

普通对话请求只提交 `{ "content": "本轮消息" }`。API 持久化 user message 后读取最近 20 条历史，完成模型流后再持久化 assistant message；模型失败不写入空或部分 assistant message。活跃会话的并发发送和删除返回 `409 SESSION_BUSY`。

## 5. Create Run

```ts
type CreateRunRequest = {
  message: {
    content: string;
  };
  idempotencyKey: string;
};

type CreateRunResponse = {
  sessionId: string;
  runId: string;
  messageId: string;
  status: 'created' | 'queued' | 'running';
  eventsUrl: string;
};
```

R1 不允许客户端提交 provider、API Key、toolset 或 runtime budget override。

## 6. Run Snapshot

```ts
type RunSnapshotResponse = {
  run: {
    runId: string;
    sessionId: string;
    status: RunStatus;
    phase?: ResearchPhase;
    reportQuality?: 'standard' | 'limited';
    createdAt: string;
    updatedAt: string;
    terminalReason?: string;
  };
  messages: MessageView[];
  progress: ProgressItem[];
  activeActivity?: ActivityView;
  reportArtifactId?: string;
};
```

Snapshot 是恢复投影，不暴露 raw provider response 或 internal prompt。

## 7. Clarification

```http
POST /api/agent/runs/:runId/clarification

{
  "questionId": "question_...",
  "content": "只分析中国市场",
  "idempotencyKey": "..."
}
```

只允许 `waiting_for_user` run 接收匹配的 clarification。它恢复同一个 run，并创建下一 step。

## 8. Steer

```http
POST /api/agent/runs/:runId/steer

{
  "content": "重点比较价格和交付能力",
  "idempotencyKey": "..."
}
```

返回：

```ts
type SteerResponse = {
  accepted: true;
  controlId: string;
  appliesAt: 'next_safe_step';
  budgetReset: false;
};
```

terminal run 不接受 steer。

## 9. Cancel

```http
POST /api/agent/runs/:runId/cancel

{
  "reason": "user_requested",
  "idempotencyKey": "..."
}
```

返回 accepted 不等于已经 terminal。客户端等待 `run_cancelled` 或读取 snapshot。

## 10. SSE

```http
GET /api/agent/runs/:runId/events
Accept: text/event-stream
Last-Event-ID: <seq>
```

Envelope：

```ts
type StreamEvent<T> = {
  version: string;
  eventId: string;
  seq: number;
  runId: string;
  sessionId: string;
  type: StreamEventType;
  occurredAt: string;
  payload: T;
};
```

`seq` 在 run 内严格单调递增。断线后按 `Last-Event-ID` replay；日志过期返回 `STREAM_REPLAY_EXPIRED`，客户端改用 snapshot/workbench recovery。

R1 事件族：

```text
run_started / run_waiting_for_user / run_steered
run_cancel_requested / run_cancelled / run_failed / run_completed
step_started / step_completed
research_phase_changed / progress_updated
search_started / search_completed / search_failed / search_fallback_used
source_discovered / evidence_selected
report_draft_created / report_review_completed / report_revised
citation_validation_completed
artifact_created / artifact_completed / artifact_failed
answer_completed
```

Search lifecycle event 的公开 payload 必须包含 `runId`（envelope 已有）、`stepId` 和 logical `toolCallId`，使前端能把 Conversation 内联 Tool Activity 与 Activity execution 稳定关联。Provider attempt identity 和 raw trace 不进入普通事件 payload。

## 11. Sources API

```ts
type SourceView = {
  evidenceId?: string;
  displayId?: string;
  resultId: string;
  kind: 'clue' | 'evidence';
  title: string;
  url: string;
  provider: string;
  retrievedAt: string;
  snippet?: string;
  citedPassage?: string;
  locator?: EvidenceLocator;
  citedBy?: string[];
};
```

普通 UI 可以展示 clues，但必须明确标记它们不能支撑正式引用。

## 12. Workbench Recovery

```ts
type WorkbenchSnapshot = {
  runId: string;
  activity?: ActivityView;
  activityExecutions: ActivityExecutionView[];
  progress: ProgressItem[];
  sources: SourceView[];
  report?: {
    status: 'drafting' | 'reviewing' | 'revising' | 'validating' | 'completed' | 'failed';
    artifactId?: string;
    quality?: 'standard' | 'limited';
  };
  artifacts: ArtifactMetadata[];
  debugAvailable: boolean;
  lastSeq: number;
};
```

```ts
type ActivityExecutionView = {
  runId: string;
  stepId: string;
  toolCallId?: string;
  kind: 'planning' | 'searching' | 'selecting_evidence' | 'drafting' | 'reviewing' | 'validating';
  status: 'pending' | 'running' | 'waiting' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
  title: string;
  detail?: string;
  startedAt: string;
  completedAt?: string;
};
```

Workbench snapshot 与 Stream 文档使用同一 canonical schema。`workbenchOpen`、active tab、selected execution 和 focus target 不属于 API snapshot；它们是客户端本地 UI selection。客户端收到 Conversation 导航动作时，以 `runId/stepId/toolCallId` 在 snapshot/projection 中解析目标。

## 13. Artifact

```ts
type ArtifactMetadata = {
  artifactId: string;
  userId: string;
  sessionId: string;
  runId: string;
  kind: 'report_draft' | 'report' | 'provider_payload' | 'json' | 'file';
  title: string;
  mimeType: string;
  status: 'pending' | 'completed' | 'failed' | 'deleted';
  sizeBytes?: number;
  contentHash?: string;
  retention: 'durable' | 'short_lived';
  createdAt: string;
};
```

Content endpoint 必须验证 Artifact 属于当前 local user，并设置安全 `Content-Type` / `Content-Disposition`。

## 14. Public Config

客户端只能读取非敏感 capability：

```ts
type PublicConfig = {
  capabilities: {
    research: boolean;
    steer: boolean;
    cancel: boolean;
    memory: boolean;
    delegation: boolean;
  };
  model: { profileId: string };
  search: { available: boolean };
};
```

不得返回 baseURL、API Key env name、provider secret 或完整内部 model config。

## 15. Idempotency

Create run、clarification、steer、cancel 和 session delete 都必须支持 idempotency。相同 key + 相同 payload 返回同一结果；相同 key + 不同 payload 返回 conflict。

## 16. Versioning

所有 API/Stream schema 从 canonical protocol 生成或直接引用。未知 event 必须按 capability/version 过滤，不能由客户端猜测字段。
