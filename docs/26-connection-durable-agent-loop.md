# Connection-Durable Agent Loop

> 决策状态：当前下一阶段的权威方案。本文实现“客户端断线可恢复”：Agent Run 与 Chat HTTP/SSE 请求解耦，但仍由当前 API 进程执行。服务端重启后的自动恢复不是当前目标；与 `10-stream-observe.md`、`11-api-protocol.md`、`12-storage-schema.md`、`14-runtime-state-machine.md` 的远期 durable 草案冲突时，以本文为准。

## 1. 决策摘要

当前 Runtime 已经具备 Model-led Tool Loop，但一次运行仍依附于 `POST .../chat/stream` 请求。下一阶段将其改造成有独立 `runId` 的后台 Agent Run：

```text
POST 创建 Run
  -> API 进程后台执行 Agent Runtime
  -> PostgreSQL 保存 Run、Step、assistant draft 和最终结果
  -> 进程内 Event Hub 保存实时投影与有限事件窗口

GET Run SSE
  -> 订阅当前 Run
  -> SSE 断开只移除 subscriber
  -> Run 继续执行
  -> 重连时 replay 内存窗口，或发送完整 snapshot 后继续 live tail
```

当前方案采用：

- PostgreSQL：持久化 Run 状态、语义 Step、assistant draft、Tool/Source 投影和最终消息。
- 进程内 Active Run Registry / Event Hub：执行句柄、取消信号、subscriber、当前 live snapshot 和有限 Ring Buffer。
- SSE：可断开、可重建的观察通道。
- 标准 SSE `id` 与 run-scoped 单调 `seq`：重连、去重和 snapshot/tail 衔接。

当前方案不引入 Redis，不把每个模型 Token 写入 PostgreSQL，也不实现服务端重启后的 Checkpoint replay。

## 2. 当前问题

当前链路是：

```text
POST /sessions/:sessionId/chat/stream
  -> 保存 user message
  -> 在请求内执行 Model / Tool Loop
  -> 直接向当前 SSE 写事件
  -> Runtime 完成后保存 assistant message
```

它存在以下问题：

- SSE 连接同时承担执行生命周期和观察通道。
- 刷新、路由切换、浏览器关闭或网络断开会导致当前观察流消失，并可能取消 Runtime。
- 未完成 assistant 内容只存在于当前请求内存，刷新后只能恢复已保存的 user message。
- Cancel 本质上绑定当前 HTTP `AbortSignal`，而不是一个可查询的 Run。
- 前端无法回答“这轮回复是否仍在执行、执行到哪里、是否已经终止”。
- 后续 Context Engineer、Steer、Delegation 和长任务没有稳定的 Run 挂载点。

## 3. 目标与非目标

### 3.1 目标

- 一次用户消息创建一个独立 `runId`。
- 提交命令与 SSE 订阅分离。
- 客户端断开不取消 Run。
- 页面刷新或重新进入 Session 后可恢复 assistant draft、Tool Activity、Sources 和 Run 状态。
- 当前页面网络抖动后自动重连。
- Cursor 仍在内存事件窗口时精确 replay；不在窗口时以完整 snapshot 恢复。
- Cancel 通过独立 Run command 发起，并保持幂等。
- Run、assistant message 和关键 Step 在 PostgreSQL 中保持可诊断的一致状态。
- 服务端重启后遗留 active Run 明确收敛为 `failed + RUN_INTERRUPTED`，不永久停留在 running。
- 数据模型和 Runtime 接口为未来 Checkpoint/Worker lease 保留扩展点。

### 3.2 非目标

- 服务端或 Worker 重启后继续原 Run。
- 多实例 Worker 接管和 lease。
- 模型生成中途从 Provider cursor 恢复。
- 每个 Token 的永久事件日志和 exactly-once delivery。
- Redis、Kafka 或独立消息队列。
- Pause、Human-in-the-loop、Steer、Delegation 和 Worker。
- Context 选择、压缩、淘汰和 Token 编译。
- Browser、PDF 或其他新 Tool。

## 4. 核心边界

```text
Session
  一整个对话，包含多轮消息和多个 Run

Run
  一次用户输入触发的一轮 Agent 执行

Step
  Run 内一次完整 Model 调用或一个 Tool Call 的语义执行记录

Stream Event
  当前 Run 的客户端实时投影，不是 Runtime 恢复 Checkpoint

Snapshot
  能重建当前 UI 的完整投影，不等于可恢复执行的 Runtime State
```

Agent 执行与 SSE 的关系必须满足：

```text
SSE close != Run cancel
Subscriber count == 0 != Run stop
Run terminal -> SSE terminal event + connection close
```

## 5. Run 状态机

当前方案只冻结以下状态：

```ts
type AgentRunStatus =
  'queued' | 'running' | 'cancel_requested' | 'completed' | 'failed' | 'cancelled';
```

```text
queued -> running
queued -> cancel_requested -> cancelled
running -> cancel_requested -> cancelled
running -> completed
running -> failed
```

规则：

- `completed`、`failed`、`cancelled` 是 terminal，不能自动回退。
- SSE 断开不改变状态。
- Cancel command 返回 accepted 时 Run 可以暂时处于 `cancel_requested`，最终以 terminal event 收敛。
- 服务端重启导致的中断使用 `failed + RUN_INTERRUPTED`，当前不引入可恢复的 `interrupted` 状态。
- 同一 Session 第一版最多允许一个 `queued/running/cancel_requested` Run。

## 6. 后端组件

### 6.1 Run Command Service

负责：

- 在事务中保存 user message、assistant draft 和 Run。
- 校验 Session active Run 约束和 idempotency key。
- 提交 Run 给当前进程的 executor。
- 查询 snapshot。
- 接收 cancel command。

不负责执行 Model/Tool Loop，也不持有 SSE response。

### 6.2 Run Executor

以 `runId` 为输入执行现有 `AgentRuntimeService`：

```text
claim local Run
-> run status = running
-> consume Runtime events
-> update semantic Step / Projection
-> publish Stream Event
-> periodic draft flush
-> terminal transaction
```

Executor 不直接写任何具体 SSE response，只发布给 Event Hub。

### 6.3 Active Run Registry

当前进程内按 `runId` 保存：

```ts
type ActiveRun = {
  runId: string;
  abortController: AbortController;
  nextSequence: number;
  subscribers: Set<RunSubscriber>;
  recentEvents: RingBuffer<RunStreamEvent>;
  liveSnapshot: RunLiveSnapshot;
};
```

Registry 是运行句柄目录，不是 durable state。进程退出后丢失属于当前方案明确接受的边界。

### 6.4 Run Event Hub

负责：

- 为用户可见事件分配 run-scoped `seq`。
- 更新 `liveSnapshot`。
- 把事件追加到 Ring Buffer。
- 向当前 subscriber 广播。
- 在 subscribe 时完成 replay 或 snapshot fallback。
- 管理有界 subscriber queue 和慢消费者断开。

它不修改 Runtime 决策，不阻塞 Model/Tool 执行。

### 6.5 Run Projection Repository

负责将 Runtime 事件增量投影为：

- assistant draft content/blocks；
- Tool executions；
- canonical sources；
- Run 当前 Step 和计数；
- 最终 assistant metadata。

实时内存 projection 和 PostgreSQL snapshot 必须使用同一组纯 reducer/merge 规则，避免刷新前后语义漂移。

## 7. PostgreSQL 最小模型

### 7.1 `agent_runs`

```text
id                    text primary key
session_id            text not null
input_message_id      text not null
assistant_message_id  text not null
status                text not null
active_step_id        text null
tool_call_count       integer not null default 0
last_event_sequence   bigint not null default 0
owner_instance_id     text null
heartbeat_at          timestamptz null
error_code            text null
error_detail          text null
created_at            timestamptz not null
started_at            timestamptz null
ended_at              timestamptz null
updated_at            timestamptz not null
version               integer not null default 0
metadata              jsonb not null default '{}'
```

`owner_instance_id/heartbeat_at/version` 当前主要用于中断识别和乐观并发；未来可以平滑演进为 Worker lease，但当前不实现接管。

### 7.2 `agent_run_steps`

```text
id              text primary key
run_id          text not null
sequence        integer not null
kind            text not null       -- model / tool
status          text not null       -- running / completed / failed / cancelled
attempt         integer not null default 1
tool_call_id    text null
tool_name       text null
input           jsonb null
output          jsonb null
error_code      text null
error_detail    text null
started_at      timestamptz not null
ended_at        timestamptz null
metadata        jsonb not null default '{}'
unique(run_id, sequence)
```

Step 只记录完整语义操作，不记录每个 Token。稳定 `stepId/toolCallId/attempt` 为未来 Checkpoint、幂等 Tool 和恢复尝试保留身份。

### 7.3 Assistant draft

创建 Run 时立即创建 assistant message，并在 metadata 中保存：

```ts
type AssistantDeliveryMetadata = {
  deliveryStatus: 'streaming' | 'completed' | 'failed' | 'cancelled';
  runId: string;
  draftVersion: number;
  lastEventSequence: number;
  blocks: AssistantContentBlock[];
  agent?: AssistantAgentMetadata;
};
```

`Message.content` 保存当前所有 text block 拼接后的完整 draft。未完成 draft 只用于 UI 恢复，不能作为下一轮模型历史；只有 `deliveryStatus='completed'` 的 assistant message 才进入后续 Model context。

## 8. 持久化策略

### 8.1 立即持久化

以下边界立即写 PostgreSQL：

- Run 创建与 user/assistant message 创建。
- Run started。
- Model Step started/completed/failed。
- Tool Step started/completed/failed/cancelled。
- Tool execution/source projection 改变。
- Cancel requested。
- Run terminal。

### 8.2 合并持久化

`message.delta` 不逐 Token 写库。Executor 在内存累计完整 draft，并按以下任一条件 flush：

- 距离上次 flush 达到约 1 秒；
- 新增正文达到约 1 KiB；
- Model Step 结束；
- Tool 生命周期事件发生；
- Run 进入 terminal。

时间和大小是可调运行策略，不进入公共协议。每次 flush 更新完整 draft、blocks、projection、`draftVersion` 和 `lastEventSequence`，而不是插入大量 Token 行。

### 8.3 Terminal transaction

`completed` 时必须在同一事务中：

1. flush 剩余 draft/blocks/metadata；
2. assistant message `deliveryStatus -> completed`；
3. Run `status -> completed`；
4. 保存 `endedAt/toolCallCount/final projection`。

失败和取消采用相同原则，避免“消息完成但 Run 仍 running”或相反状态。

## 9. Stream 协议

### 9.1 Envelope

```ts
type RunStreamEvent<T = unknown> = {
  version: string;
  eventId: string;
  seq: number;
  sessionId: string;
  runId: string;
  type: RunStreamEventType;
  occurredAt: string;
  payload: T;
};
```

SSE 使用标准字段：

```text
id: 42
event: message.delta
data: {...}
```

Heartbeat 不占用业务 `seq`，也不参与 replay。

### 9.2 事件族

```text
run.snapshot
run.started
model.started
model.completed
message.delta
tool.started
tool.completed
tool.failed
tool.cancelled
run.cancel_requested
run.completed
run.failed
run.cancelled
stream.reset_required
```

当前 `ChatStreamEvent` 的 Tool/Message payload 尽量复用，外层新增 `runId/seq/eventId/occurredAt`，避免前端重新理解 Tool 结果。

### 9.3 Ring Buffer

每个 active Run 保留滑动窗口，例如：

- 最多 500 个合并后的用户可见事件；并且
- 最多约 2 MiB payload。

超限后淘汰最旧事件。Buffer 对所有事件持续记录，不只在 subscriber 为零时记录，也不会被第一个重连 subscriber 清空，因此支持多订阅者和重复重连。

## 10. Subscribe 与恢复算法

### 10.1 Active Run 且 cursor 可 replay

客户端发送：

```http
GET /api/agent/runs/:runId/events
Last-Event-ID: 42
```

Event Hub 在 run-scoped 临界区中：

1. 注册 subscriber 的有界输出队列；
2. 确认 `42` 仍在 Ring Buffer 可恢复范围；
3. 将 `seq > 42` 的事件按序加入 subscriber 队列；
4. 切换为 live tail；
5. 释放临界区并开始写 SSE。

新事件在注册后统一进入该队列，因此 replay 与 live 之间没有竞态窗口。

### 10.2 Active Run 但 cursor 缺失或过期

Event Hub 在同一临界区中：

1. 注册 subscriber；
2. 读取 `liveSnapshot` 和当前 `seq`；
3. 首先发送 `run.snapshot`；
4. 从 snapshot 的下一序号继续 live tail。

Snapshot 表示截至该序号的完整 UI 状态，客户端必须替换当前 Run projection，不把旧 draft 与 snapshot 重复拼接。

### 10.3 Run 已 terminal 或不在当前进程

- 从 PostgreSQL 返回 snapshot。
- terminal Run 可以发送一次 snapshot/terminal event 后关闭 SSE。
- PostgreSQL 显示 active、Registry 却不存在时，执行中断收敛检查；不得伪装成仍可继续的 Run。

## 11. API

```text
POST /api/agent/sessions/:sessionId/runs
GET  /api/agent/runs/:runId
GET  /api/agent/runs/:runId/events
POST /api/agent/runs/:runId/cancel
```

### 11.1 Create Run

```ts
type CreateRunRequest = {
  content: string;
  idempotencyKey: string;
};

type CreateRunResponse = {
  sessionId: string;
  runId: string;
  userMessageId: string;
  assistantMessageId: string;
  status: 'queued' | 'running';
  eventsUrl: string;
};
```

相同 idempotency key 与相同 payload 返回同一 Run；相同 key 与不同 payload 返回 conflict。

### 11.2 Run Snapshot

```ts
type RunSnapshot = {
  runId: string;
  sessionId: string;
  status: AgentRunStatus;
  assistantMessageId: string;
  assistantContent: string;
  blocks: AssistantContentBlock[];
  executions: ToolExecutionSnapshot[];
  sources: ResearchSourceSnapshot[];
  toolCallCount: number;
  lastEventSequence: number;
  error?: { code: string; detail: string };
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
};
```

### 11.3 Cancel

```ts
type CancelRunResponse = {
  runId: string;
  status: 'cancel_requested' | 'cancelled' | 'completed' | 'failed';
};
```

Cancel 幂等。terminal Run 返回当前状态，不重新执行取消逻辑。

当前 `/chat/stream` 在迁移期可以保留兼容包装，但最终 Web 必须改用 create-run + subscribe；包装层不能继续让 HTTP close 取消 Run。

## 12. 前端流程

### 12.1 首次提交

```text
POST create Run
-> 立即把 user message 和 streaming assistant placeholder 放入 UI
-> 保存 activeRunId
-> GET Run SSE
-> reducer 应用 event
```

### 12.2 刷新或重新进入 Session

```text
GET Session detail
-> 恢复持久化 message/draft/workbench snapshot
-> 找到 activeRunId
-> GET Run snapshot
-> 若 queued/running/cancel_requested，重新订阅 SSE
-> replay cursor 或接受 run.snapshot
-> 继续 live tail
```

### 12.3 当前页面网络抖动

```text
SSE error
-> 不把 Run 标记 failed，也不调用 cancel
-> 1s / 2s / 4s / 8s 有界退避
-> 查询 Run snapshot
-> terminal：恢复最终状态
-> active：携带 Last-Event-ID 重连
```

自动重连达到上限后显示“重新连接”按钮；Run 仍由后端继续执行。

### 12.4 Reducer 规则

- `run.snapshot`：完整替换该 Run 的 server projection。
- 普通事件：只应用 `seq > lastAppliedSeq`。
- 同一事件重复到达必须幂等。
- Workbench tab、focus、open/pinned 等 UI selection 不属于 snapshot，继续保留在客户端本地。

## 13. Cancel、错误与进程重启

### 13.1 Cancel

```text
cancel command durable
-> Run cancel_requested
-> ActiveRun.abortController.abort()
-> Runtime 停止当前 Model/Tool
-> flush draft 和 terminal projection
-> Run cancelled
```

如果 cancel command 到达时 Registry 暂时没有 ActiveRun，但数据库 Run 仍 active，当前方案直接收敛为 cancelled，不启动新的执行。

### 13.2 Runtime 错误

- Tool 的结构化失败仍由模型决定下一步，不直接失败 Run。
- 未恢复的 Model/Runtime 异常使 Run `failed`。
- failed assistant draft 可以保留已发生的 Activity 和部分文本用于诊断，但不得进入后续模型上下文。

### 13.3 服务端重启

每个进程启动生成唯一 `instanceId`。Run started 时保存 `ownerInstanceId` 并更新轻量 heartbeat。

启动/定时 reconciliation 扫描非 terminal Run：

```text
owner instance 已不存在或 heartbeat 超过阈值
-> flush 能读取到的数据库 draft
-> assistant deliveryStatus = failed
-> Run status = failed
-> errorCode = RUN_INTERRUPTED
```

当前方案不自动重新执行模型或工具。用户可以基于已保存内容重新提交。

## 14. 并发、背压与安全

### 14.1 并发

- 同一 Session 同时只允许一个 active Run。
- 同一 Run 只能注册一个本地 executor。
- Run/Message 更新使用 `version` 做乐观并发校验。
- 多个 SSE subscriber 可以同时观察同一 Run，互不清空 Buffer。

### 14.2 背压

- 每个 subscriber 使用有界发送队列。
- 慢客户端不能阻塞 Runtime、数据库 flush 或其他 subscriber。
- 队列超限时关闭该 subscriber，并允许其用 snapshot/cursor 重连。
- `message.delta` 可以在 Event Hub 合并；Tool terminal 和 Run terminal 事件不可丢。

### 14.3 安全

- Snapshot/Event 不包含 API Key、Authorization、system prompt、raw provider response 或错误 cause。
- Tool `logFields/cause` 继续只进入服务端脱敏日志。
- Session/Run/Message 查询必须按当前 local user 和 session scope 校验。
- 客户端不能提交 provider、toolset、timeout 或调用上限覆盖值。

## 15. 未来升级空间

当前不实现服务端重启恢复，但以下结构必须保持可扩展：

- Run Executor 只接受 `runId`，不依赖 Controller/SSE response。
- `agent_run_steps` 使用稳定 `stepId/sequence/attempt`。
- Tool Call 使用稳定 `toolCallId`，未来可作为幂等键。
- `ownerInstanceId/heartbeat/version` 可演进为 Worker lease。
- Runtime 的完整 Tool Result 和 canonical messages 不嵌入 SSE 协议。
- Event Hub 与 Run Repository 分离，未来可把内存 Hub 替换为跨进程实现。
- Assistant draft 与 completed delivery 明确区分，部分模型输出不是 canonical history。

未来若真实需求证明服务重启中断不可接受，再新增：

```text
agent_run_checkpoints
PostgreSQL SKIP LOCKED worker claim
lease_owner / lease_expires_at
model/tool attempt recovery
side-effect Tool idempotency
checkpoint-compatible runtime version
```

这些能力不属于本方案的完成条件。

## 16. 实施顺序

### Slice 1：Run identity 与后台执行

- 增加 Run/Step schema 和 protocol。
- Create Run 与当前 Runtime 接通。
- `/chat/stream` 不再直接拥有执行生命周期。
- 增加独立 cancel command。

### Slice 2：实时 Event Hub

- Active Run Registry。
- run-scoped sequence。
- Ring Buffer 与多 subscriber。
- 标准 SSE `id`、heartbeat 和无代理缓冲配置。

### Slice 3：Draft / Snapshot 恢复

- streaming assistant message。
- 合并 draft flush。
- Run snapshot endpoint。
- 共享 Projection reducer。
- snapshot fallback 与 sequence 去重。

### Slice 4：Web 重连

- create-run + subscribe 客户端流程。
- Session 恢复 active Run。
- `Last-Event-ID`、自动退避重连。
- Refresh、route switch、offline/online UI。

### Slice 5：中断收敛与加固

- instance identity、heartbeat 和 restart reconciliation。
- 慢 subscriber 背压。
- idempotency 与并发冲突。
- integration/E2E、日志和指标。

## 17. 测试与验收

### 17.1 Runtime/API

- Create Run 立即返回，Runtime 在请求返回后继续。
- SSE close 不触发 AbortSignal。
- Cancel command 才触发取消。
- 同一 idempotency key 不创建重复 Run。
- 同一 Session 并发创建 active Run 返回 conflict。
- terminal transaction 保持 Run/Message 一致。

### 17.2 Stream

- `seq` 在单 Run 内严格递增。
- Cursor 在窗口内时只 replay 缺失事件。
- Cursor 过期时发送完整 snapshot。
- Replay 与 live tail 之间不丢事件。
- 多 subscriber 不互相消费或清空 Buffer。
- 慢 subscriber 不阻塞 Runtime。

### 17.3 Web/E2E

- AI 回复中刷新页面，Run 继续且 UI 恢复。
- Tool 执行中刷新，Activity 和 Workbench 恢复。
- 切换 Session 再切回，继续观察同一 Run。
- 当前页面网络断开后自动重连。
- 重复 replay 不产生重复文本或 Tool Activity。
- 用户 Cancel 后最终显示 cancelled。
- Run 完成时用户不在线，回来后展示完整最终回答。

### 17.4 Restart boundary

- 服务重启前的 active Run 被标记 `failed + RUN_INTERRUPTED`。
- 已保存 user message、assistant draft、Tool execution 和 sources 可继续查看。
- 不存在永久 `running` 的僵尸 Run。
- UI 明确提示用户可以重新提交，不宣称自动恢复执行。

## 18. 完成标准

当前方案完成必须同时满足：

1. Run 生命周期不依赖任何单条 SSE/HTTP 连接。
2. 页面刷新、切换会话和客户端网络断开不会取消 Agent。
3. 客户端能通过 PostgreSQL snapshot 与进程内 replay window 恢复当前 Run UI。
4. SSE 使用有效 cursor/sequence，Reducer 对重复事件幂等。
5. 未完成 assistant draft 可恢复，但不会污染后续模型历史。
6. Cancel 是独立、持久化、幂等的 Run command。
7. 服务端重启被诚实地收敛为 `RUN_INTERRUPTED`，不留下僵尸状态。
8. Runtime、Tool、Projection 的 Model-led 边界不因本次改造而改变。
9. 不引入 Redis，也不承诺服务端重启后自动继续执行。
