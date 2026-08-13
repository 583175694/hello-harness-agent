# Context Engineering

> 文档状态：后续方向，尚未进入实施与协议冻结。Reasoning 与完整模型 transcript 的事实边界先按 `27-reasoning-context-transcript.md` 实施；本文只定义其后的选择、预算与压缩职责，不承诺具体算法或交付时间。

## 1. 当前状态

当前生产 Runtime 使用数据库最近 user/assistant 最终正文和当前 assistant run 内的 Tool Message 组成模型上下文；它尚未持久化和跨用户轮次回放 reasoning、Tool Call 与 Tool Result 的完整 transcript。该缺口由 Reasoning Context Transcript 前置阶段修复。完成后，Context Engineering 以完整 canonical transcript 为输入，再实现全局 Token 预算、材料选择、压缩、淘汰、摘要和最终回答空间预留。

因此，以下内容都不是当前能力：

- 独立 `ContextCompiler` 或 `ContextMaterialLoader`。
- `ObservationCard`、`ToolObservationDelivery` 或 observation 注入状态。
- 单次 Tool Result 或运行级 Tool Result 字符预算。
- 完整上下文 Token 计量和动态材料装载。
- 上下文编译 trace、context hash 或 tokenizer version 管理。

这些缺失不会由 Tool 或 Web Research 领域的临时预算协议代替。

## 2. 未来职责边界

如果后续评测证明长会话、连续 Tool Result 或材料相关性已经成为主要问题，Context Engineering 应成为模型输入的统一编译边界：

```text
System Prompt
+ 历史 Canonical Transcript
+ 当前用户输入
+ Assistant Reasoning
+ Assistant Tool Calls
+ Tool Results
+ 其他未来 Context
+ 最终回答 Token 预留
-> 全局计量、选择、排序、压缩、淘汰
-> 模型请求
```

它面向完整上下文，而不是只处理 Web Research、Passage 或 Tool Result。

Context Engineering 负责“模型在有限窗口中看到什么”，但不负责：

- 决定下一步调用哪个 Tool。
- 判断任务是否已经完成。
- 执行 Tool 或 Provider。
- 修改 Tool 的安全与传输边界。
- 派生 Workbench source provenance。
- 替代 Runtime 的 Tool Call 上限、取消和单次超时。
- 解析或编码供应商私有 reasoning 字段。
- 充当 reasoning/tool transcript 的唯一事实源。

## 3. 与当前模块的关系

```text
Model
  负责语义规划

Runtime
  负责模型/Tool 循环和通用执行边界

Tool
  负责能力执行并返回结构化结果

Projection
  负责执行与来源的持久化读模型

Context Engineering（后续）
  负责从完整 canonical transcript 统一编译有限模型输入
```

Tool 不选择结果中的哪些字段进入模型，也不自行报告字符预算或注入状态。当前阶段 Runtime 将 Tool 的 canonical `output/error` 完整序列化为 Tool Message；未来如引入 Context Engineering，选择与压缩决策应由统一上下文编译过程完成。
Reasoning 的供应商解码和编码属于 Model Adapter；reasoning、Tool Call 与 Tool Result 的顺序、关联和持久化属于 Runtime/Transcript。Context Engineering 只能选择、转换或淘汰已经存在的 canonical items，不能从 UI Projection 重建模型历史，也不能将摘要后的文本继续冒充 native reasoning。

## 4. 尚未冻结的设计

以下问题必须基于真实评测、模型上下文窗口、成本和延迟数据再决定：

- 使用供应商 tokenizer、近似 Token 还是其他计量方式。
- System、历史消息、Tool Result 和最终回答之间如何分配预算。
- Tool Result 是整体保留、结构化裁剪、摘要还是按需重载。
- 历史消息如何压缩，以及哪些用户纠正必须永久保留。
- reasoning + Tool Call + Tool Result 关联单元如何整体保留、转换或淘汰。
- 模型切换时哪些 reasoning 可以 native replay，哪些只能转成新的摘要 context item。
- 是否需要 context trace、included/omitted refs 和可解释淘汰原因。
- Context 编译是纯函数、带 I/O 的加载器加纯编译器，还是其他组合。

在这些决策完成前，不增加临时 observation/delivery 字段；Reasoning Context Transcript 所需的 canonical reasoning、SSE block 和 durable transcript 字段不属于临时 Context Engineering 占位，而是当前模型协议正确性所需事实。

## 5. 进入实施的触发条件

满足以下至少一项并有真实数据支持时，再制定独立方案：

- 模型请求稳定触发上下文长度错误。
- 连续 Tool Result 明显推高延迟或成本。
- 旧材料挤占当前任务相关信息，显著降低回答质量。
- 最终回答缺少稳定的输出 Token 空间。
- 评测显示需要动态选择、压缩或重新加载上下文材料。

届时重新定义协议、测试和迁移策略；当前不把 Evidence Validator、Citation Validator、权限策略或 Artifact Finalizer 纳入 Context Engineering 的前置设计。
