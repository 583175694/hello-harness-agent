# Reasoning Context Transcript

> 决策状态：已实施。本文冻结 Reasoning、Tool Call、Tool Result 的保存与选择性回放规则，并明确模型协议事实不等于用户可见内容；Context Engineering 只在后续负责计量、选择、压缩和淘汰，不得用临时截断替代本文的 transcript 基线。

## 1. 背景与问题

Reasoning Context Transcript 已将供应商 reasoning、Assistant Tool Call 和对应 Tool Result 纳入 canonical model message 与 durable transcript，解决了 DeepSeek Thinking + Tool Calling 的协议回传问题。Conversation 不直接展示冗长的原始 reasoning；请求编译也不会把无 Tool Call 的最终回答 reasoning 带入下一用户轮次。

这些边界解决三个问题：

- DeepSeek V4 等 Thinking + Tool Calling 模型要求后续请求完整回传与 Tool Call 关联的 `reasoning_content`，丢失会直接导致协议错误。
- 跨用户轮次只回放问题和最终回答会丢失模型此前看到的工具材料与执行路径，后续问题无法可靠引用上一轮调查上下文。
- 原始 reasoning 通常冗长且不等于可靠解释，直接投影到普通 Conversation 会压过工具活动和最终答案。

因此，Context Engineering 实施前先建立完整、结构化、可持久化的 model transcript。

## 2. 核心决策

```text
Canonical Transcript
  保存供应商无关的 user / assistant text / reasoning / tool call / tool result

Model Adapter
  provider stream -> canonical transcript event
  canonical transcript -> target provider request

Runtime
  维护顺序、关联、完整性和执行边界

Projection / Stream
  只将 text 和 tool activity 按真实发生顺序展示给用户
  raw reasoning 不进入普通 Conversation

Context Engineering（后续）
  决定完整 transcript 中哪些材料进入有限模型窗口
```

当前基线是：durable transcript 按顺序完整保存，不主动摘要、裁剪或只保留最终回答；请求编译按供应商协议选择性回放。与 Tool Call 绑定的 reasoning、Tool Call 和全部 Tool Result 作为原子单元回放；无 Tool Call 的最终回答只回放 `content`，其 reasoning 可以保留为会话事实和诊断材料，但不进入下一用户轮次。达到供应商上下文限制时应返回明确错误，不得静默破坏工具协议单元。

## 3. 三类模型与数据

### 3.1 Canonical Model Transcript

模型真实输入历史，至少表达：

```ts
type ModelTranscriptItem =
  | { type: 'message'; role: 'user'; content: string }
  | {
      type: 'assistant_turn';
      content: string | null;
      reasoning?: ReasoningPayload;
      toolCalls?: ModelToolCall[];
    }
  | { type: 'tool_result'; toolCallId: string; content: string };

type ReasoningPayload = {
  content: string;
  source: {
    provider: string;
    model: string;
    format: string;
  };
  replay: 'native_tool_chain' | 'diagnostic_only';
};
```

具体字段名可在实现时调整，但必须保留以下语义：

- reasoning 与产生它的 assistant turn 保持关联；有 Tool Call 时进一步与完整工具协议单元绑定。
- Tool Result 通过 `toolCallId` 与 Tool Call 完整配对。
- provider/model/format 足以判断是否可以原样回放。
- 最终正文、reasoning 和工具协议不是同一个字符串字段。

System Prompt 由当前运行配置在请求编译时注入，不作为会话 transcript item 重复持久化；若未来支持版本化 system policy，应保存 policy/version 引用而不是把敏感完整 prompt 混入用户会话历史。

### 3.2 Conversation Projection

用户可见的有序时间线：

```text
text block（工具调用前言，可选）
tool activity block
text block（下一次工具调用前言，可选）
tool activity block
answer text block
```

Projection 不展示 raw reasoning，也不从 reasoning 生成或伪造用户可见解释。`text` 与 `tool_activity` 必须按 `roundSequence + blockSequence` 的真实业务顺序渲染；首版不折叠。未来若内容过长，只能以完整工具轮次为单位折叠，不能把工具前言留在外部而单独折叠 Tool Activity。

### 3.3 Observe / Debug Trace

诊断数据记录延迟、token、错误和协议转换结果。它不是模型上下文，也不是 reasoning 的唯一存储位置。

## 4. 回放规则

### 4.1 当前 Run 内

每次后续模型请求都携带当前 run 已产生的完整工具链：

```text
User Question
Assistant Reasoning 1 + Content 1 + Tool Call 1
Tool Result 1
Assistant Reasoning 2 + Content 2 + Tool Call 2
Tool Result 2
...
```

DeepSeek 与 Tool Call 关联的 `reasoning_content` 必须完整聚合并在后续请求中原样回传。流式分片不能只保留最后一段，也不能混入 `content`。模型流结束前不能仅凭先到达的 `content` 判断它是工具前言还是最终答案；Round 完成且存在 Tool Call 时，它属于工具轮并保持原位，否则才是最终回答。

### 4.2 跨用户轮次

Run 成功完成后，下一次用户请求按协议回放历史 transcript：

```text
User Question 1
Reasoning + Content + Tool Calls / Tool Results
Final Answer 1（不携带该最终 Round 的 reasoning）
User Question 2
```

与 Tool Call 绑定的历史 reasoning 必须继续以 native `reasoning_content` 回放；无 Tool Call 的最终 assistant round 只回放最终 `content`，不把该 round 的 reasoning 拼入下一用户轮次。工具 UI Projection 不能反向充当 transcript；必须从专用 canonical 持久化数据恢复。

### 4.3 原子完整性

以下关联不能被普通消息处理拆散：

```text
Assistant Reasoning
+ Assistant Tool Calls
+ 对应的全部 Tool Results
```

禁止：

- 保留 Tool Call 但删除其对应的 reasoning。
- 保留 Tool Result 但删除 Tool Call。
- 摘要或改写 reasoning 后冒充供应商原始字段回传。
- 合并 assistant turns 时丢失工具协议所需的 reasoning，或把最终回答 reasoning 错标为工具链 reasoning。
- 根据 UI block 文案重建 provider 请求。

未来 Context Engineering 如需压缩，必须对关联单元执行显式、可解释的转换策略。

## 5. Model Adapter 职责

Model Adapter 是供应商协议差异的唯一编码/解码边界：

- 读取 DeepSeek `reasoning_content`、其他供应商等价字段或内容块。
- 输出 Runtime 内部统一的 reasoning delta/completed 事件。
- 将 canonical assistant turn 编码为目标供应商支持的消息格式。
- 根据 provider/model profile 判断 reasoning 的 native replay 能力。
- 对不兼容的目标拒绝原样编码，返回结构化 capability/compatibility 结果。

Model Adapter 不负责：

- 决定删除哪些历史材料。
- 决定压缩或摘要策略。
- 将不兼容 reasoning 自动改写成普通 assistant 正文。
- 决定 raw reasoning 是否进入普通 Conversation；当前产品边界由 Projection 契约统一规定为不展示。

模型切换时，Runtime/未来 Context Compiler 先选择或转换上下文，Adapter 只编码已经确认兼容的 canonical input。若没有安全转换策略，应明确拒绝或降级，而不是静默丢字段。

## 6. Runtime 职责

Runtime 负责：

- 聚合同一 model round 的 reasoning delta。
- 保持 reasoning、content、Tool Call 的业务顺序。
- 在执行 Tool 前形成完整 assistant turn。
- 为每个 Tool Call 补齐 Tool Result。
- 按工具链回放规则将 canonical transcript 编译给下一模型轮次。
- 在 run terminal 前持久化足以恢复的 canonical transcript/checkpoint。
- 重试时隔离不同 attempt，失败尝试的半截 reasoning 不得混入有效历史。

同一个 run 必须冻结 provider、model 和 thinking 配置。中途切换 thinking enabled/disabled 属于协议变化，不能隐式发生。

### 6.1 用户推理强度

Composer 在发送按钮旁提供供应商无关的四档推理强度：

| UI 文案 | Canonical 值 | DeepSeek OpenAI 格式                                         |
| ------- | ------------ | ------------------------------------------------------------ |
| 无思考  | `off`        | `thinking: { type: 'disabled' }`                             |
| 轻度    | `low`        | `thinking: { type: 'enabled' }` + `reasoning_effort: 'low'`  |
| 中度    | `high`       | `thinking: { type: 'enabled' }` + `reasoning_effort: 'high'` |
| 高度    | `max`        | `thinking: { type: 'enabled' }` + `reasoning_effort: 'max'`  |

DeepSeek 没有名为 `medium` 的协议值；UI 的“中度”映射到官方 `high`，“高度”映射到官方 `max`。默认选择“中度”，与 DeepSeek 默认启用 thinking 且默认 effort 为 `high` 保持一致。

推理强度是用户可选的 run profile，不是 provider raw 参数。共享协议只传 canonical `off | low | high | max`，Model Adapter 根据目标模型能力映射：

- 支持开关和强度：完整映射。
- 只支持开关：将非 `off` 档映射为 enabled，并在 UI 标明不支持细分强度。
- 不支持 reasoning 控制：禁用该控件或使用模型固定值，不发送未知参数。
- 目标模型不支持所选档位：创建 run 前返回明确 capability 错误，不静默改档。

用户在提交消息时选定强度；run 创建后冻结，不能在工具循环中途改变。下一次新消息可以重新选择。Run、Transcript 和恢复 Snapshot 必须保存 effective reasoning profile，以确保重连、重试和后续回放使用一致配置。

本轮生成配置与历史回放是两个独立概念：

- `reasoningEffort: off` 只关闭当前 run 新 reasoning 的生成。
- 历史 transcript 中为满足工具链协议而需要 native replay 的 reasoning 仍必须回传。
- Adapter 不得因为当前 run 选择 `off` 就删除历史 `reasoning_content`。
- 如果目标供应商不允许“关闭当前思考但保留历史 reasoning”的组合，服务端应在创建 run 前返回兼容性错误。

## 7. Stream 与前端投影

Model Adapter 和 Runtime 内部保留 canonical reasoning 增量，用于聚合、attempt 隔离和 transcript 提交；普通 Conversation SSE 不需要发送 raw reasoning delta，也不创建用户可见 reasoning block。已有协议类型和旧 Snapshot 在过渡期可以保留兼容解析，但前端应忽略 reasoning block，不能因旧数据存在而恢复失败。

产品要求：

- 普通 Conversation 不展示 raw reasoning，也不提供“思考过程”折叠区。
- `text` 和 `tool_activity` 按真实发生位置穿插展示，首版不折叠。
- 工具轮 `content` 是用户可见前言，必须紧邻该轮 Tool Activity，不能被统一移动到所有工具活动之后。
- reasoning 不参与最终 answer 文本拼接。
- 刷新和重连后恢复相同的 text/tool activity 顺序与内容。
- 前端不理解 `reasoning_content` 等供应商字段，也不从 reasoning 重建用户可见状态。
- Composer 显示当前推理强度；控件使用菜单或分段选项，不占用发送按钮的主命令语义。
- `off` 模式下如果供应商仍返回 reasoning，Adapter 仍按实际响应规范化并记录能力偏差，但不投影到 Conversation。
- 若未来需要用户可见过程说明，应由独立、简短的 Progress/Tool Activity 语义生成，不能直接暴露或摘要 raw reasoning 后冒充模型解释。

## 8. 持久化边界

现有 Message `content + metadata.blocks` 只适合 Conversation Projection，不足以作为完整模型 transcript。

实施时应增加专用持久化结构，形式可以是：

- run-scoped transcript items 表；或
- 版本化 transcript JSON/checkpoint，并为后续 item 化保留迁移路径。

无论采用哪种形式，都必须满足：

- 有稳定顺序和 schema version。
- 能恢复 provider/model/thinking profile。
- 能恢复用户请求档位与 Adapter 实际生效档位。
- 能表达 assistant reasoning + content + tool calls。
- 能表达完整 Tool Result 和关联 ID。
- 与用户可见 Message/Projection 分离；Projection 不需要保存 durable reasoning block。
- active Run checkpoint 与 terminal history 都可恢复。

原始 reasoning 属于用户会话数据，应随 Session 删除；日志默认不得重复保存完整 reasoning，避免形成不受控副本。

### 8.1 Run 终态与 Transcript 提交

Transcript 使用“active checkpoint + terminal commit”两阶段语义：

```text
running
  reasoning/tool chain -> Active Run Transcript Checkpoint

completed
  完整且协议闭合的 transcript -> Session Long-term Transcript

failed/cancelled
  保留用户可见 Message/失败 Projection
  清理 active transcript，不把半截 reasoning、孤立 Tool Call 或未配对 Tool Result 提交到长期 transcript
```

失败或取消的 active checkpoint 不进入用户可见 Projection，并应在 terminal/reconciliation 事务中清理。若未来支持从失败步骤继续执行，需要单独定义有期限的诊断保留与 resume 协议，不能把半成品历史当作已完成上下文。

高推理强度耗尽输出 token、只产生 reasoning 而没有最终 answer 时，Run 应以明确的模型长度错误失败；reasoning 不得自动提升为最终回答。

### 8.2 生命周期与事务

Transcript 的生命周期归属于 Session：

- `session_id` 是所有权与删除边界，删除 Session 时级联清理。
- `run_id`、`message_id` 是来源关联，不应通过删除 Run/Message 级联破坏已经提交的长期 transcript。
- completed Run 的 assistant delivery、长期 transcript 和 terminal Run 状态应在同一事务或可证明等价的原子提交协议中完成。
- active transcript checkpoint 与长期 transcript 必须有明确状态/版本，避免重启恢复时重复提交。

### 8.3 幂等性

Create Run 的幂等 payload 至少包含：

```text
content
+ reasoningEffort
+ 其他未来会改变模型执行语义的 run profile
```

相同 idempotency key 搭配相同 content 但不同 reasoning effort 必须返回 conflict，不能复用旧 Run。服务端计算 payload hash 时使用 canonical serialization，不能只 hash 用户正文。

### 8.4 能力发现

前端不根据模型名称硬编码推理档位。Public Config 提供 canonical capability：

```ts
type ReasoningCapability = {
  supported: boolean;
  levels: Array<'off' | 'low' | 'high' | 'max'>;
  default: 'off' | 'low' | 'high' | 'max';
};
```

Model profile/Adapter 声明能力，API 只投影非敏感 canonical 配置，前端据此显示、禁用或隐藏选项。

### 8.5 模型切换与断代后的 Session

Native replay 的最低匹配条件是：目标 provider、模型系列/协议版本和 reasoning format 被 capability matrix 明确标记为兼容。仅模型名称相似不能推断兼容。

本次断代升级不支持任何旧 Session 兼容。正式 migration 前必须用一次性清库脚本删除全部 Session；实现中不包含 legacy prefix、lazy migration、旧 Message 回退或双读逻辑。新同事从空数据库初始化，不需要也不应该执行清库脚本。

断代后，当服务端配置或未来用户选择导致模型变化时：

- compatible：继续 native replay。
- incompatible 且已有安全转换：由未来 Context Engineering 生成新的非 native context item。
- incompatible 且无转换：拒绝在原 Session 继续执行，并提示新建 Session 或恢复兼容模型。

如果一个断代后的 Session 存在用户/助手 Message，但没有合法的 committed/active Transcript，服务端必须返回数据完整性错误；不得从 Message 猜测或重建模型上下文。

不得因 `.env` 模型变化、服务重启或模型路由调整而静默删除旧 reasoning。

## 9. Context Engineering 边界

本文先建立完整事实源，Context Engineering 后续负责：

- token 计量和最终回答空间预留。
- 历史选择、压缩、摘要和淘汰。
- provider/model 切换时的上下文转换。
- 对 reasoning/tool 单元的兼容处理。
- included/omitted/converted trace。

Context Engineering 不能把 provider 私有 reasoning 当作普通可随意改写文本。压缩后的摘要必须使用新的 canonical context item 类型，不能继续标记为 native reasoning。

## 10. 分阶段实施

### R0：协议与 Adapter

- canonical reasoning 类型和 model profile capability。
- canonical `off | low | high | max` 推理强度与供应商映射。
- 流式读取/聚合 reasoning。
- DeepSeek 请求只为 Tool Call 关联的 assistant round 回传 `reasoning_content`。
- Adapter 单元测试和真实 API 合约测试。

### R1：Runtime 与 Projection

- reasoning runtime 内部事件和 attempt 隔离，不向普通 Conversation SSE 暴露 raw reasoning。
- Composer 推理强度菜单、能力状态和每次新 run 的冻结配置。
- 前端只将 text/tool activity 按真实顺序展示，首版不折叠。
- Tool loop 完整性和 attempt 隔离测试。

### R2：跨轮持久化与恢复

- transcript durable schema/checkpoint。
- Run 启动时恢复完整历史 transcript。
- 刷新、重连和新用户轮次回放测试。
- 删除、失败、取消和 terminal transaction 语义。
- active checkpoint 与长期 transcript 的原子提交、去重和清理。
- Create Run 幂等 payload 覆盖 reasoning effort。

### R3：模型切换与兼容策略

- provider/model profile 能力矩阵。
- native tool-chain replay、diagnostic-only、拒绝/降级路径。
- 不兼容模型切换的明确产品反馈。
- Public Config reasoning capability 与旧 Session 兼容检查。

Context Engineering 在 R0-R3 的完整事实边界稳定后实施。

## 11. 验收标准

1. DeepSeek Thinking + Tool Calling 连续多轮不因缺失 `reasoning_content` 返回 400。
2. 同一 run 多次 Tool Call 的 reasoning、调用和结果顺序完整。
3. 新用户问题可以回放上一轮完整工具链和最终正文；与 Tool Call 绑定的 reasoning 原样回放，无 Tool Call 的最终 reasoning 不进入下一用户轮次。
4. raw reasoning 不进入普通 Conversation、Message content 或用户 SSE；刷新和重连后 text/tool activity 顺序一致。
5. 工具轮 content 紧邻对应 Tool Activity，不能统一移动到执行区之外或最终答案区域。
6. 模型切换不会把不兼容的 provider 私有字段静默发送出去。
7. 未实施 Context Engineering 前不静默截断 transcript；超限返回明确错误。
8. Session 删除会清理 transcript，普通日志不保存完整 reasoning 副本。
9. 四档 UI 能正确映射到 DeepSeek `thinking/reasoning_effort`，run 中途不会改变 effective profile。
10. 当前 run 关闭思考时仍正确回放协议要求的历史 reasoning。
11. failed/cancelled Run 不污染下一次用户 Run 的长期 transcript。
12. 相同幂等键搭配不同 reasoning effort 返回 conflict。
13. 模型配置变化不会静默丢弃不兼容历史。
14. reasoning-only 的长度截断不会被当作最终回答。

## 12. 参考资料

- [DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)
- [DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)
- [DeepSeek Multi-round Conversation](https://api-docs.deepseek.com/guides/multi_round_chat)
- [DeepSeek Chat Completion API](https://api-docs.deepseek.com/api/create-chat-completion)
