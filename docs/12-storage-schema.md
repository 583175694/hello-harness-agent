# PostgreSQL / Prisma Storage Schema

> 文档状态：后续完整 durable Run/State 探索草案。当前生产数据库事实以 Prisma Schema 和 `implementation-status.md` 为准；当前恢复切片只计划实现 `agent_runs`、`agent_run_steps` 和 assistant draft snapshot，不实现本文的 `runtime_events`、`stream_event_log`、Checkpoint、Evidence 或 Artifact 全量模型。具体以 [26-connection-durable-agent-loop.md](./26-connection-durable-agent-loop.md) 为准。

## 1. 存储选择

```text
PostgreSQL       structured durable records
Local filesystem Artifact content and short-lived large payloads
Prisma           repository implementation and migrations
```

数据库由本机 PostgreSQL 服务提供。R1 不需要 Docker、S3 或 MinIO。

## 2. 归属模型

```text
users
  -> sessions
      -> messages
      -> model_transcript_items
      -> runs
          -> steps
          -> state_records/state_refs
          -> runtime_events/stream_event_log/observe_trace
          -> tool_calls/search_results/evidence_sources
          -> artifacts
```

R1 自动创建唯一 local user，不实现认证。所有读取仍显式按 user/session scope 查询，禁止全局按任意 ID 裸读。

## 3. R1 表总览

```text
users
sessions
messages
model_transcript_items
runs
steps
state_records
state_refs
runtime_events
stream_event_log
observe_trace
tool_calls
search_results
evidence_sources
artifacts
run_controls
idempotency_keys
```

Post-R1：

```text
memory_records
memory_candidates
delegation_rounds
worker_runs
```

## 4. users

```sql
users (
  id          text primary key,
  kind        text not null,          -- local
  display_name text null,
  created_at  timestamptz not null,
  updated_at  timestamptz not null
)
```

R1 只有一行。启动 bootstrap 必须幂等创建 local user。

## 5. sessions

```sql
sessions (
  id            text primary key,
  user_id       text not null references users(id),
  title         text null,
  status        text not null,        -- active / archived
  latest_run_id text null,
  created_at    timestamptz not null,
  updated_at    timestamptz not null
)
```

索引：

```text
idx_sessions_user_updated(user_id, updated_at desc)
```

Session 是 durable 会话聚合根，可包含多次 run。

## 6. messages

```sql
messages (
  id            text primary key,
  user_id       text not null references users(id),
  session_id    text not null references sessions(id) on delete cascade,
  run_id        text null,
  role          text not null,
  kind          text not null,        -- user_message / clarification / steer / assistant_delivery
  content       text not null,
  visibility    text not null,
  created_at    timestamptz not null,
  metadata      jsonb not null default '{}'
)
```

Steer 同时保存为 control record；message 仅用于用户可见恢复。

`messages` 是 Conversation 交付与会话列表事实，不再承担完整模型上下文的唯一存储职责。Reasoning、Assistant Tool Call 和 Tool Result 使用专用 transcript 结构保存，避免把供应商执行协议混入用户可见 `content`。

## 6.1 model_transcript_items

Reasoning Context Transcript 的目标持久化结构：

```sql
model_transcript_items (
  id               text primary key,
  user_id          text not null references users(id),
  session_id       text not null references sessions(id) on delete cascade,
  run_id           text null references runs(id) on delete set null,
  message_id       text null references messages(id) on delete set null,
  ordinal          bigint not null,
  item_type        text not null, -- system_message / user_message / assistant_turn / tool_result
  content          text null,
  reasoning        text null,
  tool_calls       jsonb null,
  tool_call_id     text null,
  provider         text null,
  model            text null,
  reasoning_format text null,
  replay_mode      text null,     -- native_tool_chain / diagnostic_only
  commit_state     text not null, -- active / committed
  schema_version   text not null,
  created_at       timestamptz not null,
  unique(session_id, ordinal)
)
```

本次实现冻结为逐项 `model_transcript_items` 表，不做 JSON-only checkpoint。断代升级前由临时脚本清空所有 Session；不提供旧 Session lazy migration 或 Message 回退。必须支持：稳定顺序、assistant reasoning/content/tool_calls 共存、Tool Result 配对、provider/model/thinking profile 恢复、区分 Tool Call reasoning 与无 Tool Call 最终 reasoning，以及 Session 删除时级联清理。该 replay 语义可以由 `tool_calls` 确定性派生，不强制新增物理列。`session_id` 是生命周期边界；Run/Message 删除只解除来源关联，不能删除已经 committed 的长期 transcript。

完整 reasoning 默认不复制到 `observe_trace` 或普通日志。若未来需要 retention 或用户删除策略，应按用户会话数据处理，而不是按匿名诊断数据处理。

## 7. runs

```sql
runs (
  id                text primary key,
  user_id           text not null references users(id),
  session_id        text not null references sessions(id) on delete cascade,
  input_message_id  text not null,
  requested_reasoning_effort text not null, -- off / low / high / max
  effective_reasoning_effort text not null, -- Adapter 校验映射后的实际档位
  status            text not null,
  phase             text null,
  report_quality    text null,       -- standard / limited
  active_step_id    text null,
  final_message_id  text null,
  report_artifact_id text null,
  terminal_reason   text null,
  created_at        timestamptz not null,
  started_at        timestamptz null,
  ended_at          timestamptz null,
  updated_at        timestamptz not null,
  version           integer not null default 0,
  metadata          jsonb not null default '{}'
)
```

索引：`idx_runs_session_created(session_id, created_at desc)`。

## 8. steps

```sql
steps (
  id            text primary key,
  run_id        text not null references runs(id) on delete cascade,
  sequence      integer not null,
  status        text not null,
  phase         text not null,
  context_hash  text null,
  action_type   text null,
  started_at    timestamptz null,
  ended_at      timestamptz null,
  metadata      jsonb not null default '{}',
  unique(run_id, sequence)
)
```

## 9. state_records

```sql
state_records (
  id             text primary key,
  user_id        text not null references users(id),
  session_id     text not null references sessions(id) on delete cascade,
  run_id         text not null references runs(id) on delete cascade,
  step_id        text null references steps(id) on delete set null,
  type           text not null,
  status         text not null,
  visibility     text not null,
  summary        text null,
  payload        jsonb not null,
  token_estimate integer null,
  created_at     timestamptz not null,
  schema_version text not null
)
```

StateRecord append-only。纠正和失效通过新 record 表达，不原地改写历史事实。

## 10. state_refs

```sql
state_refs (
  id              text primary key,
  user_id         text not null references users(id),
  session_id      text not null references sessions(id) on delete cascade,
  run_id          text not null references runs(id) on delete cascade,
  source_record_id text not null,
  target_type     text not null,
  target_id       text not null,
  relation        text not null,
  created_at      timestamptz not null,
  metadata        jsonb not null default '{}'
)
```

R1 relation 至少包括 `source / evidence / citation / artifact / derived_from / supersedes`。

## 11. runtime_events

内部 durable domain events：

```sql
runtime_events (
  id          text primary key,
  user_id     text not null references users(id),
  session_id  text not null references sessions(id) on delete cascade,
  run_id      text not null references runs(id) on delete cascade,
  step_id     text null,
  type        text not null,
  payload     jsonb not null,
  created_at  timestamptz not null,
  version     text not null
)
```

## 12. stream_event_log

```sql
stream_event_log (
  id          text primary key,
  session_id  text not null references sessions(id) on delete cascade,
  run_id      text not null references runs(id) on delete cascade,
  seq         bigint not null,
  event_type  text not null,
  payload     jsonb not null,
  created_at  timestamptz not null,
  expires_at  timestamptz not null,
  unique(run_id, seq)
)
```

Stream event 是短期 projection log，不是 State facts 的替代品。

## 13. observe_trace

诊断数据独立保存并短期 retention：

```sql
observe_trace (
  id          text primary key,
  run_id      text not null references runs(id) on delete cascade,
  step_id     text null,
  category    text not null,
  severity    text not null,
  payload     jsonb not null,
  created_at  timestamptz not null,
  expires_at  timestamptz not null
)
```

必须在写入前脱敏，不保存 API Key、完整 system prompt 或未裁剪 provider secret。

## 14. tool_calls

```sql
tool_calls (
  id              text primary key,
  run_id          text not null references runs(id) on delete cascade,
  step_id         text not null references steps(id) on delete cascade,
  tool_name       text not null,
  status          text not null,
  input           jsonb not null,
  provider_id     text null,
  fallback_reason text null,
  started_at      timestamptz not null,
  ended_at        timestamptz null,
  error_code      text null,
  metadata        jsonb not null default '{}'
)
```

Tool input 必须经过日志/存储策略裁剪；搜索 query 可保存，credential 不可保存。

## 15. search_results

```sql
search_results (
  id                text primary key,
  user_id           text not null references users(id),
  session_id        text not null references sessions(id) on delete cascade,
  run_id            text not null references runs(id) on delete cascade,
  tool_call_id      text not null references tool_calls(id) on delete cascade,
  provider          text not null,
  query             text not null,
  title             text not null,
  url               text not null,
  normalized_url    text null,
  snippet           text null,
  content_ref       text null,
  result_kind       text not null,       -- clue / evidence_candidate
  retrieved_at      timestamptz not null,
  expires_at        timestamptz null,
  metadata          jsonb not null default '{}'
)
```

未引用完整内容使用 short-lived Artifact/contentRef，retention 到期后清理。Result metadata 可以保留用于 run 恢复。

## 16. evidence_sources

```sql
evidence_sources (
  id              text primary key,
  display_id      text not null,         -- S1
  user_id         text not null references users(id),
  session_id      text not null references sessions(id) on delete cascade,
  run_id          text not null references runs(id) on delete cascade,
  search_result_id text not null references search_results(id),
  title           text not null,
  url             text not null,
  provider        text not null,
  passage         text not null,
  locator         jsonb null,
  retrieved_at    timestamptz not null,
  status          text not null,
  content_hash    text not null,
  created_at      timestamptz not null,
  unique(run_id, display_id)
)
```

`passage` 是实际引用证据，属于 durable R1 数据。Snippet-only result 不得创建 EvidenceSource。

## 17. artifacts

```sql
artifacts (
  id            text primary key,
  user_id       text not null references users(id),
  session_id    text not null references sessions(id) on delete cascade,
  run_id        text not null references runs(id) on delete cascade,
  kind          text not null,
  title         text not null,
  mime_type     text not null,
  status        text not null,
  storage_key   text not null,
  content_hash  text null,
  size_bytes    bigint null,
  retention     text not null,
  expires_at    timestamptz null,
  created_at    timestamptz not null,
  updated_at    timestamptz not null,
  metadata      jsonb not null default '{}'
)
```

`storage_key` 是相对 Artifact root 的受控路径，不接受客户端路径。

## 18. run_controls

```sql
run_controls (
  id              text primary key,
  run_id          text not null references runs(id) on delete cascade,
  type            text not null,       -- steer / cancel
  content         text null,
  status          text not null,       -- pending / applied / rejected
  applies_at_step integer null,
  created_at      timestamptz not null,
  applied_at      timestamptz null
)
```

Steer 在下一 safe step 被标记 applied。

## 19. idempotency_keys

```sql
idempotency_keys (
  scope         text not null,
  key           text not null,
  request_hash  text not null,
  response      jsonb not null,
  created_at    timestamptz not null,
  expires_at    timestamptz not null,
  primary key(scope, key)
)
```

## 20. Post-R1 Memory

Memory 只有 user scope：

```sql
memory_records (
  id              text primary key,
  user_id         text not null references users(id),
  type            text not null,
  title           text not null,
  summary         text not null,
  content         text null,
  confidence      text not null,
  freshness       text not null,
  status          text not null,
  source_refs     jsonb not null,
  created_at      timestamptz not null,
  updated_at      timestamptz not null,
  expires_at      timestamptz null,
  metadata        jsonb not null default '{}'
)
```

不保存 `scope_type/scope_id`，不支持 project/workspace/org。

Session 删除时：

1. 找出引用该 session facts 的 Memory。
2. 移除相关 sourceRefs。
3. 没有有效证据的 Memory 删除或 expired。
4. 多来源 Memory 重新计算 confidence/freshness/status。

## 21. 写入顺序

### Tool Search

```text
tool_call running
-> provider response normalized
-> search_results / short-lived Artifact
-> tool_result StateRecord
-> tool_call terminal
-> next step
```

### Report

```text
EvidenceSource[] durable
-> draft Artifact completed
-> ReportReview StateRecord
-> revised Artifact completed
-> CitationValidation StateRecord
-> Finalizer message/state/events
-> run completed
```

Finalizer 不得在 EvidenceSource 或 Artifact 尚未 durable 时提交 run completed。

## 22. Delete / Cleanup

Session delete：

- 数据库记录按 FK/事务级联。
- Artifact files 进入可靠 cleanup job。
- cleanup 可重试且幂等。
- user Memory 按第 20 节重新评估。

定时清理：

- expired stream events
- observe traces
- uncited provider payloads
- orphan temp Artifact files
- failed pending Artifact files

## 23. Recovery

Run recovery 从 runs/steps/state_records/runtime_events 重建。

SSE replay 从 stream_event_log 读取 `seq > Last-Event-ID`。

Workbench recovery 从 evidence_sources、artifacts、State 和 run phase 重建，不依赖 observe_trace。

## 24. Prisma 要求

- Prisma schema 实现本文字段和约束。
- 复杂 append/terminal 提交使用显式 transaction。
- repository 返回 domain types，不泄漏 Prisma types。
- 每次 schema 变更必须有 migration、rollback/forward strategy 和 integration test。
