# Connection-Durable Agent Loop

> 决策状态：当前 Connection Durable 的权威实现。Run/Step、Ordered Model Rounds、后台 Executor、版本化 Checkpoint、Event Tail、SSE 重连和 assistant draft 均已落地。Reasoning 与完整模型 transcript 的后续扩展以 `27-reasoning-context-transcript.md` 为准。当前只保证 API 进程存活期间的连接恢复，不实现服务端重启后的自动续跑。

## 1. 当前目标

当前阶段只解决 Connection Durable：

```text
- 浏览器或 SSE 断线后可恢复
- 切换会话不影响后台生成
- 页面刷新后可恢复当前结果
- API 进程保持存活
```

当前明确不解决：

```text
- API 或 Worker 重启后继续原 Run
- 多实例 Worker 接管和 lease
- Tool 副作用的 exactly-once 或崩溃 reconciliation
- 完整数据库 Event Log、历史 replay 和 time travel
- Redis、Kafka、Temporal 或独立任务队列
```

服务端重启时，遗留 active Run 继续收敛为：

```text
failed + RUN_INTERRUPTED
```

## 2. 决策摘要

当前采用：

```text
Ordered Model Rounds
+ Canonical Live Projection
+ Versioned PostgreSQL Checkpoint
+ In-memory Event Tail
+ SSE Cursor Replay
+ Latest Snapshot Fallback
+ 最小 Run 状态 CAS
```

各层职责：

```text
PostgreSQL Checkpoint
  保存最近一次已确认的完整 Run/UI Snapshot
  支持页面刷新和 ActiveRun 不存在时恢复

Canonical Transcript（待 Reasoning 阶段补齐）
  保存模型下一轮请求所需的 reasoning / tool call / tool result 历史
  不由 UI Snapshot 或 Conversation Projection 反向重建

Live Projection
  保存当前进程中最新完整状态
  支持首次订阅和 cursor 断档时快速恢复

In-memory Event Tail
  只保存最近成功 Checkpoint 水位之后的事件
  支持短暂断线时按 cursor 精确追赶

Live SSE
  持续交付新事件
```

数据库当前保存的是 Snapshot/Checkpoint，不是完整 Event Log。Stream Event 只用于当前进程内的增量观察，不承担服务端重启后的 Runtime replay。

### 2.1 Run 执行主流程与代码导航

```text
用户提交消息
    │
    │  Web: app.tsx -> handleSubmit()
    ↓
创建 Run + user/assistant 两条 Message
    │
    │  HTTP: runs.controller.ts -> create()
    │  Command: run-command.service.ts -> create()
    │  DB Transaction: run.repository.ts -> create()
    ↓
后台 Executor 启动
    │
    │  run.executor.ts -> start() / execute()
    ↓
Agent Runtime 驱动 Model / Tool Loop
    │
    │  chat.service.ts -> streamPrepared()
    │  agent-runtime.service.ts -> run()
    │  openai-compatible-model.adapter.ts -> streamRound()
    ↓
Runtime Event 转成 Chat Projection
    │
    │  chat.service.ts -> streamPrepared()
    │  conversation-block.collector.ts
    ↓
Canonical Transcript 追加与持久化（待实施）
    │
    │  reasoning / assistant tool calls / tool results / final text
    ↓
RunEventHub 分配事件序号
    │
    │  run-event-hub.ts -> commit()
    ├── broadcast()            -> 实时广播给 SSE
    ├── active.liveSnapshot    -> 更新内存最新快照
    └── active.tailEvents      -> 放入 Event Tail
    ↓
阶段性写入 PostgreSQL Checkpoint
    │
    │  run.executor.ts         -> 判断 flush 时机
    │  run.repository.ts       -> flush()
    │  run-event-hub.ts        -> checkpointCommitted()
    ↓
完成 / 失败 / 取消
    │
    │  run.repository.ts       -> terminal()
    │  run-event-hub.ts        -> broadcast() / close()
```

建议按“接单 -> 执行 -> 事件与恢复 -> 前端观察”的顺序阅读：

1. [`RunCommandService`](../apps/api/src/runs/run-command.service.ts)
2. [`RunExecutor`](../apps/api/src/runs/run.executor.ts)
3. [`RunEventHub`](../apps/api/src/runs/run-event-hub.ts)
4. [`observeRun()`](../apps/web/src/app.tsx)

其他对应入口：

- [`RunsController`](../apps/api/src/runs/runs.controller.ts)
- [`RunRepository`](../apps/api/src/runs/run.repository.ts)
- [`ChatService`](../apps/api/src/chat/chat.service.ts)
- [`AgentRuntimeService`](../apps/api/src/agent-runtime/agent-runtime.service.ts)
- [`OpenAICompatibleModelAdapter`](../apps/api/src/model/openai-compatible-model.adapter.ts)
- [`ConversationBlockCollector`](../apps/api/src/projection/conversation-block.collector.ts)

### 2.2 断线恢复流程与代码导航

```text
前端保存 cursor
    │
    │  app.tsx -> runSequencesRef / applyRunEvent()
    ↓
重新读取 Run Snapshot
    │
    │  Web: getRun()
    │  HTTP: runs.controller.ts -> snapshot()
    │  Command: run-command.service.ts -> snapshot()
    ↓
携带 Last-Event-ID 订阅 SSE
    │
    │  Web: observeRun() -> subscribeRun()
    │  HTTP: runs.controller.ts -> subscribe()
    ↓
RunEventHub.subscribe(runId, cursor)
    │
    ├── cursor 能被 Tail 连续覆盖
    │       ↓
    │   replay event.seq > cursor
    │
    └── 无 cursor / cursor 过旧 / 出现断档
            ↓
        返回完整 Live Snapshot
    ↓
前端归约恢复数据
    │
    ├── app.tsx -> applyRunSnapshot()   完整替换 Run 投影
    └── app.tsx -> applyRunEvent()      连续应用增量事件
    ↓
继续接收实时事件
```

对应代码：

- [`observeRun()`、`applyRunSnapshot()`、`applyRunEvent()`](../apps/web/src/app.tsx)
- [`getRun()`、`subscribeRun()`](../apps/web/src/api/client.ts)
- [`RunsController.snapshot()`、`RunsController.subscribe()`](../apps/api/src/runs/runs.controller.ts)
- [`RunCommandService.snapshot()`](../apps/api/src/runs/run-command.service.ts)
- [`RunEventHub.subscribe()`](../apps/api/src/runs/run-event-hub.ts)
- [`appendTextDelta()`、`applyToolActivityEvent()`](../apps/web/src/features/agent/model/conversation-blocks.ts)

## 3. 核心不变量

对任意 active Run，必须始终满足：

```text
Durable Checkpoint(seq=N)
+ Event Tail(seq=N+1...M)
= Live Projection(seq=M)
```

等价地：

```ts
reduce(durableCheckpoint.projection, tailEvents) === liveProjection;
```

还必须满足：

1. 每个用户可见变化先获得 run-scoped `seq`，再进入 Projection。
2. Snapshot `seq=N` 只能包含 `seq <= N` 的变化。
3. PostgreSQL 中 Snapshot、assistant draft 和 `lastEventSequence` 必须属于同一版本。
4. Checkpoint 成功后，只能淘汰 `seq <= checkpointSequence` 的内存事件。
5. Snapshot 是完整替换；普通 Event 是有序增量归约。
6. 客户端只有成功应用 Event 后才能推进 cursor。
7. 终态不可反转，取消和完成不能同时成功。
8. 每次模型请求都有稳定的 `roundId/roundSequence`，Round 内 Block 按统一 `blockSequence` 排序。
9. Content Delta 可以立即展示，但只有无 Tool Call 的 Round 才把 Content 解释为最终正文。

## 4. 核心概念

```text
Session
  一整个对话，包含多轮消息和多个 Run

Run
  一次用户输入触发的一轮 Agent 执行

Step
  Run 内 Model 或 Tool 的语义执行记录；当前用于诊断，不是重启恢复点

Stream Event
  带单调 seq 的客户端增量事件

Live Projection
  当前进程内截至 liveSequence 的完整 UI 状态

Durable Checkpoint
  PostgreSQL 已确认保存的完整 UI Snapshot

Event Tail
  Durable Checkpoint 到 Live Projection 之间的内存增量

Runtime Checkpoint
  能恢复 Agent Loop 下一步的执行状态；当前不实现
```

必须明确：

```text
UI Snapshot != Runtime Checkpoint
Connection Durable != Process Durable
SSE close != Run cancel
Subscriber count == 0 != Run stop
```

## 5. Run 状态机

当前只冻结：

```ts
type AgentRunStatus =
  'queued' | 'running' | 'cancel_requested' | 'completed' | 'failed' | 'cancelled';
```

合法转换：

```text
queued -> running
queued -> cancelled
running -> cancel_requested
running -> completed
running -> failed
cancel_requested -> cancelled
cancel_requested -> failed
```

禁止：

```text
cancel_requested -> completed
failed -> completed
cancelled -> completed
completed -> failed
```

所有竞争敏感转换使用数据库 compare-and-set：更新条件必须包含允许的来源状态，并检查受影响行数。`terminal()` 不得无条件按 `runId` 覆盖现有终态。

同一 Session 当前最多允许一个 `queued/running/cancel_requested` Run。

## 6. Ordered Model Rounds

### 6.1 问题

不同模型协议允许同一个模型轮次同时包含 Content 和 Tool Call。Content 通常是 Tool Call 的前言或说明；无 Tool Call 的 Content 才是最终正文。不同 Provider 对 Content 与 Tool Call 的统一索引能力并不一致，网络 Delta 到达顺序也不能直接充当最终 UI Block 顺序。

因此：

```text
Event 到达顺序
!=
模型轮内的业务展示顺序
```

如果收到 chunk 就直接追加到全局 assistant blocks，模型同轮又声明 Tool Call，切换会话或重放后容易形成：

```text
被误判为最终正文的 Content
工具活动
```

并被 Snapshot 忠实持久化和恢复。

### 6.2 统一模型轮结构

每次请求模型时创建稳定的 `roundId` 和递增 `roundSequence`：

```ts
type ModelRoundProjection = {
  roundId: string;
  roundSequence: number;
  status: 'streaming' | 'completed';
  outcome?: 'tool_calls' | 'final_content';
  blocks: ModelRoundBlock[];
};
```

Round 内所有 Content 和 Tool Call 都映射为稳定 Block：

```ts
type ModelRoundBlock = {
  blockId: string;
  blockSequence: number;
  type: 'content' | 'tool_call';
  providerIndex?: number;
};
```

排序规则：

1. Provider 提供 Content 与 Tool Call 共用的全局 index 时，Adapter 直接映射为 `blockSequence`。
2. Provider 只提供 Tool Call 之间的 index 时，Adapter 按 Block 首次出现顺序分配统一 `blockSequence`，Tool Call 内部继续用 Provider index 聚合分片参数。
3. 前端和 Projection 按 `roundSequence + blockSequence` 定位、排序和原位更新 Block，不按 SSE 到达顺序简单追加。
4. Content Delta 首字立即进入当前 Content Block，不等待整轮结束，不牺牲首字速度。

模型轮结束后只确认语义，不重新排列或删除已经展示的 Block：

```text
存在 Tool Call
  -> Content 解释为 Tool Call 前言/说明
  -> 完成参数聚合并执行一个或多个 Tool Call
  -> Tool Result 进入下一 Model Round

不存在 Tool Call
  -> Content 解释为最终正文
  -> 校验 empty/length/protocol pollution 后结束 Agent Loop
```

Tool Activity 仍由确定性的 Tool Event 生成，例如“正在搜索网页”“正在读取 3 个网页”；模型 Content 是独立的说明 Block，不能替代 Tool Activity。

目标用户时间线：

```text
Round 1: Content? -> Tool Call A -> Tool Call B
Round 2: Content? -> Tool Call C
Round 3: Content(final)
```

`eventSequence` 与展示顺序职责分离：

```text
eventSequence
  Checkpoint 水位、Tail replay、去重和 gap detection

roundSequence + blockSequence
  Model Round 与 Round 内 Block 的稳定业务顺序
```

## 7. Active Run 内存模型

建议每个 Active Run 维护：

```ts
type ActiveRun = {
  runId: string;
  sessionId: string;
  abortController: AbortController;

  nextSequence: number;
  liveSequence: number;
  liveProjection: RunProjection;

  durableCheckpoint: {
    sequence: number;
    draftVersion: number;
    projection: RunProjection;
  };

  tailEvents: RunStreamEvent[];
  tailBytes: number;

  subscribers: Set<RunSubscriber>;

  checkpointInFlight?: Promise<void>;
  checkpointRequested: boolean;
};
```

`liveProjection` 用于最新状态查询和 snapshot fallback；`durableCheckpoint` 表示 PostgreSQL 已确认的水位；`tailEvents` 只保存二者之间的增量。

Registry 是当前进程的运行句柄目录，不是 durable state。进程退出后丢失属于当前方案接受的边界。

## 8. Canonical Event Commit

所有用户可见状态变化必须经过唯一提交入口：

```ts
commitEvent(run, type, payload);
```

其顺序必须是：

```text
1. 分配 seq
2. 构造 RunStreamEvent
3. 用 Event 归约 Live Projection
4. 更新 liveSequence
5. 追加到 Event Tail
6. 广播给 Subscriber
7. 根据策略调度 Checkpoint
```

伪代码：

```ts
function commitEvent(run: ActiveRun, type: RunEventType, payload: unknown) {
  const event = {
    version: protocolVersion,
    eventId: crypto.randomUUID(),
    runId: run.runId,
    sessionId: run.sessionId,
    seq: run.nextSequence++,
    type,
    payload,
    occurredAt: new Date().toISOString(),
  };

  run.liveProjection = reduceRunEvent(run.liveProjection, event);
  run.liveSequence = event.seq;
  appendTail(run, event);
  publishToSubscribers(run, event);
  scheduleCheckpoint(run, event);
  return event;
}
```

禁止继续使用：

```text
先修改 Projection
-> 可能 flush 数据库
-> 后分配 Event seq
```

否则 Snapshot 内容可能领先于 cursor，重连时会重复追加文本。

## 9. Canonical Projection 与 Reducer

服务端应维护一份 canonical `RunProjection`：

```ts
type RunProjection = {
  runId: string;
  sessionId: string;
  assistantMessageId: string;
  status: AgentRunStatus;
  assistantContent: string;
  rounds: ModelRoundProjection[];
  blocks: AssistantContentBlock[];
  executions: ToolExecutionSnapshot[];
  sources: ResearchSourceSnapshot[];
  toolCallCount: number;
  error?: { code: string; detail: string };
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
};
```

长期目标是服务端 Live Projection、PostgreSQL Snapshot 和 Web 增量恢复复用同一套纯 reducer 语义。UI 可以在 Projection 上生成 ViewModel，但不能重新定义 Tool/Text 的事实顺序。

## 10. PostgreSQL Checkpoint

### 10.1 保存内容

数据库继续保存完整 Snapshot，不新增永久 Event Log：

```text
AgentRun
  status
  toolCallCount
  lastEventSequence
  error
  startedAt/endedAt
  version

Assistant Message
  content
  metadata.deliveryStatus
  metadata.runId
  metadata.draftVersion
  metadata.lastEventSequence
  metadata.blocks
  metadata.agent.executions
  metadata.agent.sources
```

未完成 assistant draft 只用于 UI 恢复，不能进入后续模型历史；只有 `deliveryStatus=completed` 的 assistant message 才进入 Context。

### 10.2 触发条件

立即 Checkpoint：

```text
run.started
tool.started
tool.completed / tool.failed / tool.cancelled
run.cancel_requested
run.completed / run.failed / run.cancelled
模型轮结束
```

文本合并 Checkpoint：

```text
距上次约 1 秒
或新增正文约 1 KiB
```

### 10.3 捕获同一版本

Checkpoint 开始时同步捕获：

```ts
const targetSequence = run.liveSequence;
const targetProjection = structuredClone(run.liveProjection);
const targetDraftVersion = run.durableCheckpoint.draftVersion + 1;
```

`targetSequence`、`targetProjection`、assistant draft 和 Run 状态必须在同一个 PostgreSQL 事务中保存。

### 10.4 串行与单调保护

同一 Run 的 Checkpoint 必须串行。Checkpoint 期间又有更新时，只标记 `checkpointRequested=true`，当前写入完成后再捕获最新版本继续。

数据库必须拒绝旧 Checkpoint 覆盖新版本：

```text
newSequence >= stored lastEventSequence
```

### 10.5 成功后的 Tail 压缩

Checkpoint 成功后：

```ts
run.durableCheckpoint = {
  sequence: targetSequence,
  draftVersion: targetDraftVersion,
  projection: targetProjection,
};

run.tailEvents = run.tailEvents.filter((event) => event.seq > targetSequence);
```

不能清空整个 Tail。数据库写入期间产生的 `seq > targetSequence` 事件必须保留。

Checkpoint 失败时：

```text
- 不推进 durable checkpoint 水位
- 不删除 Tail
- 保留 Live Projection
- 记录并重试
```

terminal Checkpoint 失败时不能对客户端宣告 terminal success。

## 11. Event Tail 与内存边界

Event Tail 是增量恢复优化，不是永久事实源。

正常情况下，周期 Checkpoint 会让 Tail 保持很短。仍保留软上限，例如：

```text
500 events
2 MiB
```

Tail 达软上限时优先强制 Checkpoint；Checkpoint 成功后按水位压缩。不能静默删除尚未被 Checkpoint 覆盖的 Event。

如果 Checkpoint 持续失败且 Tail 达绝对安全上限，应使 Run 失败，而不是继续产生无法恢复的输出。

## 12. SSE Subscribe 与恢复

SSE 使用标准：

```text
id: 42
event: message.delta
data: {...}
```

Heartbeat 不占用业务 seq。

### 12.1 Cursor 可连续 replay

例如：

```text
checkpoint = 100
tail = 101..130
client cursor = 115
```

服务端发送：

```text
116..130
然后继续 Live SSE 131...
```

### 12.2 Cursor 缺失、过期或出现断档

ActiveRun 存在时，直接发送最新 Live Snapshot：

```text
run.snapshot seq=liveSequence
然后继续 Live SSE seq>liveSequence
```

无需机械地发送数据库旧 Snapshot 再 replay 整段 Tail。Live Snapshot 是当前 UI 的完整事实，可最快恢复。

### 12.3 ActiveRun 不存在

从 PostgreSQL 返回 Durable Snapshot：

```text
terminal Run
  -> 发送一次 snapshot 后关闭

数据库显示 active 但 Registry 不存在
  -> 执行 interruption 收敛，不伪装为可继续执行
```

### 12.4 订阅临界区

ActiveRun subscribe 必须在不跨 `await` 的临界区中：

```text
1. 注册 subscriber
2. 捕获 liveSequence / liveSnapshot / tail
3. enqueue replay 或 snapshot
4. 后续 publish 统一进入 subscriber queue
```

避免读取 Snapshot 后、注册 subscriber 前产生的事件丢失。

慢 subscriber 使用有界队列；队列超限时关闭该连接，由客户端重新连接并通过 Tail 或 Snapshot 恢复。慢连接不能阻塞 Runtime、Checkpoint 或其他 Subscriber。

## 13. 前端状态与 Cursor

### 13.1 每个 Run 独立状态

前端按 `runId` 维护：

```ts
type RunClientState = {
  runId: string;
  sessionId: string;
  projection: RunProjection;
  committedSequence: number;
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'closed';
};
```

切换会话只改变 `selectedSessionId`，不停止后台 Run observer，不删除对应 Run Projection。

### 13.2 Event 应用规则

```text
event.seq <= committedSequence
  -> duplicate，忽略

event.seq == committedSequence + 1
  -> 应用 reducer
  -> 成功后推进 cursor

event.seq > committedSequence + 1
  -> gap
  -> 停止增量应用
  -> 拉取最新 Run Snapshot
  -> Snapshot Replacement 后重新订阅
```

目标 Session 或 assistant message 尚不存在时，不能先推进 cursor；应请求 Snapshot 建立完整依赖。

### 13.3 Snapshot 应用规则

```text
snapshot.seq < local committedSequence
  -> 旧响应，忽略

snapshot.seq >= local committedSequence
  -> 整体替换该 Run 的 server projection
  -> committedSequence = snapshot.seq
```

Snapshot 不能和旧 blocks 机械拼接。Workbench tab、focus、open/pinned 等本地 UI selection 不属于服务端 Snapshot，应在替换时保留。

### 13.4 旧 HTTP 响应保护

Session Detail 和 Run Snapshot 必须携带 `lastEventSequence`。晚到的 HTTP 响应如果比本地 Run cursor 旧，不得覆盖更新的 SSE Projection。正在观察的 active Run 也不得被缺少有效 sequence 的普通 Session Detail 覆盖。

## 14. 切换会话与页面刷新

### 14.1 切走会话

```text
selectedSessionId 改变
-> Run observer 继续运行
-> SSE 继续更新对应 session/run cache
-> 后台生成不取消
```

### 14.2 切回会话

```text
1. 立即展示本地 session/run cache
2. 已有 observer 时不重复订阅
3. 异步读取 Session Detail 做持久化校准
4. 旧详情响应不能覆盖更新的 Projection
```

### 14.3 页面刷新

API 进程仍存活，因此 ActiveRun 仍存在：

```text
GET Session Detail
-> 发现 activeRun
-> GET Run Snapshot，优先返回 Latest Live Snapshot
-> Snapshot Replacement
-> subscribe Last-Event-ID=snapshot.seq
-> 继续 Live SSE
```

PostgreSQL Durable Snapshot 是刷新恢复的下限；Latest Live Snapshot 是当前进程中更及时的恢复路径。

## 15. Cancel 与终态

Cancel 是独立 durable command，不依赖 SSE connection。

```text
queued
  -> 直接 CAS 为 cancelled
  -> 不等待 Executor 启动

running
  -> CAS 为 cancel_requested
  -> 发布 run.cancel_requested
  -> AbortController.abort()
  -> Runtime 在语义边界收敛为 cancelled

terminal
  -> 幂等返回当前状态
```

Run 完成只允许：

```text
running -> completed
```

如果数据库 CAS 失败，Executor 必须重新读取状态并停止，不能发布错误的 `run.completed`。

终态顺序：

```text
1. 分配 terminal event seq
2. 归约 Live Projection 为 terminal
3. terminal Checkpoint(seq) 事务成功
4. 广播 terminal event
5. 关闭 subscriber
```

数据库不能预先保存尚未发布的未来 sequence。

## 16. PostgreSQL 模型边界

当前继续使用：

```text
agent_runs
agent_run_steps
messages.run_id
assistant metadata snapshot
```

不新增：

```text
agent_run_events
agent_run_checkpoints
worker lease table
```

`agent_run_steps` 当前记录 Model/Tool 的语义活动和诊断信息，不承诺能够恢复 Agent Runtime。未来 Worker/process-durable 阶段再重新设计每轮 Model Step、Tool attempt、Runtime messages 和幂等身份。

## 17. API

```text
POST /api/agent/sessions/:sessionId/runs
GET  /api/agent/runs/:runId
GET  /api/agent/runs/:runId/events
POST /api/agent/runs/:runId/cancel
```

Create Run 使用 `idempotencyKey`；相同 key 与相同 payload 返回同一 Run，相同 key 与不同 payload 返回 conflict。

`GET Run`：

```text
ActiveRun 存在
  -> 返回 Latest Live Snapshot

ActiveRun 不存在
  -> 返回 PostgreSQL Durable Snapshot
```

## 18. 错误与服务端重启

- Tool 的结构化失败继续交给模型决定下一步，不直接失败 Run。
- 未恢复的 Model/Runtime 异常使 Run `failed`。
- failed/cancelled assistant draft 可以保留已发生 Activity 和部分正文用于查看，但不能进入后续模型 Context。
- Checkpoint 失败不删除 Tail；terminal Checkpoint 失败不宣告 terminal success。
- API 进程重启后不恢复执行，active Run 收敛为 `failed + RUN_INTERRUPTED`。

当前不为重启恢复引入 lease、fencing token、Tool reconciliation 或 Runtime Checkpoint。这些能力留到 Worker 阶段重新立项。

## 19. 实施顺序

### Phase 1：修复业务顺序

- 每次模型请求创建稳定的 `roundId/roundSequence`。
- Adapter 为 Content 与 Tool Call 统一生成 `blockSequence`。
- Content Delta 立即更新当前 Round Block，Round 结束后确认 `tool_calls/final_content` 语义。
- Projection 和前端按 `roundSequence + blockSequence` 排序并原位更新。
- 增加 mixed Content + Tool Call 测试。

### Phase 2：统一 Sequence 与 Live Projection

- Event 先分配 seq，再归约 Projection。
- ActiveRun 明确维护 `liveProjection/liveSequence`。
- 删除 Projection 先于 Event seq 落盘的路径。

### Phase 3：版本化 Checkpoint

- Snapshot、assistant draft 和 `lastEventSequence` 同版本事务保存。
- Checkpoint 串行化和 sequence 单调保护。
- terminal 不再预占未来 seq。

### Phase 4：Event Tail 与 Subscribe

- Tail 只保存 Checkpoint 水位之后的 Event。
- Checkpoint 成功后按水位压缩。
- Cursor 连续时 replay；否则发送 Latest Live Snapshot。
- Subscribe 注册、初始恢复和 live tail 无空窗。

### Phase 5：客户端严格恢复

- Event 成功应用后再推进 cursor。
- 增加 sequence gap detection。
- Snapshot version protection。
- 旧 HTTP response 不覆盖新 Projection。

### Phase 6：最小状态 CAS

- queued cancel 直接 terminal。
- completed/cancelled/failed 使用允许来源状态。
- 终态不可反转。

## 20. 测试矩阵

### Runtime 顺序

- 同一模型轮先输出 text 后输出 Tool Call。
- 混合 Round 的 Content 保留为 Tool Call 前言，不误判为最终正文。
- Content 首字立即交付，不等待 Round 完成。
- Final Round Content 位于此前全部 Round 之后。
- 同轮多个 Tool Call 的顺序稳定。
- Provider 没有统一 Block index 时，Adapter 的 `blockSequence` 仍保持顺序稳定。
- 实时流、Snapshot 和 Tail replay 得到相同的 Rounds/Blocks 顺序。

### Checkpoint

- Projection(seq=N) 与 `lastEventSequence=N` 一致。
- Checkpoint 期间产生新事件，成功后只删除 `seq<=N`。
- 旧 Checkpoint 后完成不能覆盖新 Checkpoint。
- Checkpoint 失败不删除 Tail。
- terminal Checkpoint 失败不发送 terminal success。

### SSE

- Cursor 在 Tail 内精确 replay。
- Cursor 缺失或过期返回 Latest Live Snapshot。
- Replay 与 live tail 之间不丢事件。
- 重复 Event 不重复追加正文。
- 慢 subscriber 不阻塞 Runtime。

### Web

- 目标 message 不存在时不推进 cursor。
- sequence gap 触发 Snapshot reload。
- 旧 Session Detail 不覆盖新 SSE Projection。
- 切换会话后后台 SSE 继续更新对应缓存。
- 切回后 Tool Activity 与最终正文顺序一致。
- 页面刷新后恢复 active Run 并继续输出。

### 状态机

- queued 后立即 cancel 最终为 cancelled。
- cancel 与 complete 竞争只能有一个终态。
- terminal 状态不可反转。
- 同一 Session active-run 唯一约束保持有效。

## 21. 完成标准

当前 Connection Durable 时序加固完成必须同时满足：

1. Run 生命周期不依赖任何单条 SSE/HTTP connection。
2. 页面刷新、切换会话和客户端网络断开不会取消 Agent。
3. 每次模型请求都有稳定的 `roundId/roundSequence`，同轮 Block 有稳定的 `blockSequence`。
4. 所有用户可见变化先有 seq，再进入 Projection。
5. Snapshot(seq=N) 与其内容属于同一版本。
6. `reduce(Durable Checkpoint, Event Tail) == Live Projection`。
7. Checkpoint 成功后只淘汰已覆盖事件。
8. Cursor 连续时精确 replay，断档时使用 Latest Live Snapshot。
9. 客户端成功应用 Event 后才推进 cursor，并能检测 gap。
10. 旧 Snapshot/Session Detail 不覆盖更新状态。
11. queued Run 可可靠取消，terminal 状态不可反转。
12. terminal Event 只能在 terminal Checkpoint 成功后交付。
13. 服务端重启诚实收敛为 `RUN_INTERRUPTED`，不宣称自动恢复。
14. Content 首字可立即流式展示；混合 Round Content 被解释为 Tool Call 前言，无 Tool Call Round Content 被解释为最终正文。
15. 当前不引入数据库 Event Log、Redis、Temporal 或 Worker lease。

## 22. 未来 Worker 阶段

未来若建设 Worker/process-durable，再单独设计：

```text
Runtime semantic checkpoint
每个 Model Round 独立 Step
Tool attempt 与 idempotency key
Worker lease / fencing token
ambiguous Tool completion reconciliation
服务端重启后的调度与恢复
```

当前 `runId/stepId/toolCallId/attempt/version/ownerInstanceId` 只保留演进空间，不构成 process-durable 承诺。
