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

当前 `AgentRuntimeService` 不理解上述具体工具名称。Runtime 只把本次调用的关联标识和组合取消信号传给 Tool：

```ts
type ToolExecutionContext = {
  sessionId?: string;
  messageId?: string;
  toolCallId: string;
  signal?: AbortSignal;
};
```

Tool 不接收跨调用规划状态，也不能改变后续工具集或请求 Runtime 收尾。模型负责全部任务语义决策，Runtime 只执行模型决策并维护通用执行边界，Tool 只执行单次能力并返回结构化结果。来源 provenance 和 canonical source 由 Projection 根据已经发生的事件派生，详见 [Model-led Tool Boundary](./25-model-led-tool-boundary.md)。

## 3. Tool Definition

```ts
type ToolDefinition = {
  name: string;
  version: string;
  description: string;
  inputSchema: unknown;
  effect: 'read_only' | 'write' | 'external_side_effect';
  allowedScopes: Array<'lead' | 'worker'>;
  executionPolicy: {
    timeoutMs: number;
  };
  maxConcurrency: number;
};
```

R1 `web_search` 和 `web_fetch` 的 effect 都是 `read_only`，但它们仍会向外部服务发送 query 或 URL，必须在 trace 中表达 external data transfer。配置对应 provider API Key 即构成部署级发送授权，任务调用不再逐次询问；调用内容仍限于当前任务所需数据，credential 永不进入请求 payload、模型上下文、State 或日志。

`executionPolicy.timeoutMs` 是 Tool 声明、模型不可覆盖的整个调用外层超时。Runtime 将它与用户取消信号组合并强制执行；Tool 内部仍可以为连接、单 URL、Provider 请求和响应读取设置更细的 transport timeout。

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

`urls` 固定为 1-5 个公开地址，`query` 为整批来源共用的证据需求。V1 使用 Crawlee `HttpCrawler` 获取原始响应，JSDOM + Mozilla Readability 提取主要正文，Turndown 生成 Markdown。模型可以 Fetch 任意通过 URL/DNS/redirect guard 的公开 HTTP/HTTPS URL；provenance 只由 Projection 根据已发生事件派生，不是执行权限。完整契约见 `23-web-fetch-tool.md`。

## 9. Untrusted Content

Provider content 必须：

- 标记 source/provider/resultId。
- 进入 untrusted evidence payload。
- 与 system/user instructions 分离。
- 在 Tool 自身合法输出契约和单次容量边界内规范化。
- 移除不可见控制字符和危险 metadata。

Tooling 不把网页文本解释为命令。

## 10. Tool Call Protocol

```ts
type ToolCallBase = {
  toolCallId: string;
  runId: string;
  stepId: string;
  toolVersion: string;
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

以下是当前生产契约：

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

`web_search` 和 `web_fetch` 使用同一 execution envelope，但分别返回自己的 canonical output。Runtime 统一把成功结果序列化为 `{ ok: true, untrustedToolData: true, output }`，把失败序列化为 `{ ok: false, error }`。诊断专用 `cause` 和 `logFields` 只进入脱敏日志，不进入模型上下文、SSE 或数据库；是否继续、重试、换来源或回答由模型决定。Runtime 只在用户取消、Tool 外层超时、协议错误和 20 次 Tool Call 上限等通用边界下确定性改变流程。

## 12. Tool Result 交付

```text
ToolExecutionResult
-> canonical output 进入生命周期事件与 Projection
-> Runtime 序列化 output/error
-> Tool Message 进入下一模型轮次
```

当前阶段不建立独立 observation 对象、字符预算或注入状态；成功和结构化失败结果都交给模型继续决策。Tool 的合法输出契约仍排除 Raw HTML、敏感 Header、credential、内部 DNS/IP 和不可序列化对象。

## 13. Storage

- 当前 assistant Message metadata 保存有界 execution/source snapshot，用于刷新恢复 Conversation 与 Workbench。
- 完整 Raw HTML、canonical Markdown、DNS/IP 和 Provider 原始响应不进入 PostgreSQL。
- 当前不创建 durable EvidenceSource 或 Tool observation StateRecord。
- API Key 不落库、不进 State、不进 trace。

## 14. 执行边界

当前实现只保留：

- Runtime 每个 assistant run 最多 20 次模型声明的 Tool Call。
- 模型单轮超时、Tool 声明的外层执行超时和用户取消。
- Tool 单次输入数量、Provider 单请求、有限 transport retry、响应大小和并发等能力内部边界。
- Web Fetch 的 SSRF、DNS、重定向、MIME、正文大小和缓存容量等安全与工程边界。

生产实现已经删除每轮 25 个唯一 URL、60,000 Passage 字符和连续无新增内容早停等跨调用领域控制。当前不使用字符数决定 Tool Result 是否注入，完整上下文的 Token 计量、选择、压缩和淘汰留给后续 Context Engineering。

## 15. Retry

Provider adapter 只按配置执行有限 transport retry。Logical Tool 是否再次调用由模型下一轮决定，并受 Runtime 通用 Tool Call 上限和工具单次安全限制约束。

禁止：

- 无限重试
- 用内部 retry 绕过单次调用边界
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
