# Research Workflow / 首发产品契约

> 文档状态：Greenfield R1 产品规范。本文定义首个真实用户版本必须完成的网络调研工作流。

## 1. 目标

用户在 durable session 中提出调研目标，Agent 在 3-5 分钟内完成标准深度研究并交付一份可追溯的 Markdown 报告。

```text
Input
  -> clarify only if blocking
  -> plan queries
  -> search primary/fallback provider
  -> fetch selected source content
  -> separate clues from eligible evidence
  -> iterate 3-6 queries
  -> select 5-10 effective sources when available
  -> draft report
  -> same-model review
  -> revise
  -> deterministic citation validation
  -> deliver report or limited report
```

## 2. 非目标

R1 不实现：

- browser automation 和任意页面交互
- JavaScript Browser Rendering、登录态网页和需要用户凭据的内容获取
- 外部 Deep Research API 代写结论
- 用户上传文件调研
- 代码执行
- user Memory
- Delegation / Worker
- 多用户认证

## 3. 输入与澄清

Agent 默认立即执行。只有以下歧义会显著改变结果时才允许 `ask_clarification`：

- 研究对象无法唯一确定
- 时间范围会改变结论
- 地域范围会改变结论
- 交付目标相互冲突

非阻塞性缺省值由 Agent 保守决定，并在报告的“范围与限制”中披露。

澄清规则：

- 一次只问一个阻塞问题。
- waiting 期间不消耗搜索调用预算。
- 用户回复后创建下一 step，不修改已提交 State facts。

## 4. Research Budget

```ts
type ResearchBudget = {
  targetDurationMs: 180_000 | 300_000;
  maxSearchQueries: 6;
  targetEligibleSources: { min: 5; max: 10 };
  maxProviderCalls: number;
  maxModelSteps: number;
  maxInputTokens: number;
  maxOutputTokens: number;
};
```

预算是硬上限，不由模型扩大。少于 5 个来源不自动失败；证据质量优先于来源数量。

## 5. 搜索供应商

搜索通过统一工具 `web_search` 暴露给模型。Bocha、SERP 等供应商由部署配置注册为 adapter。需要原文依据时，模型对选中的公开 URL 调用 `web_fetch`；完整 Fetch 契约见 `23-web-fetch-tool.md`。

```ts
type SearchProviderConfig = {
  id: string;
  role: 'primary' | 'fallback';
  enabled: boolean;
  baseUrl?: string;
  apiKeyEnv: string;
  timeoutMs: number;
  resultLimit: number;
};
```

路由规则：

1. 每次查询先调用 primary。
2. primary 失败、限流或 eligible result 不足时才调用 fallback。
3. fallback 原因必须写入 ToolTrace。
4. 模型只看到统一结果，不看到凭据或供应商路由控制。
5. provider call 数计入预算。

### 5.1 外部发送授权

部署者配置模型或搜索供应商 API Key，即视为同意应用在执行所有任务时，将完成当前任务所需的用户输入、搜索 query、上下文和证据材料发送给对应外部供应商。R1 不提供逐任务确认弹窗或 allowlist；未配置相应 Key 的 provider 不可调用。

该授权不允许发送 API Key、其他环境变量、内部凭据或与当前任务无关的历史数据。实际调用仍须记录 external data transfer trace，并遵守 Context Compiler 的范围裁剪。

## 6. 搜索结果分级

```ts
type SearchResult = {
  resultId: string;
  provider: string;
  query: string;
  title: string;
  url: string;
  snippet?: string;
  content?: string;
  passages?: SearchPassage[];
  publishedAt?: string;
  retrievedAt: string;
};

type SearchPassage = {
  passageId: string;
  text: string;
  locator?: {
    kind: 'provider_offset' | 'section' | 'page' | 'unknown';
    value?: string;
  };
};
```

分级规则：

```text
title + URL + snippet only
  -> clue
  -> 可以帮助规划下一次查询
  -> 不得生成正式 evidence/display ID

provider content or web_fetch locatable passage
  -> evidence candidate
  -> 经过选择后生成稳定 evidenceId 和 report-scoped displayId
  -> 可以支撑正式引用
```

不得把模型常识、搜索摘要或 URL 本身包装成已验证证据。

## 7. 不可信内容边界

所有供应商内容都属于 untrusted evidence data：

- 与 system instruction、user instruction 和 runtime guidance 分区。
- 网页中的命令、角色声明、工具要求和 prompt injection 文本不得执行。
- 外部内容不能修改预算、toolset、引用规则或终止条件。
- API Key、环境变量和内部 prompt 不进入 evidence block。

Context Compiler 必须保留来源边界，不能把证据文本拼成无标记的 system message。

## 8. Durable Evidence

只有实际用于报告的原文片段持久化为正式证据：

```ts
type EvidenceSource = {
  evidenceId: string; // 内部稳定 ID
  displayId: string; // 当前 report/run 内的 S1, S2 ...
  sessionId: string;
  runId: string;
  userId: string;
  title: string;
  url: string;
  provider: string;
  retrievedAt: string;
  passage: string;
  locator?: SearchPassage['locator'];
  artifactRef?: StateRef;
  status: 'eligible' | 'invalidated';
};
```

未引用的完整供应商响应只按短期 retention 保存，不进入长期 State 或 user Memory。

`web_fetch` 的完整正文同样只短期保留；模型上下文默认消费有界的抽取式 passage，实际被报告引用的 passage 才复制为 durable EvidenceSource。模型生成的网页摘要不能替代原文 passage。

## 9. 迭代研究

Agent 可以根据 clues 和 evidence gaps 发起下一查询。每次查询必须说明：

- 当前要填补的 gap
- 与已执行查询的差异
- 预期寻找的证据类型

禁止：

- 仅改写同一关键词反复搜索
- 为凑足来源数量引入低相关结果
- 在达到预算后继续调用 provider
- 把同一原始来源的重复聚合页计作多个独立证据

## 10. Steer 与 Cancel

`steer` 是运行中追加的用户指导：

- 写入 durable event。
- 不改写正在执行的 provider call 或 model action。
- 从下一安全 step 注入 CompiledStepContext。
- 已完成的搜索事实保留。
- 默认不重置预算。

`cancel`：

- 阻止新的 model/provider call。
- 尝试取消当前可取消调用。
- 保存已完成事实和 partial artifact。
- run 进入 `cancelled`。

## 11. 报告结构

R1 报告至少包含：

```text
# 标题
## 执行摘要
## 范围与方法
## 关键发现
## 分析
## 限制与证据缺口
## 来源
```

事实性结论、数字、比较和外部判断后必须出现一个或多个内联引用：

```markdown
某项指标在研究期间出现增长。[S1][S3]
```

来源列表展示标题、URL、provider 和 retrieved time。界面可打开对应 evidence passage。

## 12. Draft / Review / Revise

首次生成的是 `report_draft`，不能直接 final。

同模型 review 必须使用独立 step，并检查：

- 用户问题是否覆盖
- 结论是否超过证据
- 是否把 clue 当 evidence
- 重要事实是否缺引用
- 引用 source 是否存在
- 是否存在相互冲突的证据
- 是否明确披露范围和限制

review 输出结构化 `ReportReview`，随后模型生成 revised report。

```ts
type ReportReview = {
  coverageGaps: string[];
  unsupportedClaims: string[];
  citationGaps: string[];
  conflicts: string[];
  requiredRevisions: string[];
};
```

## 13. Deterministic Citation Validator

Validator 不调用模型，至少校验：

1. 每个 `[Sx]` 都通过 `displayId` 映射到当前 run 可读的 EvidenceSource。
2. EvidenceSource 状态为 `eligible`。
3. EvidenceSource 包含非空 passage、URL、provider 和 retrievedAt。
4. 来源列表与内联引用映射一致。
5. 报告不得引用 clue-only result。
6. Artifact 内容 hash 与通过验证的 revision 一致。

Validator 不尝试确定性判断自然语言蕴含关系；语义支持度由 review step 和评测集检查。

## 14. 完成语义

```ts
type ReportQuality = 'standard' | 'limited';
```

`completed + standard`：

- 有足够证据回答主要问题。
- citation validation 通过。
- review 没有未处理的 blocking revision。

`completed + limited`：

- 至少存在一条可靠 evidence source。
- 可以交付部分有价值结论。
- 报告显式标记缺口和未确认结论。
- citation validation 通过。

`failed`：

- 完全没有 eligible evidence；或
- citation validation 在有界修复后仍失败；或
- 模型/provider 错误导致无法形成可验证报告。

`limited` 是交付物质量，不新增 run terminal status；run 仍为 `completed`。

## 15. Workbench 投影

R1 只展示真实能力：

```text
Conversation   用户输入、澄清、steer、最终交付说明
Progress       Planning / Searching / Reviewing / Validating / Completed
Sources        clues、eligible sources、引用片段
Report         draft/review 状态和最终 Markdown Artifact
Activity       用户可理解的 provider/model/logical tool execution
Debug          raw events/state，仅开发模式
```

不展示 Browser、Terminal、Memory 或 Worker 空 tab。

Conversation 中的内联 Tool Activity 使用 `runId/stepId/toolCallId` 打开 Workbench 并定位对应 Activity execution。Provider attempts 在普通 Activity 中聚合，只有 Debug 可以展示脱敏 trace。

## 16. 评测门槛

固定中文调研题集至少覆盖：

- 时效性问题
- 多对象比较
- 地域限定
- 证据不足
- primary provider failure / fallback
- clue-only result
- steer
- cancel
- citation validator failure
- limited report

硬失败条件：

- 不存在的 displayId
- clue 冒充 evidence
- 零证据却 completed
- provider/API Key 泄露到日志或 Artifact
- 外部内容改变系统指令

发布需要 contract/integration/UI 测试通过，并完成人工报告质量抽检。
