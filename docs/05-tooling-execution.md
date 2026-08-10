# Tooling / Execution

> 文档状态：Greenfield R1 工具执行契约。当前 production 已实现 `web_search` 和 `web_fetch`。

## 1. 职责

Tooling 负责：

- tool registration/discovery
- current-step toolset
- input validation
- permission/effect metadata
- execution/timeout/cancel
- provider routing
- raw result normalization
- execution facts and traces

Tooling 不负责：

- 研究结论
- evidence selection
- `evidenceId/displayId` allocation
- report draft/review
- task completion decision
- Memory write

## 2. R1 Toolset

```text
web_search
web_fetch
```

`web_search` 是搜索 logical tool，内部可以路由到 Bocha、SERP 等 provider adapter。`web_fetch` 每次获取 1-5 个公开 URL，并产出可定位的原文片段。Provider 和 Fetch 实现不是模型可见工具。

R1 不接 MCP、不接 browser automation、不接文件写工具或代码执行。

### 2.1 当前生产内部契约

当前 `AgentRuntimeService` 不理解上述具体工具名称。每次 run 创建一个通用、进程内的 `ToolRunState`，并通过统一上下文传给所有工具：

```ts
type ToolExecutionContext = {
  sessionId?: string;
  messageId?: string;
  toolCallId: string;
  signal?: AbortSignal;
  latestUserContent: string;
  runState: ToolRunState;
};
```

工具领域通过类型化 key 使用 `runState.getOrCreate()` 延迟创建自己的状态。相同 key 在同一次 run 内共享实例，不同 run 和不同 key 相互隔离；Runtime 不读取、持久化或解释其中的领域数据。当前 Web Research 使用 `WebResearchRunState` 在 Search 与 Fetch 之间共享 URL provenance、URL/正文去重、URL/Passage 预算和连续无新增内容状态。

工具结果通过 `logFields` 声明需要进入服务端日志的领域指标，通过 `control.disableTools` 或 `control.forceFinalAnswer` 声明通用控制意图。Runtime 只按契约记录或执行，不从工具名称和结果字段推断业务含义。新增工具只需要实现 `AgentTool` 并加入 Catalog，不应修改 Runtime 的业务分支。

## 3. Tool Definition

```ts
type ToolDefinition = {
  name: string;
  version: string;
  description: string;
  inputSchema: unknown;
  effect: 'read_only' | 'write' | 'external_side_effect';
  allowedScopes: Array<'lead' | 'worker'>;
  timeoutMs: number;
  maxConcurrency: number;
};
```

R1 `web_search` 和 `web_fetch` 的 effect 都是 `read_only`，但它们仍会向外部服务发送 query 或 URL，必须在 trace 中表达 external data transfer。配置对应 provider API Key 即构成部署级发送授权，任务调用不再逐次询问；调用内容仍限于当前任务所需数据，credential 永不进入请求 payload、模型上下文、State 或日志。

## 4. web_search Input

```ts
type WebSearchInput = {
  query: string;
  reason: string;
  expectedEvidence: string;
  locale?: string;
  timeRange?: {
    from?: string;
    to?: string;
  };
  resultLimit?: number;
};
```

校验：

- query 非空且长度受限。
- reason 必须对应当前 research gap。
- resultLimit 不能超过部署配置。
- 模型不能指定 provider、baseURL、API Key 或 fallback policy。

## 5. Provider Adapter

```ts
interface SearchProvider {
  readonly id: string;
  search(input: ProviderSearchInput, signal: AbortSignal): Promise<ProviderSearchResponse>;
}
```

Adapter 负责把厂商请求/响应隔离在 Tooling 内。Canonical result 不暴露 provider-specific secret 或不可序列化 SDK object。

## 6. Primary / Fallback Router

```text
logical web_search
-> call primary
-> normalize and inspect availability
-> success with sufficient candidate material: return
-> error / rate limit / insufficient candidate material: call fallback
-> merge/deduplicate
-> return one ToolExecutionResult
```

Fallback 条件由确定性配置和 normalizer signal 决定，不由模型直接选择。

每次 provider attempt：

- 计入 provider call budget
- 有独立 timeout/latency/error trace
- 不产生多个用户可见 tool calls

## 7. Canonical SearchResult

```ts
type SearchResult = {
  resultId: string;
  provider: string;
  query: string;
  title: string;
  url: string;
  normalizedUrl?: string;
  snippet?: string;
  content?: string;
  passages?: Array<{
    passageId: string;
    text: string;
    locator?: EvidenceLocator;
  }>;
  publishedAt?: string;
  retrievedAt: string;
  kind: 'clue' | 'evidence_candidate';
};
```

Normalizer 只做结构、编码、URL、大小和资格材料检查，不总结业务含义。

## 8. Clue / Evidence Candidate

```text
title/url/snippet only
  -> clue

provider content or non-empty locatable passage
  -> evidence_candidate
```

Tooling 可以确定材料是否满足形式资格，但不决定它是否与报告结论相关。Evidence selector 后续选择实际 cited passage。

`web_fetch` 的模型可见输入固定为：

```ts
type WebFetchInput = {
  urls: string[];
  query?: string;
};
```

`urls` 固定为 1-5 个公开地址，`query` 为整批来源共用的证据需求。V1 使用 Crawlee `HttpCrawler` 获取原始响应，JSDOM + Mozilla Readability 提取主要正文，Turndown 生成 Markdown；`WebResearchRunState` 只允许 Fetch 用户当前消息中的 HTTP/HTTPS 直链或本轮 Search 登记的 clue URL。完整契约见 `23-web-fetch-tool.md`。

## 9. Untrusted Content

Provider content 必须：

- 标记 source/provider/resultId。
- 进入 untrusted evidence payload。
- 与 system/user instructions 分离。
- 按字符/token/结果数量裁剪。
- 移除不可见控制字符和危险 metadata。

Tooling 不把网页文本解释为命令。

## 10. Tool Call Protocol

```ts
type ToolCallBase = {
  toolCallId: string;
  runId: string;
  stepId: string;
  toolVersion: string;
  budget: {
    timeoutMs: number;
    remainingProviderCalls: number;
  };
};

type ToolCallRequest =
  | (ToolCallBase & {
      toolName: 'web_search';
      input: WebSearchInput;
    })
  | (ToolCallBase & {
      toolName: 'web_fetch';
      input: WebFetchInput;
    });
```

## 11. ToolExecutionResult

```ts
type ToolExecutionResult<TOutput> =
  | {
      status: 'succeeded';
      output: TOutput;
      modelContent: string;
      logFields?: Readonly<Record<string, string | number | boolean>>;
      control?: { disableTools?: string[]; forceFinalAnswer?: boolean };
    }
  | {
      status: 'failed' | 'timeout' | 'cancelled';
      error: {
        code: string;
        detail: string;
        retryable: boolean;
        cause?: unknown;
      };
      modelContent: string;
      logFields?: Readonly<Record<string, string | number | boolean>>;
      control?: { disableTools?: string[]; forceFinalAnswer?: boolean };
    };
```

`web_search` 和 `web_fetch` 使用同一 execution envelope，但分别返回自己的 canonical output。`modelContent` 是回传给下一模型轮次的有界工具观察；错误 `cause` 只用于脱敏服务端诊断，不进入模型上下文、SSE 或数据库。工具通过通用 `logFields` 声明领域指标，Runtime 只按声明顺序输出 `key=value`，不解释搜索或读取专用字段。

`forceFinalAnswer` 只请求 Runtime 结束工具阶段。最终回答轮完全省略工具定义，并在服务端缓冲校验后交付；工具本身不生成最终研究结论。`disableTools` 作为通用能力保留，Web Research 的资源停止当前只使用 `forceFinalAnswer`。

## 12. Tool Result / Observation

```text
ToolExecutionResult
-> raw/large content externalization
-> tool_result StateRecord
-> deterministic ToolObservationBuilder
-> tool_observation StateRecord
-> next CompiledStepContext
```

Observation 可以说明查询、provider/fallback、clue/candidate 数量和 refs，但不能声称研究问题已经解决。

## 13. Storage

- Tool call metadata 存 PostgreSQL。
- Normalized search result metadata 存 PostgreSQL。
- 未引用大 content 使用 short-lived Artifact。
- 实际引用 passage 由 Evidence Layer 复制为 durable EvidenceSource。
- API Key 不落库、不进 State、不进 trace。

## 14. Budget

Tooling 强制执行：

- max search queries
- max provider calls
- max results/query
- provider timeout
- max normalized payload bytes
- max parallel tool calls

模型不能扩大预算。Fallback 计入 provider calls。

当前生产实现按所有权分层：Runtime 只维护最多 20 次通用工具调用；Web Research 维护每轮 25 个唯一 URL、60,000 个外部 Passage 字符和连续两次无新增内容早停；Search 和 Fetch 分别维护 10 秒、20 秒单操作超时。Agent run 不设置 wall-clock 总截止时间，用户取消独立传播到模型和在途工具。

## 15. Retry

Provider adapter 只按配置执行有限 transport retry。Logical tool retry 必须由 Runtime/Agent next action 决定，并受去重和总预算限制。

禁止：

- 无限重试
- 用 fallback 绕过预算
- 对 validation error 重试 provider
- 模型直接指定 retry count

## 16. Cancel

Cancel signal 通过 AbortSignal 传递给 active provider call。即使 SDK 不支持取消，也必须阻止结果触发新 step，并在调用返回后丢弃/记录 late result policy。

## 17. Error Taxonomy

```text
TOOL_INPUT_INVALID
TOOL_NOT_AVAILABLE
SEARCH_PROVIDER_UNAVAILABLE
SEARCH_PROVIDER_RATE_LIMITED
SEARCH_PROVIDER_TIMEOUT
SEARCH_RESPONSE_INVALID
SEARCH_NO_RESULTS
SEARCH_NO_EVIDENCE_CANDIDATES
TOOL_CANCELLED
TOOL_BUDGET_EXCEEDED
```

错误写入 ToolTrace；用户 UI 只展示可理解状态，不暴露 provider secret/body。

## 18. Current Step Toolset

Context Compiler 接收已经冻结的 ToolCard。P6/P7 Lead 按 step 需要看到 `web_search`、`web_fetch` 或空工具集。Waiting、review、validation 和 finalization step 不一定暴露任何 tool。

Post-R1 Worker 使用单独 scoped toolset，不自动继承 Lead toolset。

## 19. User-visible Projection

一个 logical tool call 投影为一个用户可见 Activity execution，并保留稳定关联：

```text
runId + stepId + toolCallId
-> Activity execution
-> Conversation inline tool activity focus target
```

普通 Workbench 只展示用户可理解的 title/detail/status、耗时和结果数量等安全聚合信息。Primary/fallback/retry 可以显示为一句可理解摘要，但 provider attempts、输入参数、完整输出和内部错误体不形成独立 execution。

Conversation card 发起的是本地 UI focus action，不影响工具执行、重试、幂等或 durable State。Terminal tool call 仍可通过其稳定 identity 在 Activity 中查看。

## 20. Observe

ToolTrace 至少记录：

- tool/provider/version
- validation outcome
- provider attempts
- fallback reason
- timeout/cancel
- result classification counts
- payload truncation
- budget before/after

Trace 不进入普通 Workbench；只有 development-only Debug 可以读取脱敏后的 ToolTrace。

## 21. R1 验收

1. primary success 不调用 fallback。
2. error/rate-limit/insufficient material 按规则 fallback。
3. fallback 计入预算。
4. snippet-only result 始终为 clue。
5. content/passage 才可为 evidence candidate。
6. prompt injection 文本保持 untrusted data。
7. API Key 不出现在日志、State、Artifact。
8. cancel/timeout 有界终止。
9. 同一 tool call 的 retry/idempotency 不产生重复结果。
10. logical tool call 能通过 runId/stepId/toolCallId 稳定投影到唯一 Activity execution。
11. `web_fetch` 对批量初始 URL 执行最小网络安全校验，并对 URL 数量、超时、重试和响应大小进行限制。
12. Fetch passage 是来源原文，模型摘要不得升级为 evidence candidate。
13. Fetch 网络、缓存、正文提取、切块和相关性排序保持独立模块边界。
