# K3.3 Steer & Follow-up Queue

> 状态：方案草案，待评审冻结
>
> 前置阶段：K3.1 Runtime Lifecycle、K3.2 Clarification & Tool Approval

## 1. 目标

K3.3 为运行中的 Agent Run 增加统一的用户输入收件箱，并支持两种消费方式：

- **Follow-up**：不影响当前 Run，等待当前 Run 进入 terminal 后启动下一轮独立对话；
- **Steer**：用户将一条待处理消息提升为当前 Run 的运行中指导，在下一个安全边界注入当前 Loop。

```text
运行中用户输入
        ↓
PendingUserInput
        ├─ Follow-up → 当前 Run terminal → 新 Run
        └─ Steer     → safe boundary   → 当前 Run 继续
```

## 2. 非目标

K3.3 不实现：

- 中断正在执行的 Model Call 或 Tool Batch；
- Steer 对 Goal 的替换、任务重置或完整 Re-plan；
- Steer 的智能合并、优先级和自动重排；
- 多个并行 Follow-up Run；
- 多实例 Worker、Redis、服务端自动续跑；
- Tool 参数编辑、当前步骤重试和副作用补偿；
- Clarification / Tool Approval 的新协议。

Steer 第一版只是“追加用户指导”，不是改变任务目标。

## 3. 统一用户输入事实

运行中的新消息先保存为 `PendingUserInput`，在被某条执行路径消费前，不进入正式 Model Transcript。

建议字段：

```ts
type PendingUserInputKind = 'follow_up' | 'steer';

type PendingUserInputStatus =
  | 'pending'
  | 'steer_requested'
  | 'applied'
  | 'started'
  | 'rejected'
  | 'cancelled';

type PendingUserInput = {
  id: string;
  sessionId: string;
  attachedRunId: string | null;
  kind: PendingUserInputKind;
  status: PendingUserInputStatus;
  content: string;
  sequence: number;
  idempotencyKey: string;
  createdAt: string;
};
```

核心原则：一条 Pending User Input 只能被消费一次，不能既作为 Steer 应用，又作为 Follow-up 再次启动。

## 4. 默认交互和 Steer 提升

Agent Run 执行期间，用户发送新消息时：

```text
创建 PendingUserInput(kind=follow_up, status=pending)
```

用户点击“引导模型”后：

```text
pending follow_up
→ 原子转换为 steer_requested
→ 等待当前 Runtime safe boundary
```

转换必须具备 CAS / 幂等语义。已经 `started`、`applied`、`rejected` 或 `cancelled` 的消息不能再次升级。

## 5. Steer 语义

Steer 不打断当前动作，不创建新的 Run，只影响当前 Run 的后续 Model Round：

```text
当前 Model / Tool action
→ action 完成
→ tool_batch_committed 或 before_model_request
→ 读取并冻结 pending steer
→ 作为 user message 注入下一轮 Context
→ 写入当前 Run 的 canonical Transcript
→ 标记 steer=applied
→ 继续 Model Round
```

第一版只在完整 Tool Batch 提交后、下一轮模型请求前应用 Steer。不要在 Tool Batch 中间、单个 Tool 之间或最终回答阶段应用。

多条 Steer 按 durable sequence 顺序应用，不由 Runtime 自动合并或覆盖。冲突由模型在 Context 中处理。

Steer 作为正式用户事实保留在 Session 历史中，并带有 `source=steer` 标记；不能伪装成系统消息或模型控制消息。

## 6. Follow-up 语义

Follow-up 不进入当前 Run Context，也不改变当前 Runtime：

```text
当前 Run terminal
→ 按 Session FIFO 选择最早 pending follow_up
→ 原子领取并创建新的 queued Run
→ 新 Run 的 user message = Follow-up content
→ 标记 input=started
```

第一版约束：

- 每个 Session 严格 FIFO；
- 一个 Session 同时最多一个 `queued/running/cancel_requested` Run；
- 当前 Run 完成、失败或取消后，才允许启动下一轮；
- 不支持优先级、重排、合并和并行执行；
- Follow-up 最终作为普通 user message 进入新 Run Transcript。

Run terminal 提交与 Follow-up 领取/新 Run 创建必须幂等，避免 terminal event 重复、客户端重试或多个 dispatcher 导致重复 Run。

## 7. 与 HITL 的关系

Clarification、Tool Approval、Steer 和 Follow-up 语义分离：

- Clarification 由模型发起，用户回答它；
- Tool Approval 由 Runtime Policy 发起，用户批准或拒绝；
- Steer 由用户发起，指导当前 Run；
- Follow-up 由用户发起，安排下一轮 Run。

存在 pending clarification 或 tool approval 时：

- 只有匹配当前 Interrupt 的响应可以解决等待；
- 普通 Steer 不能绕过 Interrupt；
- Follow-up 可以按产品选择继续排队，但不能提前启动；
- 不允许把普通消息当作 clarification response。

## 8. 失败、取消和终态规则

- 未应用的 Steer 在当前 Run 失败或取消后不自动执行；用户可手动转为 Follow-up；
- 已应用的 Steer 永久保留，即使之后 Model Round 失败；
- Follow-up 持久化保存，当前 Run 失败/取消后仍按 FIFO 等待后续调度；
- terminal Run 拒绝新的 Steer；产品层可提供“转为 Follow-up”操作；
- Session 删除级联删除其未消费输入；
- 一条输入在任何终态下都不可再次消费。

## 9. 协议与观察面

需要新增共享协议和控制事件，用于提交、升级、应用和启动状态观察。建议事件语义包括：

```text
user_input.queued
user_input.promoted_to_steer
steer.applied
follow_up.started
user_input.rejected
user_input.cancelled
```

SSE、Snapshot 和 Session Detail 都应返回同一份 canonical 输入状态。客户端只能在成功应用连续事件后推进 cursor，不能根据按钮点击自行推导最终状态。

## 10. 实施切片

### K3.3-A：Pending User Input 基础设施

- 持久化模型、状态和幂等键；
- 运行中消息提交；
- FIFO 查询与取消；
- Follow-up → Steer 的原子提升；
- SSE / Snapshot / Session Detail 投影；
- 与 Clarification、Tool Approval、Cancel 的冲突规则。

### K3.3-B：Steer 消费路径

- Lifecycle safe boundary 读取 pending Steer；
- 注入 Context 和 canonical Transcript；
- 应用状态 CAS；
- 多条 Steer 顺序测试；
- 当前 Model / Tool / terminal 竞态测试。

### K3.3-C：Follow-up 消费路径

- Run terminal 后 FIFO 领取；
- 原子创建下一 queued Run；
- Session active-run 唯一性和 dispatcher 幂等；
- 失败、取消、刷新、断线和重启恢复测试。

### K3.3-D：Workbench 交互

- 运行中输入默认显示为 Follow-up；
- “引导模型”按钮及升级状态；
- Steer applied / Follow-up started 状态；
- 队列顺序、取消和恢复展示；
- clarification / approval / steer 模式互斥。

## 11. 完成标准

K3.3 完成至少应满足：

1. 运行中发送消息不会重复创建当前 Run，也不会污染当前 Context；
2. Follow-up 按 FIFO 在当前 Run terminal 后各启动一次；
3. Steer 不打断当前 Model 或 Tool action，只在安全边界应用一次；
4. 同一输入在重试、断线重连和重复事件下不会重复消费；
5. Clarification / Tool Approval 不会被普通 Steer 或 Follow-up 绕过；
6. 实时、Snapshot、历史恢复和数据库事实对输入状态保持一致；
7. 取消、失败、终态和 Session 删除不会留下可再次执行的孤立输入。

