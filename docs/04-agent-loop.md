# Agent Loop

> 文档状态：后续 durable Agent Loop 草案，不约束当前 Chat Runtime。当前 Model-led 边界以 `25-model-led-tool-boundary.md` 为准。

## 1. 定义

```text
CompiledStepContext
-> ModelAdapter
-> parse
-> canonical validation
-> one ValidatedModelAction
```

Loop 负责 decide，不负责 do。

## 2. R1 Lead Actions

```text
tool_call
ask_clarification
finish_research
fail
```

阶段 gating：

- P5 baseline：final_answer / ask_clarification / fail
- P6-P8 research：tool_call / ask_clarification / finish_research / fail
- P6 起 research run 不允许 final_answer

`steer/cancel` 是 Runtime control，不是 model action。

## 3. Model Adapter

使用 OpenAI 官方 SDK，配置：

- baseURL/env
- apiKey/env
- model profile
- timeout/retry
- structured output/tool calling capability
- reasoning/thinking capability、流式字段和 native replay compatibility

只有测试清单内模型保证兼容；其他 endpoint/model 为 best-effort。

Loop 不读取 env 或选择 provider profile。

Model Adapter 同时承担供应商协议磨平：将 `reasoning_content` 等供应商字段解码为 canonical reasoning，并把已经确认兼容的 canonical transcript 编码回目标模型。Adapter 不决定历史选择、压缩或淘汰，完整边界见 `27-reasoning-context-transcript.md`。

## 4. Decision Flow

```text
receive CompiledStepContext
-> verify phase/toolset/budget
-> call model
-> parse candidate action
-> canonical schema validate
-> semantic guard validate
-> repair if bounded and repairable
-> emit one valid action or fail
```

## 5. Semantic Guards

### tool_call

- toolName 必须在 current-step toolset。
- P6/P7 只允许 `web_search` 和 `web_fetch`。
- query reason 必须指向 open gap。
- 预算必须足够。

### ask_clarification

- 只能用于会显著改变结果的阻塞性歧义。
- 一次只问一个问题。
- 不得把普通规划选择推给用户。

### finish_research

- 必须存在可进入报告的 evidence candidate。
- 必须说明主要问题覆盖和剩余 gaps。
- 只触发 ReportPipeline，不包含正式用户报告。

### final_answer

- 仅用于 P5 baseline。
- P6 起从 research run action gate 移除。
- 模型不能绕过 CitationValidator 输出自由文本正式报告。

### fail

- 必须给出 structured code/reason。
- 不得用 fail 逃避可恢复 provider error。

## 6. Research Decision Policy

Searching phase 中，模型决定：

- 当前 gap 是否需要下一查询
- query 如何与已有查询不同
- clue 是否提示新方向
- evidence candidates 是否足够进入 drafting

但硬上限、fallback、evidence formal eligibility 和 completion guard 不由模型决定。

## 7. Repetition Guard

Loop 必须获得 normalized query history。以下 action invalid/reviewable：

- 与已有 query 只有标点/语序差异
- 没有说明新 gap
- 为凑来源数量重复搜索
- 预算耗尽后继续 tool_call

## 8. Invalid Action Repair

Repair 仅处理：

- JSON/schema 格式错误
- 缺 required field
- source/tool name 格式错误
- action 不在当前 capability gate

Repair 次数有硬上限。不能通过 repair 偷偷发起新业务推理或额外无限 model calls。

## 9. Report Review

Review/revise 使用同一个 ModelAdapter，但属于 ReportPipeline 管理的独立 steps。

Review 输出 canonical `ReportReview`：coverage gaps、unsupported claims、citation gaps、conflicts、required revisions。

Loop 不把 review 当 final answer，也不负责 deterministic citation validation。

## 10. Evidence Rules

模型必须区分：

```text
clue                 discovery only
evidence_candidate   can be selected
EvidenceSource       can be cited as [Sx]
```

模型不能自行创造 `evidenceId/displayId`，不能引用未出现在 context 的 evidence。

## 11. Tool Result

当前 Runtime 把 Tool 的 canonical `output/error` 序列化为 Tool Message 直接交给下一模型轮次，不建立独立 `tool_observation` 或字符注入预算。Reasoning Context Transcript 实施后，assistant reasoning、Tool Call 与对应 Tool Result 必须作为关联历史持久化并跨用户轮次回放。未来 Context Engineering 面向完整 canonical transcript 统一选择和编译材料，本草案不预先冻结 EvidenceCard/refs 或 observation schema。

## 12. Stop Conditions

普通 Loop 停止于：

- valid downstream action dispatched
- waiting_for_user
- runtime cancel/timeout
- 20 次 Tool Call 上限或其他通用执行边界触发
- unrecoverable validation/model failure

当前普通 Agent 是否继续调查或回答由模型决定；Runtime 只在取消、单次超时、协议失败或 20 次 Tool Call 上限时确定性改变流程。未来 durable workflow 的完成协议尚未冻结。

## 13. Streaming

R1 可以流式展示 progress/preview，但未通过 citation validation 的 draft 不作为最终 answer。Provider-specific text/reasoning stream delta 在 ModelAdapter 内规范化；reasoning 作为独立透明化内容块展示，不拼入最终 answer。

## 14. Observability

Model trace 至少记录：

- profile ID/model ID
- phase
- context hash/token estimate
- latency/token usage
- candidate action type
- validation/repair outcome
- error code

不得记录 API Key 或默认保存完整 system prompt。

## 15. Post-R1

P9 增加 MemoryCard 输入，不增加 Memory 管理 action。

P11 Lead 增加 `delegate_to_workers`，Worker action 集合独立且更窄。Worker 不输出 final report。

## 16. R1 验收

1. 每 step 只有一个 validated action。
2. 当前 toolset 外调用被拒绝。
3. clarification 只用于 blocking ambiguity。
4. 重复 query 受抑制。
5. budget 耗尽后不继续搜索。
6. clue 不生成正式 citation。
7. Research final 不绕过 report pipeline。
8. invalid action repair 有界。
9. steer 只通过下一 CompiledStepContext 影响决策。
