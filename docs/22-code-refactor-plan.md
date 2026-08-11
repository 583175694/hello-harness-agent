# Node 项目代码重构方案

## 目标

本轮重构的目标不是把项目拆成尽可能多的文件，而是建立稳定的职责边界，使普通对话、Function Calling、SSE 和后续 Agent Runtime 能够渐进演进。

判断标准：

- 新增一个工具时，主要修改工具自身和一个明确的注册入口。
- 更换 OpenAI-compatible 供应商时，Runtime 和业务服务不需要感知 SDK 细节。
- 模型轮次、工具循环、持久化和 SSE 传输可以分别测试。
- 保持现有 HTTP/SSE 行为，重构不改变用户可见功能。

## 已落地的分层

```text
HTTP Controller
  |
  +-- SseEventWriter                 SSE 传输边界
  +-- ChatService                    会话准备、兼容投影、交付编排
        |
        +-- AgentRuntimeService       模型轮次、工具循环、预算和运行事件
        |     |
        |     +-- ModelAdapter        canonical message / model event
        |     |     \-- OpenAICompatibleModelAdapter
        |     |
        |     \-- ToolRegistryService 工具发现、schema 校验、分派
        |           \-- AgentTool      WebSearchTool 等具体工具
        |
        +-- SearchProjectionCollector Activity / Sources 搜索投影
        +-- AssistantDeliveryRepository assistant 持久化事务
        +-- PrismaService
```

### 1. Tool Catalog

工具以 `AgentTool` 契约实现，工具定义集中在 `tool-catalog.ts`。Registry 不再包含搜索业务，只负责可用性、参数校验和执行分派。这个边界适合当前规模；暂不引入动态插件扫描、远程插件市场或复杂生命周期系统。

### 2. Model Adapter

Runtime 只使用项目内的 canonical `ModelMessage` 和 `ModelRoundEvent`。OpenAI SDK、流式 chunk 聚合、Function Calling 字段转换全部限制在 Adapter 内。这样可以替换任意 OpenAI-compatible endpoint，同时不把供应商类型传入 Agent 层。

### 3. Agent Runtime

Runtime 负责模型轮次、工具调用循环、参数解析、每个 assistant run 最多 20 次 Tool Call、达到上限后的无工具最终回答和标准事件输出。该上限按模型声明的 Function Tool Call 计数，不理解具体 Tool 的领域资源。

本次结构重构已经完成第一阶段的工具名称中立化：Agent Runtime 不导入具体工具类型，也不按工具名称解释输入输出。这消除了显式的 `if (toolName === ...)` 业务分支，但还不是最终的 Tool 边界。

历史第一阶段曾引入类型化、run-scoped 的通用 `ToolRunState`。当时 Runtime 只创建并传递该容器以及 `latestUserContent`、session/message/tool-call 标识和取消信号；Web Research 使用领域内的 `WebResearchRunState` 共享 URL provenance、URL/Passage 预算、去重与无新增内容状态。这些结构已在第二阶段删除。

历史工具执行结果曾通过统一契约声明 `logFields` 和 `forceFinalAnswer` 等控制意图。架构复核发现，这仍然让 Tool 领域通过抽象协议反向控制 Runtime；`ToolRunState` 也使 Web Research 成为隐藏的领域编排器。

第二阶段重构已经完成：没有增加新的 Runtime/Research Decision Policy，而是删除了 `ToolRunState`、`WebResearchRunState`、`control`、Tool `modelContent`、Tool `forceFinalAnswer` 和 `disableTools`。模型作为唯一语义规划者，Runtime 只执行模型决策和通用执行边界，Tool 只返回 canonical 结构化结果，Runtime 统一生成 Tool Message；来源 provenance 和归并由 Projection 派生。详见 [Model-led Tool Boundary](./25-model-led-tool-boundary.md)。

### 4. Projection 与 Persistence

搜索投影负责从通用工具事件收集 Activity、来源去重和恢复快照；交付仓库负责 assistant 消息、metadata 和 session 时间更新的事务。业务编排仍在 ChatService，但数据库写入和搜索投影已经可以独立测试和替换。

### 5. Session Title 与 SSE Transport

标题生成从 SessionsService/ChatService 中分离为 SessionTitleService。SSE 头、JSON 序列化、结束动作集中到 SseEventWriter。HTTP close 会通过 AbortSignal 传到模型和搜索请求，取消不会再被误报为普通模型失败。

### 6. Shared Protocol

协议包入口保持稳定，内部按 `common/`、`sessions/` 拆分 schema 和类型。运行时 ESM 导出使用显式 `.js` 扩展名，确保 Vite、Vitest 和 Node 直接加载 `dist` 时行为一致。

### 7. Frontend Feature Boundaries

前端页面层保留会话缓存、SSE 订阅和状态编排；可复用 UI 已拆到 `features/agent/components/`，其中 `conversation.tsx` 负责有序文本/Tool Activity 消息流、Composer 和吸底行为，`workbench-views.tsx` 负责统一 Workbench 外壳及 Activity/Sources/Report 视图，`fixtures/preview.tsx` 隔离开发预览数据。这样后续新增工具视图时不需要继续扩大页面组件文件。

### 8. Constants Policy

常量按作用域分层：协议限制和错误码放在共享包，环境变量键放在 API bootstrap，通用模型轮次、工具调用和最终回答策略放在 Runtime，URL/Passage 等 Web Research 资源规则放在 Web Research 领域，搜索归一化限制放在 Search，交互阈值和稳定 UI 文案放在 Web feature config。只使用一次且与结构强绑定的 JSX 文案、CSS 尺寸和测试数据不强行抽取；抽取标准是“是否需要跨模块一致、是否可能调整、是否代表业务规则”。

### 9. AsyncGenerator Boundary

`async/await` 用于等待一个最终结果，`AsyncGenerator` 用于异步过程中持续产生多个结果。当前只在模型流、Runtime 事件流和 Chat SSE 投影这三层保留异步生成器：它们需要实时传递文本增量、工具开始/完成/失败事件和轮次结束状态。工具执行、持久化、会话准备和标题生成仍使用返回 `Promise` 的普通异步函数。

把这三层机械改成普通 `async/await` 会失去中间事件，或被迫引入回调、异步队列、EventEmitter/Observable 等额外机制。因此本阶段保留 `for await...of` 作为流式边界；只有未来统一采用其他事件流抽象时，才整体替换，而不做局部语法迁移。

## 为什么不是一次性继续拆完

拆分能够降低认知负担，但每增加一个抽象也会增加跳转成本、依赖配置和调试路径。当前 `ChatService` 通过 `ResearchProjectionCollector` 统一投影 Search/Fetch execution 与 source；协议层仍使用按 `toolName` 判别的具体结果类型，避免把工具业务结构泄露进 Runtime。

前端仍有一部分会话编排逻辑集中在 `app.tsx`，这是有意保留的边界：它负责 session 选择、缓存、SSE 生命周期和跨会话后台生成。后续可以在协议进一步稳定后抽取 hooks 和 projection，但不应把同一状态机拆散到多个互相写状态的组件中。

## 下一阶段建议

1. **泛化 Runtime 事件协议**：让 `tool.completed` 使用通用 output 引用，搜索结果通过工具视图适配器解释；保留旧事件的兼容窗口。
2. **补齐工具层测试**：为 `WebSearchTool`、Registry 可用性、参数错误、取消和超时增加单测。
3. **抽取 Chat 编排端口**：将 `SessionStreamPreparation`、`RuntimeEventProjector`、`AssistantDelivery` 变成明确端口，ChatService 只保留顺序编排。
4. **继续拆分前端行为模块**：在现有 `fixtures`、`components`、`model` 边界上，抽取不依赖 JSX 的 projection 和 hooks，并以 session/run 状态机作为唯一状态源。
5. **建立运行观测**：为首字耗时、工具耗时、失败码和取消率补结构化事件或指标；日志不记录正文、提示词、密钥和供应商原始响应。

## 当前验证

- `pnpm lint` 通过
- `pnpm test` 通过：协议 8、agent-testkit 1、API 16、Web 11
- `pnpm --filter @harness/web test:e2e` 通过：14 条
- `pnpm --filter @harness/agent-protocol build`、API typecheck、Web build 通过
