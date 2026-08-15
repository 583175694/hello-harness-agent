# Implementation Status

> 文档类型：研发状态快照。它记录当前代码、验证结果和已知限制，不替代产品契约、架构文档或实施计划。
>
> 最后更新：2026-08-16（Context Engineering 评测基础设施已落地，真实 Smoke 已完成，正式 Baseline 尚未冻结）

## 1. 当前结论

项目已经完成工程基线、持久化普通对话、General Web Research V1 和 Model-led Tool Boundary。模型可以通过 Bocha 或 Serper 发现网页线索，也可以直接提出公开 URL，再批量读取 1-5 个静态网页的可定位相关原文。Runtime 只保留每个 assistant run 最多 20 次 Tool Call、模型/Tool 超时、取消和协议边界；已删除 25 个跨调用唯一 URL、60,000 字符累计 Passage、连续无新增内容早停和 URL allowlist。

当前状态可以描述为“P8 Connection-Durable 时序加固已落地，P0 Context Evaluation Harness 已落地”：Run 已与 Chat HTTP/SSE 解耦，具备后台执行、Ordered Model Rounds、PostgreSQL versioned checkpoint、checkpoint 后 Event Tail、SSE replay/snapshot fallback、严格客户端 cursor、独立 cancel 和终态 CAS。Context Eval 已能够从真实 Session/Run/SSE 边界测量规则正确性、上下文压力、供应商 Usage、工具轨迹和恢复语义；Context Compiler、steer、搜索 fallback、Memory 和 Delegation 仍未实现。

2026-08-16 的真实 Context Smoke 共运行 8 题，通过 6 题、失败 2 题，Pass Rate 为 75%，并产生 2 个 critical violation。结果证明评测链路已经能够发现真实模型行为缺陷与 Harness 时序缺陷，但 Judge 8/8 返回格式不合约、Model Context Profile 尚未完成权威来源验证，因此该结果只是校准数据，不是可冻结的正式 Baseline。

Model-led Tool Boundary 已落地为协议 `0.8.0`：模型负责语义规划，Runtime 只执行模型决策和通用执行边界，Tool 只执行能力并返回 canonical 结构化结果，Runtime 统一序列化 Tool Message，Projection 派生 provenance 并按 URL/contentHash 归并 canonical source。`ToolRunState`、`WebResearchRunState`、Tool `modelContent/control` 和跨调用 URL allowlist 已删除；没有新增 Runtime Decision Policy、Web Research Policy 或 Tool observation 预算协议。详见 [25-model-led-tool-boundary.md](./25-model-led-tool-boundary.md)。

Connection-Durable 不引入 Redis，也不实现服务端重启后的自动续跑：PostgreSQL 保存 Run/Step/assistant checkpoint，进程内 Event Hub 保存 checkpoint 水位后的 Event Tail，客户端通过 Run Snapshot、SSE cursor 和重新订阅恢复；服务端重启遗留 active Run 收敛为 `failed + RUN_INTERRUPTED`。当前代码已采用 Ordered Model Rounds、Canonical Live Projection、versioned Checkpoint、Event Tail、Latest Live Snapshot fallback 和最小状态 CAS。详见 [26-connection-durable-agent-loop.md](./26-connection-durable-agent-loop.md)。

## 2. 从空项目到当前 Agent 的阶段演进

这一节记录的不是功能清单，而是每个实际阶段面对的问题、采取的方案、留下的边界和下一步动因。它用于解释项目为什么演进成现在的形态，避免后续只看到最终代码而丢失关键工程判断。

### 阶段一：从空仓库到可运行工程基线

**当时的问题**：项目没有可启动的 Web/API、数据库、共享协议、配置校验和测试入口。此时直接开发 Agent Loop，会把业务问题与环境、协议和部署问题混在一起，后续无法判断失败来自模型还是工程基线。

**解决方式**：建立 pnpm monorepo、React/Vite、NestJS、Prisma/PostgreSQL、共享协议包、环境变量校验、健康检查、日志脱敏、Vitest、integration test 和 Playwright 基线。生产 `/agent` 只展示真实空状态和明确的 capability unavailable；复杂 Workbench 状态先放在 development-only Preview，不用假数据冒充生产能力。

**阶段结果**：仓库从空项目变成了可以确定性安装、启动、检查和部署的应用骨架。前后端、协议、数据库和测试的责任边界先于智能能力稳定下来。

**仍未解决**：没有真实模型、会话、流式回答或 Agent 行为。下一阶段需要先打通最小 AI 对话闭环，而不是同时引入工具、Memory 和多 Agent。

### 阶段二：从普通 HTTP 接口到基础 AI 对话

**当时的问题**：模型供应商存在 base URL、模型名和流式协议差异；如果前端直接依赖供应商响应，Provider chunk、错误结构和密钥边界会扩散到整个系统。非流式回答又无法满足长生成过程中的用户反馈。

**解决方式**：使用 OpenAI 官方 SDK 接入 OpenAI-compatible Chat Completions，并通过项目内 `ModelAdapter`、canonical message 和模型事件隔离供应商协议。API 把模型文本转换为 Chat SSE，Web 使用乐观 user message 和空 assistant 占位实时追加 delta；长度截断、供应商失败和客户端断开都有明确失败语义。

**阶段结果**：形成了“用户提交 -> 后端模型调用 -> SSE 增量回答”的真实基础 AI 对话，模型与 Web 不再直接耦合。

**仍未解决**：对话历史仍需要可靠事实源，会话刷新、切换、并发和失败后的数据一致性尚未解决。下一阶段需要先把 Session/Message 持久化做扎实。

### 阶段三：从一次性对话到可恢复会话

**当时的问题**：如果由前端回传完整历史，浏览器缓存会成为上下文事实源；刷新、后台生成、会话切换和未来多端访问都可能产生历史分叉。流式过程中先写什么、失败时保存什么也缺少确定性规则。

**解决方式**：PostgreSQL 成为 Session/Message 权威来源，Web 只提交当前用户内容；API 先持久化 user message，再读取数据库最近 20 条消息，完整 assistant 回答成功后才落库。增加 session-scoped 执行注册表、会话 CRUD、标题生成、级联删除、前端分会话缓存和 URL 恢复。失败时保留用户已提交事实，但不持久化不完整 assistant 内容。

**阶段结果**：普通 AI 对话具备刷新恢复、会话切换、并发隔离和确定性持久化语义，前端缓存回归为低延迟投影而不是事实源。

**仍未解决**：模型只能依靠已有对话知识回答，不能主动获取外部信息。下一阶段需要引入 Function Calling，但必须由应用拥有循环、校验和预算，而不是把工具执行权交给模型或前端。

### 阶段四：从 AI 对话到会调用工具的 Agent

**当时的问题**：模型返回的 Function Calling 参数可能跨 chunk、JSON 不完整、工具不存在或参数无效；同一响应还可能声明多个调用。只有 `tools` 参数而没有应用侧循环、权限、预算和生命周期，就不是可控 Agent。

**解决方式**：实现 `AgentRuntimeService`、Tool Catalog、通用 Registry 和 `AgentTool` 契约。Runtime 聚合 tool-call chunk、解析并校验参数、串行执行工具、把 assistant tool-call message 与 canonical tool result 放回上下文，再让模型继续决策。加入 20 次通用工具调用上限、取消传播、工具生命周期事件和 Workbench Activity/Sources 投影；首个真实工具是统一 Provider 边界后的 `web_search`。历史中曾短暂引入通用领域状态和 Tool 控制意图，Model-led 迁移已经删除这些间接决策入口。

**阶段结果**：系统从“模型生成文本”升级为“模型决定下一步、应用确定性执行并继续循环”的基础 Agent，用户可以看到真实工具进度和搜索 clue。该阶段先完成 Runtime 的工具名称中立化，后续 Model-led 迁移又删除了领域状态与控制意图构成的间接反向依赖。

**仍未解决**：搜索摘要只是线索，模型没有真正读取网页正文；重复 URL、模型自造 URL、低质量页面和上下文膨胀仍可能损害回答。下一阶段需要建设有界 Web Fetch 和来源语义。

### 阶段五：从搜索 Agent 到有边界的 General Web Research

**当时的问题**：直接把网页 HTML 注入模型会带来脚本/导航噪声、Prompt Injection、上下文浪费和无法定位原文；多轮 Fetch 还会绕过单次限制，重复读取 URL 或正文，并在无新信息时继续消耗资源。

**解决方式**：实现 `web_fetch` 的 URL/DNS/redirect guard、Crawlee 有界获取、Readability 正文提取、canonical Markdown、Document Quality Gate、字符 n-gram 相关性筛选和可定位 Passage。单次调用内去重等价 URL，并用固定 24,000 code-point 输出上限控制返回材料；跨调用是否重试、换源或停止由模型决定。Workbench 区分 clue、fetched 和轻量 used 来源，Projection 记录 provenance 并归并 canonical source。

**后续加固**：在能力闭环完成后，本阶段删除会误伤健康长任务的 Agent run 总截止时间，并完成 Model-led 边界迁移。当前保留普通模型单轮 120 秒、最终回答单轮 30 秒、Search 外层 10 秒、Fetch 整批外层 45 秒、Fetch 单 URL transport 20 秒和用户取消；用 20 次通用工具调用保证循环结构性收敛。达到调用上限后的最终回答完全省略工具定义，服务端整轮缓冲并校验空响应、长度截断、结构化工具调用和 DSML；上游失败日志保留脱敏后的真实原因。

**阶段结果**：形成了 `search -> fetch -> relevant passages -> answer` 的完整联网调查闭环。Agent 不只“搜到链接”，而是基于真正读取过的公开静态网页完成普通回答，并能在 Tool 失败后由模型决定重试、换源或受限交付。健康长任务不再被总时钟误杀，单操作故障仍能隔离；异常工具循环有确定上限；Tool 不共享或维护跨调用规划状态。

**当前仍未解决**：

- 首次真实 Smoke 只有 2/6 题通过硬规则；直链题工具选择、execution/source 快照一致性、题目工具调用上限、模型流中断和 Judge 超时仍需分类和校准。
- Runtime 仍属于一次 Chat 请求内的内存循环，没有持久化 Run/Step/Event、断线 replay、后台继续执行、真正的 steer 和可恢复 cancel。
- 上下文仍主要使用最近消息和本轮完整 Tool Result，没有全局 Context Engineering、精确 Token 预算、材料选择/压缩/淘汰和最终回答空间预留；连续大结果可能触发模型上下文限制。
- Search 仍是单 Provider，没有 fallback、运行内熔断或失败查询抑制；重复上游失败会安全地消耗 20 次额度，但不够高效。
- `used` 只表示最终回答出现了来源 URL，不是逐句 Evidence/Citation；没有 Report Artifact、引用校验或独立复核。
- Fetch 只覆盖公开静态网页；JavaScript 页面、PDF、登录态内容、浏览器操作和完整公网 SSRF/DNS rebinding 防护尚未实现。

**下一阶段结论**：Connection-Durable Agent Loop 与 Reasoning Context Transcript 已完成。普通 Conversation 已隐藏 raw reasoning、恢复 text/tool 时序，并只回放 Tool Call 协议需要的 reasoning；下一阶段进入 Context Engineering，不横向增加工具。

### 阶段六：从请求内 Tool Loop 到 Connection-Durable Agent Loop

**当时的问题**：Agent 执行生命周期依附于一次 Chat HTTP/SSE 请求。浏览器刷新、会话切换或网络断开会结束 SSE，后台执行容易被错误地当成连接取消；未完成的 assistant 内容、工具活动和来源主要存在于请求内存，重新连接后无法可靠判断 Run 是否仍在执行、已经完成，或应该从哪里继续显示。实际切换会话场景还暴露了 Event 到达顺序、业务 Block 顺序、Snapshot 版本和客户端 cursor 之间不一致的问题。

**解决方式**：将一次用户提交建模为独立 `AgentRun`，创建事务同时写入 user message、assistant draft 和 queued Run，提交后由后台 `RunExecutor` 独立驱动现有 Model-led Tool Loop；SSE 只作为观察通道，不再拥有执行生命周期。PostgreSQL 保存 Run/Step、assistant draft 和完整 UI Projection Checkpoint；进程内 `ActiveRunRegistry + RunEventHub` 维护 run-scoped sequence、Live Snapshot、Checkpoint 水位后的 Event Tail、replay/snapshot fallback 和有界 subscriber 队列。协议增加 `roundId + roundSequence + blockSequence`，把传输顺序和模型 Content/Tool Block 业务顺序分开；客户端只在成功应用连续事件后推进 cursor，旧 Snapshot 不能覆盖新状态。Create、Cancel、terminal transaction 和 reconciliation 使用幂等键、状态 CAS、heartbeat 与明确的终态规则；服务重启不自动续跑，遗留 Run 收敛为 `RUN_INTERRUPTED`。

**阶段结果**：客户端断线、刷新和切换会话不会取消后台 Run；重连时可以先读取 Snapshot，再按 cursor 精确 replay Event Tail，无法连续 replay 时回退到完整 Snapshot。实时流、历史恢复和持久化消息统一使用稳定的文本/工具块顺序，终态只有在数据库提交成功后才向客户端广播。8 月 13 日又将 Round/Block 字段收紧为必填，统一服务端与前端的 Block canonical sort，并补充顺序诊断日志和流式消息局部渲染优化。阶段六把原本依附请求的 Tool Loop 变成了具备后台生命周期、连接恢复、阶段性持久化和可诊断时序不变量的 Durable Run。

**当前仍未解决**：这仍然是 Model-led Tool Loop，不包含显式 Goal/Plan/Observation/Progress/Completion Policy 等完整 Agent Loop 语义；没有服务端重启后的 Runtime 自动恢复、多实例 Worker lease、数据库 Event Log、Redis、Tool exactly-once 或跨进程接管。Event Tail 的软/绝对上限和 checkpoint 失败后的强制收敛仍属于后续 Release Hardening。Context Engineering、真实评测校准、Memory 和 Delegation 按后续阶段独立推进。

### Reasoning Context Transcript（断代升级已实施）

OpenAI-compatible Adapter 已捕获并选择性回放 DeepSeek `reasoning_content`，Runtime 使用 canonical reasoning、assistant Tool Call 和 Tool Result transcript；跨用户轮次不再从 Message 正文猜测模型上下文。普通 Conversation 不展示 raw reasoning，text 与 Tool Activity 按真实时序展示且首版不折叠；旧 reasoning event/block 仅保留协议兼容解析。

实现已落地：Model Adapter 负责供应商 reasoning 编解码和能力校验，Runtime/Repository 持久化并恢复 canonical transcript。后续用户轮次按顺序回放 reasoning + Tool Call + Tool Result 原子单元与 final answer，但不回放无 Tool Call 最终 Round 的 reasoning。Composer 通过 Public Config 提供 Flash/Pro 和 `off/low/high/max` 四档选择，模型与推理强度在 Run 创建时冻结并纳入幂等 hash。失败、取消、进程中断和未闭合 Tool Call 不进入 committed history；Session 删除级联清理 transcript。Context Engineering 仍未实施，当前上下文超限返回明确错误。详细设计见 [27-reasoning-context-transcript.md](./27-reasoning-context-transcript.md)。

本轮 review 加固了模型透传和完整性边界：ChatService 使用 Run 冻结模型，不再用默认模型覆盖用户选择；Snapshot profile 改为必填；未知模型直接拒绝；transcript 校验孤立 Tool Call 和缺失 Tool Result；前端不再兼容渲染最终回答之后的非法 reasoning/tool 顺序。旧的 `prepareSessionStream()` Message 上下文方法仍因现有历史单测保留，但实际 Run 执行链不再调用它，后续可单独删除并重写测试。

### DeepSeek V4 Model Adapter 上下文优化（已实施）

DeepSeek V4 的 Thinking + Tool Calling 上下文不是普通 OpenAI-compatible 文本历史：与 Tool Call 同轮生成的 `reasoning_content` 属于供应商原生工具协议单元，后续请求必须连同 assistant content、Tool Call 和对应 Tool Result 完整回传；但无 Tool Call 最终回答的 reasoning 不需要进入下一用户轮次。若把两类 reasoning 一律丢弃，会破坏历史工具链；若一律回放，又会把无协议价值的最终推理持续带入上下文，增加上下文占用并扩大 raw reasoning 的暴露面。

当前 `OpenAICompatibleModelAdapter` 已把差异收敛在供应商边界：流式解码 DeepSeek `reasoning_content` 并向 Runtime 输出供应商无关的 reasoning delta，由 Runtime 聚合为 canonical reasoning；请求编码时仅为包含 Tool Call 的 assistant message 恢复原生 `reasoning_content`，普通最终回答只发送 `content`。`thinking.type` 与 `reasoning_effort` 由冻结的 Run profile 映射，当前 run 选择 `off` 只关闭新 reasoning 生成，不删除历史 Tool Call 协议仍需要回放的 reasoning。Repository 也只对这类 native reasoning tool-call unit 校验 provider 与 `reasoningFormat` 兼容性，允许不依赖原生 reasoning 的普通最终回答跨模型继续使用。

这项优化同时保留三条边界：canonical transcript 完整保存模型事实，Model Adapter 独占供应商私有字段的编解码，Conversation/Workbench 不展示 raw reasoning。对应测试覆盖了 Tool Call reasoning 的选择性回放、最终 Round reasoning 的剥离、跨 provider/format 兼容拒绝、`reasoningEffort=off` 下的历史协议回放，以及 reasoning 不进入用户 SSE/内容块。详细协议与失败策略见 [27-reasoning-context-transcript.md](./27-reasoning-context-transcript.md)。

### P0 Context Engineering Evaluation（Harness 已落地，正式 Baseline 尚未冻结）

**当时的问题**：Context Engineering 后续会引入选择、裁剪、重排、摘要和证据压缩，这些操作天然有损。仅观察“回答看起来更短”无法判断是否遗漏约束、污染事实、破坏 Tool 协议或断线恢复，也无法区分模型退化、评测规则错误和 Harness 自身时序问题。供应商实际计费 Usage、本地计划阶段 Token 估算和模型官方 Context Window 还是三类不同事实源，不能用字符估算相互替代。

**解决方式**：新增真实黑盒 Context Eval，从生产 Session/Run/SSE 接口驱动固定题集和确定性 Search/Fetch/Error Fixture，并通过 Fixture Hash 阻止题集与服务端数据漂移。评测同时记录确定性规则、Judge、人工复核表、工具轨迹、恢复轨迹、供应商实际 Usage 和本地计划 Token。DeepSeek tokenizer 被封装为独立的 `@harness/deepseek-tokenizer` 包，资源随包固定并校验 SHA-256，加载使用进程级惰性 Promise/实例强缓存；API 不依赖本地 tokenizer，正式请求优先读取 DeepSeek 流式 `prompt_tokens`、`completion_tokens` 和 `prompt_cache_hit_tokens`。模型 Context Window、最大输出和权威来源则由代码内 Model Context Profile 管理，正式 Baseline 必须显式完成来源验证。

**阶段结果**：`pnpm eval -- context smoke` 已真实完成 8 个 Trial，6/8 通过、2 个 critical violation。共观察到 1,556,749 个供应商 prompt tokens、4,605 个 completion tokens、1,495,936 个 cached tokens；峰值实际 prompt tokens 为 139,441，本地计划峰值为 58,749，28 个模型 Round、13 次 Tool Call、无重复 Tool Call。报告、结构化 Summary 和人工复核 CSV 保存在 `.eval/context/2026-08-15T16-03-57-868Z/`。命令最终退出码为 1 是 critical quality gate 生效，不代表运行过程崩溃或报告未生成。

**真实暴露的问题**：

- `pollution-similar-facts` 中，模型没有按要求只输出权威代号，并在拒绝说明中复述了干扰项 `ORANGE`；这是模型行为失败。同时现有规则只检查包含/排除，后续应收紧为规范化后的精确答案。
- `connection-replay-after-start` 的回答正确，但首个订阅先收到 `run.snapshot`，没有观察到预期的 `run.started`，导致断线点没有按题意触发；这是 Create/Subscribe 时序竞争或 replay 契约需要澄清的 Harness 问题。
- Judge 8/8 返回 `incorrect`、`match` 等非结构化值，全部 schema 校验失败。当前 Trial 的 `passed` 只由确定性规则计算，Judge verdict/error 尚未进入 Summary、对比或 CLI exit；失败 Judge 调用的 Token Usage 也没有被保存，因此正式 Baseline 前必须修正 Judge 提示、解析和评分语义。
- Candidate 与 Baseline 的比较尚未校验二者是否覆盖相同的 `(taskId, trialIndex)` 集合；带 `--case`、`--capability` 或压力过滤的局部结果可能被错误地与完整 Baseline 比较。
- `DEEPSEEK_CONTEXT_WINDOW_TOKENS=131072` 与最大输出值虽然已经进入代码常量，但权威来源仍为空且 `verified=false`。安全门会主动拒绝正式 Baseline，防止用猜测值冻结基准。

**当前边界**：可以并行建设不改变模型输入行为的 Context 基础设施，例如 `ContextFragment`、`ContextSource`、Token Budget、Context Trace、Compiler 接口及 no-op/shadow mode；在上述 P0 问题修复、Full dry run、Judge 人工校准和正式 Baseline 冻结前，不启用消息删除、截断、摘要替换、证据压缩、相关性选择或上下文重排。

## 3. 已完成

### 工程与基础设施

- pnpm workspace 已建立。
- Web：React + Vite + TypeScript。
- API：NestJS，监听 `4318`。
- PostgreSQL：本机 PostgreSQL 服务，监听 `5432`。
- Prisma schema、migration、数据库 readiness 和本地用户初始化已接入。
- canonical 协议包和 agent-testkit 已建立；Chat、Function Calling、搜索结果、工具生命周期 SSE 和可恢复快照均由共享 Zod schema 约束。
- 配置校验、请求 ID 和敏感字段脱敏已接入；生产环境保留结构化 JSON 日志。
- 开发环境日志已切换为彩色中文单行格式，关闭常规 HTTP 请求/响应明细和 Nest 启动路由噪声；模型链路只记录生成开始、首字响应、完成或失败，并提供会话短 ID、模型、上下文条数、首字耗时、总耗时和输出字数。
- OpenAI 官方 SDK 和 OpenAI-compatible Chat Completions 已接入；模型 ID、Base URL、能力和请求参数由 `apps/api/src/model/model-catalog.ts` 管理，只有 `OPENAI_API_KEY` 从环境变量读取。
- DeepSeek V4 Thinking + Tool Calling 已通过 Model Adapter 做上下文特化：解码 `reasoning_content` 分片并由 Runtime 聚合，仅对历史 Tool Call 原子单元做 native replay，最终回答 reasoning 不进入下一轮请求；provider/format 兼容检查、Run reasoning profile 和用户投影隐藏边界均已落地并有单测覆盖。
- Context Evaluation Harness 已落地：真实 Session/Run/SSE 黑盒 Runner、固定 Fixture 与 Hash Gate、确定性规则、Judge/人工复核、上下文压力与 Usage 指标、独立 DeepSeek tokenizer 包及进程级强缓存均已实现；正式 Baseline 仍处于校准阶段。
- 已实现每个 assistant run 最多 20 次 Tool Call 的模型-工具循环，支持分片 arguments 聚合、参数校验、串行执行、错误回传和达到调用上限后的无工具最终回答。
- 模型调用已通过 `ModelAdapter` 与 OpenAI SDK 隔离；`AgentRuntimeService` 只依赖 canonical message、模型事件和工具契约。
- 工具层已拆为 `AgentTool`、集中式 Tool Catalog 和通用 Registry；新增工具不再需要把业务逻辑写入 Registry。
- Chat 链路已拆出 Runtime、搜索投影、assistant 交付仓库、标题服务和 SSE Writer，`ChatService` 只保留会话准备与兼容事件编排。
- 模型流、Runtime 事件流和 Chat SSE 继续使用 `AsyncGenerator` 表达逐步产出；单次数据库操作、工具执行和标题生成使用普通 `async/await`。
- 模型只看到统一 `web_search({query})`；后端通过 `SEARCH_PROVIDER=bocha|serp` 启用一个 Provider，每次返回最多 10 条标准化结果。
- 模型同时可以调用 `web_fetch({urls, query?})`，每次读取 1-5 个公开静态网页；批量结果支持逐项 `succeeded/failed/skipped` 的部分成功语义和无控制含义的单次 `stats`。
- Runtime 不创建或传递领域 run state；Tool 上下文只包含 session/message/tool-call 标识和组合取消信号。
- Search 与 Fetch 在可用时同时暴露；模型可以 Fetch 任意通过安全 Guard 的公开 URL，Projection 将来源派生为 `user_provided/search_clue/model_proposed/unknown`。
- 每个 assistant run 最多执行 20 次 Tool Call。普通模型单轮最多 120 秒，最终回答单轮最多 30 秒，Search 外层 Tool timeout 为 10 秒，Fetch 整批外层 Tool timeout 为 45 秒，Fetch 单 URL transport timeout 为 20 秒。
- `DocumentQualityGate` 在写入 LRU 和 Passage Ranking 前拒绝过短正文、登录/付费墙/验证码、JavaScript 空壳和高度重复模板；query 无相关 Passage 返回稳定错误。
- Web Fetch 使用无持久化 Crawlee `HttpCrawler`、最小 URL/DNS/逐跳重定向安全校验、5 MiB 流式响应上限、20 秒超时和一次有限重试；不携带 Cookie、Authorization、代理或用户 Header。
- HTML 通过 JSDOM、Mozilla Readability、Turndown + GFM 转换为 canonical Markdown；字符 n-gram Ranker 只返回连续抽取式原文，Locator 同时保存 quote、Unicode code-point position 和 sectionPath。
- 完整 canonical Markdown 只存在于请求生命周期和 15 分钟、32 MiB 的进程内 LRU；模型、SSE 和 Message metadata 只消费或保存整批不超过 24,000 code points 的有界 Passage。
- Bocha/Serper Adapter 已统一标题、URL、domain、摘要、发布日期和来源字段；搜索超时为 10 秒，不记录 Key 或原始响应。
- 普通对话和启用 Tools 的模型轮次都支持真实 SSE 流式输出；当前实现即时交付 Content 首字，每次模型请求创建稳定的 `roundId/roundSequence`，Adapter 为 Content 与 Tool Call 统一生成 `blockSequence`。混合 Round Content 解释为 Tool Call 前言，无 Tool Call Round Content 解释为最终正文；Projection 和前端按稳定位置更新，不按 SSE 到达顺序简单追加。
- assistant turn 的用户投影使用有序 `text/tool_activity` 内容块；raw reasoning 与用户投影分离，工具开始插入一次，完成、失败或取消按 `toolCallId` 原位更新，成功交付后将相同顺序保存到 Message metadata。
- `tool.started` 由 API 下发稳定用户可见标题；正常取消和 AbortError 都投影为独立 `tool.cancelled`，不会误标失败或遗留永久运行状态。
- Run 执行链从 durable canonical transcript 恢复模型上下文，不注入 Tool Activity 的展示文案。
- Prisma 已实现 `Session`、`Message` 及数据库级联删除；会话和消息固定归属 `local-user`。
- 已实现会话创建、列表、详情、重命名、置顶、删除、session-scoped Chat SSE 和模型标题生成 API。
- 普通对话上下文由 API 从 PostgreSQL 读取最近 20 条消息，Web 不再提交完整历史。
- 首次发送前只保留本地空白草稿；首次发送创建 Session，用户消息先落库，完整 assistant 回复结束后再落库。
- 不同 Session 可并行生成；同一 Session 由内存执行注册表限制为单流，活跃会话禁止删除。
- 用户消息、模型消息和后续报告共用 `MarkdownContent` 组件，支持 GFM、代码块、表格和安全外链。
- 根目录 `pnpm dev` 会分别启动 Web/API，等待健康检查通过后输出可点击地址。
- 新增独立 `@harness/agent-evals` workspace 包；默认串行运行 6 题 Smoke，发布前运行 24 题 Full，不进入生产 Runtime 或数据库 Schema。
- 评测通过生产 Session/Chat SSE 黑盒采集标准事件与 assistant metadata，并输出确定性硬规则、聚合指标、无联网检索权限的模型 Judge 和稳定人工抽检 CSV。
- 评测 Session 默认在结果采集后删除；支持 `--keep-sessions`、单题、跳过 Judge、自定义 API 和输出目录。

### Web 工作台

- `/agent` 已接入真实 Session Sidebar、Conversation、Composer 和 URL 恢复。
- `/agent?session=<sessionId>` 可刷新恢复；无有效参数时打开最近会话，无会话时进入未持久化空白草稿。
- Web 按 `sessionId` 保存独立消息缓存和 pending 状态，切换会话不会让后台 delta 串入当前视图。
- 首轮回复完成后异步请求模型标题；失败保留临时标题，不影响聊天交付。
- 删除会话有确认交互；删除当前、非当前和最后会话分别按约定选择恢复落点。
- Sidebar 会话项采用单行标题和按需 `…` 菜单，不展示时间或装饰图标；重命名和置顶状态可跨刷新恢复。
- 生产空状态不渲染空 Workbench。
- 生产聊天先以内联 Activity 展示工具调用；第一条 clue 或 fetched Source 到达后才自动打开 Workbench，用户手动收起后本轮不再强制打开。
- Sources 使用 `R1` 标识搜索 clue、使用 `F1` 标识已读取网页，并以 `used` 区分最终回答中出现的链接；这不等同于逐句事实支撑验证。
- fetched Source 卡片展示来源元数据、缓存状态、截断状态、可展开 Markdown 原文、sectionPath 和 code-point 区间。
- 最终 assistant metadata 保存有序内容块、工具执行与来源轻量快照；刷新、切换会话或点击历史 Tool Activity 均可恢复 Workbench。
- `/agent/preview?state=...` 仅在开发环境启用。
- Preview 已覆盖 empty、direct-answer、search running、fetch running、fetch candidate、fetch failed、waiting、steer、cancelling、cancelled、failed、sources、limited-report、final-report 等状态。
- Conversation 已移除独立 RunCard，工具调用以紧凑 Tool Activity 穿插在 assistant 文本中展示，避免同一执行状态重复投影。
- 点击内联 Tool Activity 可以打开 Workbench 并定位到对应 execution。
- Activity 已实现 execution timeline、当前调用详情、auto-follow 和手动 pinned 行为。
- Workbench 已实现 Activity、Sources、Report 统一外壳和动态 Tab；没有内容时不显示空工具 Tab。
- Composer 支持 Enter 发送、Shift+Enter 换行；提交后立即清空输入框，用户消息和流式 assistant 占位即时显示。
- Workbench、Tab、Activity detail 和内联 Tool Activity 已加入克制动画，并支持 `prefers-reduced-motion`。
- 使用现有 `lucide-react` 图标库；本地资源目录为 `apps/web/src/assets/`。
- 前端已按 `components`、`fixtures`、`model` 和 `config` 拆分 Agent feature；页面层继续集中维护 session 选择、缓存和 SSE 生命周期，避免同一状态机出现多个事实源。
- 跨前后端协议已按 `common`、`sessions` 拆分内部模块；共享限制、工具名和错误码，以及 API/Web 各自的稳定配置均已集中治理。
- 新增和重构的业务函数已补充精简中文注释；对象型常量的每个字段均单独说明用途。

## 4. 可用入口

```text
Web production:  http://127.0.0.1:4317/agent
Web preview:     http://127.0.0.1:4317/agent/preview?state=tool-running-open
API health:      http://127.0.0.1:4318/healthz
API readiness:   http://127.0.0.1:4318/readyz
PostgreSQL:      127.0.0.1:5432
```

启动前需要准备 `.env`、依赖和 PostgreSQL：

```bash
pnpm install
pnpm db -- setup
pnpm dev
```

`pnpm dev` 输出的 Web/API 地址以当前配置为准；如果 `4317` 或 `4318` 已被占用，启动脚本会直接报告冲突，不会打印误导性的成功链接。PostgreSQL 使用本机服务，不再依赖 Docker。

首次完成 `pnpm db -- setup` 后，日常开发只需运行 `pnpm dev`；PostgreSQL 由本机服务管理。

## 5. 验证记录

2026-08-16 完成 Context Evaluation Harness、DeepSeek Usage 适配、独立 tokenizer 包和根命令封装后执行：

```text
pnpm check
pnpm install --frozen-lockfile
git diff --check
pnpm eval -- context smoke
```

静态验证结果为 Tokenizer 2 项、Protocol 13 项、Agent Evals 37 项、API 73 项、Web 28 项、Testkit 1 项，共 154 项 unit test 通过；typecheck、lint、build、冻结 lockfile 安装和 whitespace 检查通过。真实 Context Smoke 完成 8 个 Trial，规则结果 6/8 通过、2 个 critical violation；Judge 8/8 schema error。该次运行成功生成完整报告后因 critical quality gate 返回退出码 1，原始结果位于 `.eval/context/2026-08-15T16-03-57-868Z/`。

最近一次 UI/工程验证已通过：

```text
pnpm check
pnpm test:integration
pnpm --filter @harness/web test:e2e
```

2026-08-14 完成 reasoning 用户投影隐藏、Tool 时序恢复和选择性回放后执行：

```text
pnpm --filter @harness/api test
pnpm --filter @harness/web test
pnpm --filter @harness/agent-protocol test
pnpm --filter @harness/api typecheck
pnpm --filter @harness/web typecheck
pnpm lint
pnpm build
pnpm test:integration
git diff --check
```

结果为 API unit 67 项、Web unit 27 项、Protocol unit 13 项和 API integration 10 项通过；类型检查、lint、build、本次变更文件 Prettier 检查和 diff whitespace 检查通过。仓库级 `pnpm format:check` 仍被 6 个本次未修改的既有文件阻塞，未为本任务改写这些无关文件。

2026-08-14 完成 Reasoning Context Transcript 断代升级、模型配置控件和 review 加固后执行：

```text
pnpm --filter @harness/api test
pnpm --filter @harness/web test
pnpm --filter @harness/agent-protocol test
pnpm --filter @harness/api typecheck
pnpm --filter @harness/web typecheck
pnpm --filter @harness/api lint
pnpm --filter @harness/web lint
pnpm test:integration
git diff --check
```

结果为 API unit 62 项、Web unit 25 项、Protocol unit 13 项和 API integration 10 项通过；类型检查、lint 和 diff whitespace 检查通过。本轮按要求未重复执行 Playwright E2E；此前一次 E2E 为 15/16 通过，唯一失败是移动端 workbench 测试 teardown 超时，与本轮 reasoning/model 控件无关。

2026-08-05 完成会话持久化、Sidebar 操作和日志治理后再次执行：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
git diff --check
```

结果为全量 lint、typecheck、unit test 和 build 通过；API integration 共 9 项通过。另使用临时 API 端口验证开发日志：启动过程仅输出一条中文就绪信息，访问 `/healthz` 不产生请求头、响应对象或 `request completed` 噪声。

2026-08-05 完成 Function Calling、联网检索和生产 Workbench 投影后再次执行：

```text
pnpm check
pnpm test:integration
git diff --check
```

结果为 workspace lint、typecheck、41 项 unit test 和 production build 全部通过，API integration 9 项通过。新增回归覆盖模型长度截断不落库、工具失败后的受限回答、重复 URL 来源合并，以及 20 次通用工具预算耗尽后的强制最终回答。另使用 Mock model/provider 验证完整工具闭环，没有在自动测试中请求真实搜索 API；使用 1440×900 和 390×844 视口检查生产 Workbench 结构与 Sources 列表，无横向溢出或内容遮挡。

2026-08-06 完成后端职责拆分、前端 feature 拆分、协议包内部拆分和常量治理。模型流式处理、Function Calling 循环、工具执行、搜索投影、持久化和 SSE 传输现在具备独立边界；本轮属于保持既有产品行为的结构重构，不新增用户可见能力。详细取舍见 `docs/22-code-refactor-plan.md`。

2026-08-07 修复 Tools 可用时模型文本被整轮缓冲的问题，并将 Conversation 升级为可恢复的有序内容块。Runtime 现在在模型吐字时立即 yield；Web 按 `blockId` 合并文本并按 `toolCallId` 原位更新 Tool Activity；成功消息持久化相同的 `text → tool_activity → text` 顺序。独立 RunCard 已从生产组件、状态类型和 Preview fixture 中删除。深度复核后又补齐了 `tool.cancelled` 全链路、异常工具终态、服务端 Activity 标题以及流式期间乐观消息 ID 到服务端 Workbench ID 的定位。

同日深度复核后执行 workspace lint、typecheck、unit test、production build、API integration 和 Playwright E2E。新增回归直接验证：Tools 可用时首个 delta 早于模型流结束、`text → tool_activity → text` 顺序、工具终态原位更新且不重复、取消与失败分离、未来工具实时/恢复标题一致，以及 assistant 仍使用乐观 ID 时能够定位服务端 Workbench。

2026-08-08 完成 Web Fetch V1 与 Evidence Candidate 管道后执行 `pnpm check`、API integration、Playwright E2E 和 `git diff --check`。共享协议、API、Web 与 testkit 共 60 项 unit test 通过，API integration 9 项通过，Playwright desktop/mobile 共 16 项通过。新增回归覆盖批量输入与部分成功、URL/DNS/重定向安全、Crawlee 无持久化抓取、正文提取、字符 n-gram、Unicode Locator、缺失父级标题时的非稀疏 sectionPath、新建草稿同步清空 session ref、来源升级后的唯一 R/F 编号、24,000 字符批次预算、LRU cache、10 URL 运行预算、Search→Fetch 来源升级、candidate 恢复和 `R/F` 标识。另用 Agent Browser 真实执行多轮 Search→Fetch→回答，并在 1440×900 与 1280×800 下检查：Candidate、刷新恢复和直接回答均符合预期，body、workspace 和 Passage 无横向溢出，浏览器控制台无遗留错误。

2026-08-10 完成 General Web Research V1 hardening 后执行 `pnpm check`、`pnpm test:integration`、`pnpm test:e2e` 和 `git diff --check`。workspace lint、typecheck、production build 全部通过；共享协议 12 项、API 44 项、Web 17 项、testkit 1 项 unit test 通过，API integration 9 项通过，Playwright desktop/mobile 16 项通过。新增回归覆盖 Runtime Policy 常量、URL 确定性规范化、Search/Fetch 稳定工具集、用户直链/Search clue 来源登记、模型自造 URL 网络前拒绝、Run Ledger 的 URL/正文去重与早停、Document Quality Gate、动态 Passage 预算、partial-success skipped、同一模型响应的后续调用静默补齐、当时实现的内部调查超时与强制最终回答，以及最终回答带追踪参数 URL 的 `used` 规范化匹配。自动验收没有请求真实外部搜索或网页 Provider。该条是历史验收记录，其中的内部调查超时已于 2026-08-11 被单轮模型超时替代。

2026-08-10 新增 General Web Research 真实评测 V1。题集版本为 `v1`，包含 Smoke 6 题和 Full 24 题；评测包 26 项 Mock 自动测试覆盖 SSE 半包、生产 API 客户端、硬规则、指标、Judge 修复、本地能力预检、workspace 根 `.env` 定位、Session 标题边界、Runner 清理/保留/异常恢复、CLI 和报告输出。本轮 `pnpm check`、评测包独立 build 和 `git diff --check` 均通过。真实外部 Smoke 需要 API、PostgreSQL、主模型和 Search Provider 就绪后单独执行；首次结果只作为人工校准基线，不作为冻结发布阈值。

同日首次真实 Smoke 已执行：6 题中硬规则 2 题通过、4 题失败，评测 Session 清理全部成功。首轮暴露的主要问题包括直链题仍先调用 Search、部分工具 execution/source 快照与 SSE 不一致、部分题超出题目工具调用上限、模型流中断，以及 Judge 请求超时。原始结果保存在 `.eval/research/2026-08-10T12-09-47-750Z/`。评测报告已补充逐题问题、Agent 最终回答、失败规则、工具摘要、来源摘要和 Judge 信息；下一轮继续观察真实链路后再决定哪些属于 Agent 行为缺陷、哪些属于评测规则需要校准。

2026-08-11 完成 Agent 运行边界和 Runtime 工具中立化重构。删除会误伤正常长任务的 120 秒 Agent 总截止时间，改为普通模型单轮 120 秒、最终回答单轮 30 秒以及 Search/Fetch 各自 10/20 秒的故障隔离；保留 20 次通用工具调用、25 个 URL、60,000 Passage 字符和连续两次无新增内容等结构性边界。强制最终回答不再发送任何工具定义，服务端完整缓冲并拒绝 DSML 或结构化工具调用污染，最多重试一次；污染内容不会进入 SSE、数据库或后续上下文。

同次重构将 URL provenance、URL/正文去重、Web 资源预算和无新增内容状态从 Runtime 下沉到 `WebResearchRunState`，Runtime 只创建通用 `ToolRunState`，按统一契约执行任意命名工具并处理 `logFields`、`disableTools` 和 `forceFinalAnswer`。上游调用失败日志继续保留脱敏后的真实原因、HTTP 状态、请求 ID、上游地址和响应摘要。执行 `pnpm check` 与 `git diff --check` 全部通过：Protocol 12 项、API 56 项、Web 18 项、Evals 26 项、Testkit 1 项 unit test 通过，workspace lint、typecheck 和 production build 全部通过。本轮没有重复执行依赖数据库或浏览器环境的 integration/E2E。

2026-08-12 完成 Connection-Durable Agent Loop 第一版实施与当时验收。新增 `AgentRun/AgentRunStep`、Run 幂等键和 active Session partial unique index；创建、后台执行、draft flush、语义 Step、terminal transaction、heartbeat/restart reconciliation、独立 cancel 和优雅停机收敛全部接入。新增 Run Event Hub 的 run-scoped sequence、Ring Buffer、snapshot fallback、多 subscriber、有界队列和 terminal close；Web 首次提交、刷新、切换会话、断网重连统一走 `createRun -> observeRun`，并保留失败/取消草稿终态。当时验证结果为 Protocol 13、API unit 58、API integration 10、Web unit 19、Agent evals 28、Playwright E2E 16 全部通过；workspace lint、typecheck、production build 和 `git diff --check` 全部通过。后续真实切会话场景暴露并确认了 Model Round/Block 排序、Snapshot/sequence、cursor 和状态竞争问题，因此该记录只表示第一版基线验收，不表示时序加固已经完成。当前仍明确不实现服务端重启自动续跑、多实例 Worker lease、数据库 Event Log、Redis、逐 token 持久化和 Context Engineering。

2026-08-12 完成 Connection-Durable Agent Loop 时序加固与真实黑盒验收。协议升级到 `0.9.0`，为文本和工具事件增加 `roundId + roundSequence + blockSequence`；Adapter 按 Provider 全局 index 或 Block 首次出现顺序建立 Ordered Model Rounds，普通 Tool Round 的 Content 首字继续即时交付，Projection 按稳定位置创建或原位更新 Block。Active Run 统一维护同版本 `liveProjection/liveSequence`、不可变版本化 Checkpoint 和 Checkpoint 水位后的 Event Tail；Checkpoint 串行写入并仅在成功后清理已覆盖 Event，Latest Live Snapshot、连续 Tail replay 与实时流得到相同 `blocks[]`。SSE 订阅消除 replay/live 空窗，Web 只在成功应用连续 Event 后推进 cursor，并拒绝旧 Session Detail、Snapshot 或异步 HTTP 结果覆盖新状态。terminal Event 改为数据库 CAS/checkpoint 成功后再广播，queued cancel、cancel/complete 竞争和 reconciliation owner 条件均按不可逆状态机收敛。

同轮真实 `agent-browser` 黑盒测试覆盖长任务的多次 Search/Fetch、生成中切换并切回 Session、浏览器离线重连、active Run 刷新恢复、不同 Session 并行 Run、取消隔离、双击提交去重、Pixel 7 移动布局和三轮上下文对话。DOM 稳定保持“Round 前言文本 -> Tools -> 下一轮文本 -> 最终正文”；刷新后恢复 3 条 user、3 条 assistant 以及全部 Tool Block，控制台无错误。测试还发现“新建 Session 后立即提交”时 React state 与 `selectedSessionIdRef` 可能被旧 Effect 写回的独立竞争，现已用同步 setter 同时更新 state/ref 并增加回归测试。核心 Durable Loop 文件已补充中文设计意图与不变量注释。最终执行 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:integration`、`pnpm test:e2e` 和 `git diff --check` 全部通过：Protocol 13、API unit 59、Web unit 21、Agent Evals 28、Testkit 1、API integration 10、Playwright desktop/mobile 16 项成功。当前目标仍是 API 进程存活期间的 Connection Durable，不新增 Prisma migration、数据库 Event Log、Redis、Worker lease、Runtime resume 或 Tool exactly-once。

2026-08-11 随后完成 Model-led Tool Boundary 代码迁移，协议升级到 `0.8.0`。删除 `ToolRunState`、`WebResearchRunState`、Tool `modelContent/control`、跨调用 URL/Passage 预算、URL allowlist 和领域早停；Runtime 统一序列化 canonical `output/error`，Tool 失败可由模型下一轮继续处理。Search/Fetch 外层 timeout 分别为 10/45 秒，Fetch transport timeout 保持 20 秒；Projection 派生 provenance，Execution 完整保留，Source 按 URL/contentHash 归并。后续验收补齐混合 Tool Call 计数、实时/恢复 canonical merge、Fetch stats 全分支与真实 retry 计数、Eval provenance/canonical/toolCallCount 反向规则；评测使用 `modelProposedSourceCount` 表示最终保留的模型直提 canonical 来源数量，避免与 Fetch 调用次数混淆。最终执行 `pnpm check`、API integration、Playwright E2E 和 `git diff --check`：Protocol 12 项、API 52 项、Web 19 项、Evals 28 项、Testkit 1 项，共 112 项 unit test，API integration 9 项和 Playwright desktop/mobile 16 项全部通过。真实外部 `pnpm eval:research` 未执行，避免在未明确要求时产生模型和搜索 Provider 调用费用。

覆盖范围包括：

- Web lint、TypeScript typecheck、unit tests、production build。
- API health/readiness 和 capability boundary integration tests。
- Session CRUD、置顶排序、重命名、详情恢复、local-user 归属、级联删除、并发冲突、活跃删除和标题 fallback。
- 开发/生产日志配置分支、HTTP 自动访问日志关闭，以及模型生成关键耗时日志。
- Web 首次发送绑定真实 Session、session-scoped SSE、URL 刷新恢复和持久化 Markdown 消息。
- Function Calling 直接回答、搜索执行、工具错误与快照持久化；Bocha/Serper 请求和结果归一化使用 Mock 验证。
- Web 工具生命周期 SSE、实时 Sources 投影和 assistant metadata 恢复。
- Playwright desktop/mobile E2E。
- production 空状态无空 Workbench。
- running / Sources / Report / waiting / failed / cancel fixture。
- Conversation 内联 Tool Activity 到 Workbench 的定位、状态切换和 1280px 布局。

## 6. 当前未完成

以下内容仍按 `docs/17-implementation-plan.md` 和相关契约文档执行，不能从 Preview 状态推断已经完成：

- Artifact 持久化和正式 Report 恢复；Session/Message/Run/Step 和 assistant draft snapshot 已完成。
- 服务端重启后继续原 Run、多实例 Worker lease、Provider cursor 和 Tool 副作用幂等；当前重启遗留 Run 收敛为 `RUN_INTERRUPTED`。
- 搜索 fallback；正式 Evidence、引用校验和 Markdown Report Artifact 不属于当前范围，是否进入后续 Deep Research 由未来产品需求决定。
- steer、pause 和 Human-in-the-loop 尚未实现；独立 cancel、Run SSE、sequence/replay 和 snapshot fallback 已完成。
- user Memory、Delegation、Worker 和多用户认证。
- Context Evaluation 正式 Baseline 尚未冻结：需要修复 Judge schema/评分接入、connection replay 断线点、污染题精确规则和 Candidate/Baseline 题集对齐校验，并为 Model Context Profile 填写供应商权威来源后显式标记 verified。

### General Web Research V1 完成边界

当前 `web_search -> web_fetch -> 相关原文 Passage -> 普通回答` 已按本阶段边界完成：

以下勾选项描述当前代码已经实现的 V1 与 Model-led 行为：

- [x] 单次 Fetch 的等价 URL 去重、`succeeded/failed/skipped` 部分成功和无控制语义的 `stats`。
- [x] Search/Fetch 保持稳定工具集；Fetch 接受任意通过 Guard 的公开 URL，provenance 不参与权限判断。
- [x] Execution 完整保留；Projection 按 input/final/normalized URL 或 contentHash 归并 canonical source，并聚合 toolCallIds。
- [x] Document Quality Gate、query 无关正文错误和单批 24,000 code-point Passage 输出上限。
- [x] 跨调用重试、换源和停止由模型决定；Runtime 和 Tool 不维护 Web Research 规划状态。
- [x] `clue/fetched + used` 来源协议、确定性 URL 匹配、已读来源优先 fallback 和 Workbench 恢复。
- [x] 用户直链 Fetch Prompt、普通模型单轮 120 秒超时、最终回答单轮 30 秒超时和用户 Abort 分离；Agent run 无总截止时间。
- [x] Workbench 展示本次成功/失败/跳过、网络请求、相关 Passage 和采用/已读/线索数量。
- [x] 通用 Agent 固定题集、真实 API 黑盒 Runner、指标聚合、模型 Judge 和人工抽检文件已实现；真实基线运行与两轮人工阈值校准仍待执行。
- [ ] 公网/多用户部署前的连接 IP pinning、网络出口隔离和完整 DNS rebinding 防护仍属后续安全加固。
- [x] Model-led Tool Boundary：已删除 Tool 控制意图、`modelContent`、Web 跨调用规划状态和 URL allowlist；Runtime 统一序列化 `output/error`，保留 20 次 Tool Call、Tool 外层超时及 Fetch 能力安全，由 Projection 派生 provenance 和 canonical source。

Model-led 迁移的完成标准已经满足：对需要联网的普通用户问题，Agent 能自主找到并读取公开静态网页，由模型根据 Tool Result 决定继续、换源或回答；Tool 失败不会自动终止 Runtime，达到 20 次 Tool Call 后能够基于已有材料平稳收尾。Fetch 继续过滤非法、无效和低质量内容，Execution 完整保留，Workbench 的重复来源由 Projection 归并。

### Runtime 工具名称中立化（历史步骤，Model-led 迁移已完成）

`AgentRuntimeService` 已移除对 Search/Fetch 名称、Web URL 解析、领域资源账本和专属指标字段的依赖。Runtime 不再创建 `ToolRunState`，只传递关联标识和取消信号；Tool 不能通过控制字段改变主循环。

历史架构复核确认“工具名称中立”不等于“决策权中立”。本次迁移已经删除 `forceFinalAnswer`、`WebResearchRunState` 等契约和状态，让模型负责语义决策，Runtime 只维护通用执行状态与边界，Tool 只返回结构化结果，Projection 派生来源事实。

### 后续阶段边界

- 完整 Context Engineering 面向 System Prompt、历史消息、用户输入、Assistant Tool Calls、Tool Results 和最终回答预留统一实现 Token 计量、选择、压缩、淘汰和编译；当前不预先冻结具体 schema。
- Connection-Durable Agent Loop 已按独立方案完成后台执行和客户端断线恢复；Delegation 再实现 Worker 独立上下文和大规模 Wide Research。这些能力都不属于当前 Web Fetch 模块本身。
- 正式 `EvidenceSource`、report-scoped `[Sx]`、Report Artifact、同模型复核和 Citation Validator 不阻塞当前阶段，也不在本次架构中承诺实现。
- JavaScript Browser Fetch、PDF、登录态网页、页面操作和其他来源格式属于独立的工具能力扩展，不并入当前阶段。

## 7. 下一阶段建议

当前已完成 P8 Connection-Durable Agent Loop 和 P0 Context Evaluation Harness，下一阶段按以下顺序推进：

1. **先完成评测 P0**：修复 replay Case、Judge schema 与评分语义、污染题精确断言和 Candidate/Baseline 题集对齐；填写并验证 Model Context Profile 的供应商权威来源。
2. **冻结正式 Baseline**：运行 Full dry run，根据 `human-review.csv` 校准 Judge，再用完整固定题集生成正式 Baseline；任何过滤后的局部运行不得冒充完整基准。
3. **并行建设 Context 基础层**：基于完整 canonical transcript 实现 Fragment/Source、Token Budget、Trace 和 Compiler no-op/shadow mode，只观测编译决策，不改变实际模型输入。
4. **基于基准逐项启用策略**：Baseline 冻结后再分别实验选择、压缩、淘汰、摘要和最终回答预留，每次用相同 Trial 集合判断质量、成本和延迟变化。
5. **保持能力边界**：服务端重启自动续跑、Evidence/Citation、Report Artifact、Browser/PDF Fetch、Memory 和 Delegation 不与 Context Engineering 混成一次大重构。

后续还需独立讨论 Agent Loop Semantics，包括 Goal/Task State、可选 Plan/Todo、动态修订、结构化 Observation、Progress、Completion Policy、Ask User/Clarification 和 Reflect/Re-plan。当前仅在实施计划中留档，未立项、未冻结接口，也不进入本轮 Context Engineering，避免把当前 Model-led Tool Loop 误描述为已经具备完整任务规划与完成判定。

P8 的完成标准不是“再增加一个工具”，而是现有 `Chat -> Agent Loop -> Search/Fetch -> Final Answer -> Persistence/Recovery` 链路具备一致事实、可诊断失败、可重复评测和最小恢复能力。

### 评测报告 TODO

- [x] `summary.md` 展示总体指标和每题状态。
- [x] `review.md` 展示每题问题、Agent 最终回答、失败规则、工具执行、来源摘要和 Judge 结果。
- [x] `human-review.csv` 保留人工评分字段，同时带上自动诊断上下文。
- [ ] 将 Judge 超时、Agent 流中断和工具快照不一致拆成可聚合的失败分类。
- [ ] 为直链题、搜索题和 Fetch 题分别校准硬规则，避免单一规则把行为问题和协议投影问题混在一起。
- [ ] 根据至少两轮真实 Smoke 结果冻结语义质量阈值，再决定 Full suite 是否进入发布门槛。
- [x] Context Eval 已记录供应商真实 Usage、本地 planned tokens、压力档位、规则/Judge 结果、Run/Tool/恢复轨迹和人工复核 CSV。
- [ ] 修复 Context Judge 结构化输出；明确 Judge 是评分门槛还是独立诊断信号，并保存失败调用的可用 Usage。
- [ ] 修复 `connection-replay-after-start` 的 create/subscribe 竞争或调整契约，使断线恢复 Case 能在确定位置触发。
- [ ] 将污染题收紧为规范化精确答案，并在 Baseline 比较前校验 Candidate/Baseline 的 `(taskId, trialIndex)` 集合完全一致。
- [ ] 填写 Model Context Profile 权威来源并显式 verified，完成 Full dry run、人工校准和正式 Baseline 冻结。

Connection-Durable Agent Loop 与 Reasoning Context Transcript 已落地，当前进入 Context Engineering、真实评测校准与 Release Hardening。服务端重启自动续跑、Worker 独立上下文、动态 Browser Fetch、PDF 和正式 Evidence/Report 等能力按真实需求独立推进。

## 8. 关联文档

- 产品与范围：[docs/00-agent-core-roadmap.md](./00-agent-core-roadmap.md)
- 实施阶段：[docs/17-implementation-plan.md](./17-implementation-plan.md)
- Reasoning 与完整上下文：[docs/27-reasoning-context-transcript.md](./27-reasoning-context-transcript.md)
- 前端契约：[docs/19-agent-frontend.md](./19-agent-frontend.md)
- Workbench 契约：[docs/20-agent-workbench.md](./20-agent-workbench.md)
- API 协议：[docs/11-api-protocol.md](./11-api-protocol.md)
- 工程结构：[docs/18-project-structure.md](./18-project-structure.md)
- 面试知识点：[docs/interview-knowledge.md](./interview-knowledge.md)
- Web Fetch 设计：[docs/23-web-fetch-tool.md](./23-web-fetch-tool.md)
- 真实评测：[docs/24-general-web-research-evaluation.md](./24-general-web-research-evaluation.md)
- Connection-Durable Agent Loop：[docs/26-connection-durable-agent-loop.md](./26-connection-durable-agent-loop.md)

## 9. 维护规则

- 每完成一个可验证的阶段或跨模块切片，更新本文件的“当前结论”“已完成”“验证记录”和“下一阶段建议”。
- 设计变更写入对应契约文档，不在本文件复制完整规范。
- 所有状态必须区分 production capability、development-only fixture 和 planned capability。
- 每次更新保留日期，并记录实际执行过的验证命令。
