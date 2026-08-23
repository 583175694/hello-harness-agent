# K3.3 Steer & Follow-up Queue

> 状态：K3.3 MVP 方案，待实现
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

最小事实可以复用现有消息/Transcript 存储；若现有模型无法表达 pending，再新增最小 Pending Input 记录。MVP 只需要以下语义字段：

```ts
type PendingUserInputKind = 'follow_up' | 'steer';

type PendingUserInputStatus = 'pending' | 'consumed' | 'rejected' | 'cancelled';

type PendingUserInput = {
  id: string;
  sessionId: string;
  kind: PendingUserInputKind;
  status: PendingUserInputStatus;
  content: string;
  sequence: number;
  idempotencyKey: string;
  createdAt: string;
};
```

核心原则：一条 Pending User Input 只能被消费一次，不能既作为 Steer 应用，又作为 Follow-up 再次启动。

不保存提交时关联的 Run ID。Steer 只是当前 Context 中的一项普通用户事实，Follow-up 只是延迟提交的普通用户消息；类型、状态和服务端 sequence 足以支持 MVP。

## 4. 默认交互和 Steer 提升

Agent Run 执行期间，用户发送新消息时：

```text
创建 PendingUserInput(kind=follow_up, status=pending)
```

用户点击“引导模型”后：

```text
pending follow_up
→ 原子转换为 kind=steer
→ 等待当前 Runtime safe boundary
```

转换必须具备基本 CAS / 幂等语义。已经 `consumed`、`rejected` 或 `cancelled` 的消息不能再次升级。

## 5. Steer 语义

Steer 不打断当前动作，不创建新的 Run，只影响当前 Run 的后续 Model Round：

```text
当前 Model / Tool action
→ action 完成
→ tool_batch_committed 或 before_model_request
→ 读取并冻结 pending steer
→ 作为 user message 注入下一轮 Context
→ 写入当前 Run 的 canonical Transcript
→ 标记 input=consumed
→ 继续 Model Round
```

第一版只在完整 Tool Batch 提交后、下一轮模型请求前应用 Steer。不要在 Tool Batch 中间、单个 Tool 之间或最终回答阶段应用。

同一个 safe boundary 冻结当时全部可见的 pending Steer，按服务端 sequence 依次加入 Context，并只触发一次 Model Round。safe boundary 之后新到达的 Steer 留到下一批。Runtime 不自动合并或覆盖消息，冲突由模型在 Context 中处理。

Steer 作为正式用户事实保留在 Session 历史中，并带有 `source=steer` 标记；不能伪装成系统消息或模型控制消息。

## 6. Follow-up 语义

Follow-up 不进入当前 Run Context，也不改变当前 Runtime：

```text
当前 Run terminal
→ 按 Session FIFO 选择最早 pending follow_up
→ 原子领取并创建新的 queued Run
→ 新 Run 的 user message = Follow-up content
→ 标记 input=consumed
```

第一版约束：

- 每个 Session 严格 FIFO；
- 一个 Session 同时最多一个 `queued/running/cancel_requested` Run；
- 当前 Run 完成、失败或取消后，才允许启动下一轮；
- 不支持优先级、重排、合并和并行执行；
- Follow-up 最终作为普通 user message 进入新 Run Transcript。

Follow-up 被领取后完全复用普通对话的 Run 创建和执行流程，不引入特殊上下文继承逻辑。新 Run 从 Session 当前已提交的 canonical transcript 编译 Context。

Run terminal 后的 Follow-up 领取和新 Run 创建必须具备基本幂等保护，避免重复启动。

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
- Follow-up 持久化保存；当前 Run `completed` 后自动按 FIFO 调度，`failed/cancelled` 后保留队列但暂停自动调度，用户明确继续后再启动；
- 如果 Steer 提交时 Runtime 已进入 `final_answer` 或已经 terminal，则自动降级为 Follow-up，不打断最终回答；
- Session 删除级联删除其未消费输入；
- 一条输入在任何终态下都不可再次消费。

服务器进程重启或 Runtime 丢失时，当前 active Run 按现有规则收敛为失败；不重建旧 Runtime，不自动注入 pending Steer。pending Follow-up 保留，用户可以手动将 Steer 转为 Follow-up 或继续 Follow-up 队列。

没有 active Run 时，消息继续走现有普通对话创建流程，不进入 PendingUserInput，也不显示 Follow-up / Steer 操作。

## 9. 协议与观察面

MVP 使用一个统一事件表示待处理输入状态变化：

```text
user_input.updated
```

第一版只扩展 Run Snapshot 和对应 SSE；暂缓 Session Detail 扩展。客户端不能根据按钮点击自行推导最终状态。

## 10. 实施前技术契约

### 10.1 存储选择

实现前先检查现有 Message / Transcript 模型是否能够表达“已收到但尚未进入正式对话”的 Pending Input。

- 如果现有模型可以表达 pending、kind、status、sequence 和幂等键，则复用现有事实层；
- 如果不能表达，再新增最小 Pending Input 记录；
- 不新增 attached Run、consumed Run 或完整 Control Plane 字段；
- Pending 阶段不进入正式 Model Transcript；Steer consumed 或 Follow-up 创建新 Run 时，才按对应路径进入正式事实。

### 10.2 消息提交判定

由后端根据数据库事实判断 Session 是否存在 active Run，前端不负责决定使用哪条路径：

```text
没有 active Run
→ 继续现有普通对话 / Create Run 流程

存在 active Run
→ 创建 Pending Input(kind=follow_up)
```

这样可以避免前端 Snapshot 过期导致普通消息和 Pending Input 之间的竞态。重复请求仍使用现有幂等语义。

### 10.3 Steer 注入点

Steer 只在 Runtime 已完成当前 action、准备发起下一轮模型请求时消费：

```text
tool_batch_committed
→ before_model_request
→ 冻结当前 pending Steer 批次
→ 按 sequence 写入 Context / Transcript
→ 一批只触发一次 Model Round
```

不得在 Model Call、Tool Batch、单个 Tool 之间或最终回答生成中间注入。Runtime 已进入 `final_answer` 或 Run 已 terminal 时，新 Steer 自动降级为 Follow-up。

### 10.4 Follow-up 调度责任

MVP 由现有 `RunExecutor` 在 Run terminal 收尾路径中直接触发 Follow-up 调度，不新增独立 dispatcher：

```text
Run terminal transaction
→ completed 且存在 pending Follow-up
→ FIFO 领取最早一条
→ 原子创建 queued Run
→ 复用现有 Executor 启动流程
```

`failed/cancelled` 只保留队列并暂停自动调度。Terminal 收尾和 Follow-up 创建必须具备 CAS / 幂等保护，重复 terminal 事件不能创建重复 Run。

### 10.5 最小协议和 Snapshot

`Run Snapshot` 与统一 `user_input.updated` SSE 至少暴露：

```ts
type PendingUserInputView = {
  id: string;
  kind: 'follow_up' | 'steer';
  status: 'pending' | 'consumed' | 'rejected' | 'cancelled';
  content: string;
  sequence: number;
};
```

客户端只根据 Snapshot / SSE 的 canonical 状态更新界面，不根据按钮点击推导 `consumed` 或 `rejected`。第一版不扩展 Session Detail。

## 11. 实施切片

### K3.3-A：Pending User Input 基础设施

- 复用或新增最小 Pending Input 事实、状态和幂等键；
- 运行中消息提交；
- FIFO 查询与取消；
- Follow-up → Steer 的原子提升；
- Run Snapshot / SSE 的统一状态投影；
- 与 Clarification、Tool Approval、Cancel 的冲突规则。

### K3.3-B：Steer 消费路径

- Lifecycle safe boundary 读取 pending Steer；
- 冻结一批 Steer，按 sequence 注入 Context，并只触发一次 Model Round；
- 注入 canonical Transcript；
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
- Pending / consumed / rejected / cancelled 状态；
- 队列顺序、取消和恢复展示；
- clarification / approval / steer 模式互斥。

### 输入限制

- 复用现有用户消息长度限制；
- 对 pending 输入设置一个简单总量上限；
- 超过上限直接拒绝，不静默丢弃、不覆盖旧消息、不自动合并。

## 12. 完成标准

K3.3 完成至少应满足：

1. 运行中发送消息不会重复创建当前 Run，也不会污染当前 Context；
2. 使用服务端 sequence 排序，Follow-up 按 FIFO 在当前 Run `completed` 后各启动一次，`failed/cancelled` 后保持暂停；
3. Follow-up 启动完全复用普通对话 Run 流程；
4. Steer 不打断当前 Model 或 Tool action；同一批 Steer 只触发一次 Model Round；
5. 同一输入在重试、断线重连和重复事件下不会重复消费；
6. Clarification / Tool Approval 不会被普通 Steer 或 Follow-up 绕过；
7. Run Snapshot、SSE 和数据库事实对输入状态保持一致；
8. 没有 active Run 时继续走现有普通对话流程。

### 12.1 端到端验收

代码实现完成后，必须使用 `agent-browser` 对真实运行中的 Web/API 进行端到端验证，不以 unit test 或 fixture 状态代替真实验收。至少覆盖：

- Runtime 执行期间提交 Follow-up，当前 Run 完成后自动启动下一轮；
- Runtime 执行期间提交多条 Steer，点击“引导模型”后在同一 safe boundary 批量进入一次 Model Round；
- Model / Tool 执行中发送输入不会打断当前 action；
- `final_answer` 阶段提交 Steer 自动转为 Follow-up；
- `failed/cancelled` 后 Follow-up 队列保留且暂停；
- 刷新、断线重连和重复点击不会造成重复消费或重复 Run；
- clarification / tool approval pending 时，Steer 和 Follow-up 不会绕过当前 Interrupt；
- 没有 active Run 时继续走现有普通对话流程。

端到端测试发现任何问题时，必须修改实现并重新执行相关场景；持续迭代，直到上述流程真实跑通、状态和 UI 一致且无已知阻塞问题，才算 K3.3 验收完成。
