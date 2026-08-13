# Model-led Tool Boundary

> 决策状态：已实现（协议 `0.8.0`）。本文是当前阶段 Model、Agent Runtime、Tool 与 Projection 决策权边界的权威说明；Reasoning、Tool transcript 和跨轮回放由 `27-reasoning-context-transcript.md` 补充。

## 1. 背景

迁移前的实现已经消除了 `AgentRuntimeService` 对 `web_search`、`web_fetch` 等具体工具名称的判断，但仍存在一层间接控制：

- Runtime 创建并传递 `ToolRunState`。
- Web Research 在其中维护 `WebResearchRunState`。
- Tool 可以通过 `control.forceFinalAnswer` 或 `control.disableTools` 改变 Runtime 后续行为。
- URL 来源、跨调用去重、累计预算和连续无新增内容等领域状态可以决定是否结束工具阶段。

这使 Runtime 在代码表面上保持工具名称中立，却仍由 Tool 领域通过统一控制协议影响 Agent 主循环。Tool 不再只是能力执行器，而形成了一个隐藏的领域编排器。

本次实现没有新增 `RuntimeDecisionPolicy`、`WebResearchRuntimePolicy` 或其他二级决策层。任务语义决策统一交给模型；Runtime 只执行模型决策并维护确定性的通用执行边界。

## 2. 核心决策

```text
Model
  回答：下一步做什么？

Agent Runtime
  回答：模型决策如何被完整、安全地执行？

Model Adapter
  回答：供应商的 reasoning/text/tool 协议如何转换为 canonical transcript，并如何编码回兼容目标？

Tool
  回答：这个具体能力如何完成，并取得什么结果？

Projection
  回答：已经发生的事件如何持久化和展示？

Context Engineer（后续）
  回答：完整模型上下文在有限窗口中应该装入什么？
```

这里的“模型负责决策”只指任务语义和执行方向，不包含安全与工程约束。模型不能关闭 SSRF 防护、扩大响应体、覆盖超时、绕过取消或突破通用 Tool Call 上限。

### 2.1 Model 负责

- 是否需要联网或直接回答。
- 是否先 Search、直接 Fetch，或选择其他工具。
- Tool Result 是否足以支持当前回答。
- Tool 失败后是否重试、换来源、换工具或受限回答。
- 是否继续获取信息或生成最终回答。

### 2.2 Runtime 负责

- 模型轮次与消息上下文编排。
- 工具定义暴露、注册表查找、参数解析、执行分派和 Tool Message 回填。
- 每个 assistant run 最多 20 次模型声明的 Function Tool Call。
- 模型单轮超时、Tool 声明超时的统一执行，以及用户取消传播。
- Tool Call 与 Tool Message 的完整配对。
- reasoning、Tool Call、Tool Result 的顺序、关联和完整回放。
- 工具生命周期事件、执行历史、日志和持久化交付。
- 达到 20 次 Tool Call 后停止暴露工具，并发起一次无工具最终回答。
- 最终回答的空内容、长度、DSML 和结构化 Tool Call 污染校验。

Runtime 不判断研究材料是否充分，不根据 Web 领域状态决定停止、重试或更换来源，也不计算来源 provenance。

### 2.3 Tool 负责

- 声明名称、描述、输入 Schema 和不可由模型覆盖的单次执行超时。
- 校验并执行本次能力调用。
- 返回完整、结构化的成功结果或失败结果。
- 返回稳定错误码、安全错误详情、`retryable` 事实和安全日志字段。
- 维护能力内部工程约束，例如 Web Fetch 的 SSRF、DNS、重定向、MIME、响应大小、正文提取、Passage 排序和进程内 LRU。

Tool 不返回控制命令，不决定下一步，不声明任务完成，不维护影响任务方向的跨调用状态。连接池、Provider client、限流器、缓存和 transport retry 属于能力内部工程状态，不属于任务规划状态。

### 2.4 Projection 负责

- 根据已经发生的用户消息、Tool Call 和 Tool Result 派生 source snapshot。
- 记录 URL provenance，但不把 provenance 当作执行权限。
- 完整保留每次 execution，同时把相同来源归并为一条 canonical source。
- 为 Conversation、Workbench、持久化恢复和评测提供一致读模型。

Projection 只解释事实，不反向控制 Runtime 或 Tool。

Model Adapter 负责供应商协议转换，不负责上下文选择。DeepSeek `reasoning_content` 等字段必须先转成 canonical reasoning；目标模型不兼容时，Adapter 返回 capability/compatibility 结果，不静默丢弃或把 reasoning 拼进正文。

## 3. 目标 Tool 契约

目标 `ToolExecutionContext` 只包含本次执行所需的通用信息：

```ts
type ToolExecutionContext = {
  sessionId?: string;
  messageId?: string;
  toolCallId: string;
  signal?: AbortSignal;
};
```

每个 Tool 声明不可由模型覆盖的外层超时：

```ts
interface AgentTool<TInput, TOutput> {
  readonly executionPolicy: {
    timeoutMs: number;
  };

  execute(input: TInput, context: ToolExecutionContext): Promise<ToolExecutionResult<TOutput>>;
}
```

Runtime 统一把用户取消信号与 `executionPolicy.timeoutMs` 组合，并强制整个 Tool Call 在边界内结束。Tool 内部仍可保留连接、单 URL、单次 Provider 请求或响应读取等更细粒度的 transport timeout。

目标 `ToolExecutionResult` 不包含 `control`：

```ts
type ToolExecutionResult<TOutput> =
  | {
      status: 'succeeded';
      output: TOutput;
      logFields?: Readonly<Record<string, string | number | boolean>>;
    }
  | {
      status: 'failed' | 'timeout' | 'cancelled';
      error: {
        code: string;
        detail: string;
        retryable: boolean;
        cause?: unknown;
      };
      logFields?: Readonly<Record<string, string | number | boolean>>;
    };
```

`output` 或结构化 `error` 是 Tool 唯一返回结果。Runtime 负责对 canonical public result 进行确定性序列化，生成与当前 Tool Call 配对的 Tool Message；诊断专用 `cause` 和 `logFields` 不进入模型。Tool 不再维护一份面向模型的第二结果，也不决定哪些合法结果字段进入模型。当前阶段不建立独立的 observation 对象、delivery 状态或字符预算协议，Tool Result 执行完成后始终注入当前 Runtime 上下文。

`retryable` 只描述这次失败是否具备重试条件，不命令 Runtime 自动重试。Runtime 将结构化失败结果交给模型，由模型在剩余 Tool Call 额度内决定下一步。

## 4. 通用 Tool Call 上限

当前每个 assistant run 最多执行 20 次模型声明的 Function Tool Call：

```text
成功调用                         = 1 次
失败或超时调用                   = 1 次
参数校验失败                     = 1 次
一次 web_fetch(urls: 1-5)       = 1 次
```

`web_fetch` 单次最多 5 个 URL 是 Tool 输入约束，不是跨调用研究预算。当前模型适配层能够接收同一 assistant 响应中的多个 Tool Call，Runtime 按模型声明顺序串行执行并为每个调用补齐 Tool Message。

达到 20 次后，Runtime 不再执行新的 Tool Call，并进入一次不提供工具定义的最终回答。这个状态是 Runtime 的通用收敛机制，不是 Tool 的 `forceFinalAnswer`，也不表达某个领域已经“研究充分”。

## 5. URL provenance 与来源归并

模型可以 Fetch 任意通过安全 Guard 的公开 HTTP/HTTPS URL，不再要求 URL 必须来自用户直链或本轮 Search clue。

provenance 只作为可观测事实，由 Chat / Research Projection 根据已经发生的事件派生：

```text
user_provided > search_clue > model_proposed > unknown
```

Projection 使用统一 URL normalization 关联用户直链、Search clue 和 Fetch 结果。provenance 不阻止请求、不结束调查，也不进入 Tool 或 Runtime 的规划状态。

两层记录采用不同语义：

```text
Execution / Activity
  每次 Tool Call 完整保留，不去重

Source snapshot / Workbench
  normalized/final URL 相同或 contentHash 相同
  -> 合并为一条 canonical source
```

合并后的来源聚合全部 `toolCallIds`，provenance 取最高优先级。`contentHash` 可用于来源归并、缓存和诊断，但不能阻止 Tool 执行。

## 6. Context Engineering 边界

当前阶段不使用 Unicode 字符数或 Tool Result 局部预算阻止内容注入，也不增加以下协议：

- 单次 Tool Result 字符上限。
- 单个 assistant run 的 Tool Result 累计字符上限。
- `ToolObservationDelivery` 或 `observation` 终态字段。
- `modelContextInjected` 或“已获取、未注入模型”状态。
- Tool Result 的选择、压缩、截断和淘汰。

在 Context Engineering 前，先按 `27-reasoning-context-transcript.md` 建立完整 reasoning/tool transcript 事实源和跨轮回放。该前置阶段解决协议正确性与透明化，不做 token 预算或压缩决策。

当前 Tool Result 始终注入 Runtime。长会话或连续大结果可能扩大模型上下文，这是已知的阶段性限制。

未来如果实施 Context Engineer，它必须面向 System Prompt、历史消息、当前用户输入、Assistant Tool Calls、Tool Results 和最终回答预留等完整上下文统一计量与编译，而不是围绕 Web Research 或 Tool 单独建立预算。本阶段不预先冻结其 Token 计量、选择、压缩、淘汰或 delivery schema。

## 7. 移除与保留

当前实现已移除：

- `ToolExecutionResult.control`。
- Tool 单独返回的 `modelContent`；改由 Runtime 序列化 canonical `output/error`。
- Tool 返回的 `forceFinalAnswer` 和 `disableTools`。
- 用于领域共享的 `ToolRunState`。
- `WebResearchRunState`。
- `ToolExecutionContext.latestUserContent` 和 `runState`。
- Web Search 向跨调用状态登记 clue URL。
- Web Fetch 的用户/Search URL allowlist。
- 跨调用 URL alias、contentHash 和 Passage 累计去重状态。
- Web 领域累计 URL/Passage 预算和连续无新增内容强制早停。
- `WebFetchResult.budget`、`canFetch` 和 `stopReason` 的控制语义。
- Tool observation 字符预算、注入状态和对应 SSE/metadata 字段。

当前实现保留：

- Runtime 每个 assistant run 最多 20 次 Tool Call 的通用上限。
- 模型轮次、消息、工具调用计数、取消状态和执行历史等通用 Runtime 状态。
- 模型单轮超时与最终回答协议校验。
- Tool 声明的外层执行超时，以及 Tool 内部更细的 transport timeout。
- Web Fetch 单次调用的 1-5 个 URL、并发、有限 transport retry、响应大小与正文大小限制。
- SSRF、DNS、重定向、协议降级、MIME 和二进制内容防护。
- 正文提取、质量检测、Passage 筛选、Locator 与进程内 LRU。
- 单次调用内的输入 URL 去重和事实性 `stats`。

## 8. 权衡

收益：

- 决策权单一，主循环更容易理解和验证。
- Tool 可以独立复用、测试和组合，不依赖某次 Agent run 的隐藏状态。
- 新增计算器、数据库读取或文件工具时，不需要为每个领域设计 run state 与控制协议。
- Runtime 不会随着新 Tool 增加而演变成集中式业务状态机。
- Execution、Source Projection 和未来 Context 编译拥有清晰边界。

代价：

- 模型可能重复 Search、重复 Fetch、低效重试或选择质量较低的 URL。
- 完整 Tool Result 始终注入，长会话可能增加延迟、成本并触发供应商上下文限制。
- 删除 URL allowlist 后，Fetch 目标不保证来自当前 Search clue；网络安全仍由 URL Guard 保证。
- 删除领域早停后，执行效率更多依赖提示词、模型能力、评测和 20 次通用上限。

这些属于当前阶段明确接受的质量与上下文风险。先通过真实评测观察，再决定是否优化提示词、模型、Tool 输出契约或建设全局 Context Engineer。安全、成本和平台稳定性边界仍必须由确定性代码强制，但不能以 Tool 建议的形式重新引入隐藏 planner。

## 9. 迁移顺序

1. 从共享 Tool 契约中删除 `control` 和 `modelContent`，同步删除 Runtime 对 `disableTools` 和 Tool `forceFinalAnswer` 的处理，并由 Runtime 统一序列化 `output/error`。
2. 删除 `ToolRunState`、`WebResearchRunState`、`latestUserContent` 和相关上下文字段。
3. 为 Tool 增加 `executionPolicy.timeoutMs`，由 Runtime 统一组合用户取消并执行外层超时。
4. 简化 Web Search，使其只执行搜索并返回 clue。
5. 简化 Web Fetch，使其只处理本次输入、单次调用去重和能力内部安全约束。
6. 将 `WebFetchResult.budget` 替换为不带控制语义的本次调用 `stats`。
7. 由 Projection 派生 provenance，并按 canonical URL/contentHash 归并 source snapshot。
8. 更新 Runtime、Tool、API、Web 和评测测试，删除领域预算、allowlist 和强制早停断言。
9. 使用真实 Research Eval 观察重复调用、来源质量、上下文大小和执行效率。

## 10. 验收标准

- Tool 在类型层无法返回 Runtime 控制命令。
- Tool execution context 不包含跨调用领域状态。
- Runtime 不包含 Web-specific 分支、状态或停止条件。
- Tool 声明不可由模型扩大或关闭的外层执行超时，Runtime 统一强制执行。
- Search 与 Fetch 只返回 canonical 结构化结果和结构化错误，不返回面向模型的第二份内容。
- Tool 成功或失败后，相应 Tool Message 都交给模型继续决策。
- 在未达到 20 次 Tool Call 且未取消时，是否继续调用工具完全由模型下一轮输出决定。
- provenance 只由 Projection 派生，不作为 Fetch 权限。
- execution 完整保留，source snapshot 确定性归并。
- 不新增 observation delivery 或 Tool Result 字符预算协议。
- Web 安全、传输和正文处理边界不因本次简化而削弱。

## 11. 非目标

本次迁移只解决当前 Model、Runtime、Tool 和 Projection 的决策权，不承诺或预先设计 Evidence Validator、Citation Validator、权限策略、Artifact Finalizer 或其他未来能力。
