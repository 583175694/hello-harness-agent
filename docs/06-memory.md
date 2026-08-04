# User Memory

> 文档状态：Greenfield post-R1 capability。Memory 不属于首次发布；P9 实现读取，P10 实现写入和管理。

## 1. 定义

Memory 是同一用户跨 session 可复用的、带证据的长期偏好与上下文。

```text
User Memory = user-scoped, evidence-backed, reviewable recall
```

Memory 不是：

- Session history
- State 副本
- 网页事实库
- Project/workspace/org knowledge base
- raw tool output
- system policy
- 自动行为规则

## 2. 唯一 Scope

```ts
type MemoryScope = 'user';
```

不支持 project、workspace、org 或 public scope。每条 Memory 直接归属 `userId`。

Session 默认隔离。新 session 只能先检索相关 MemoryCard，再通过 Memory `sourceRefs` 显式展开同一 user 的 prior-session State 或 Artifact。

禁止 Agent 直接搜索用户全部历史 session。

## 3. 允许记忆的内容

### 可自动 active

用户明确表达的长期偏好，例如：

- “以后报告使用中文。”
- “默认先给执行摘要。”
- “引用使用内联编号。”

必须同时满足：

- 明确由用户表达
- 具有跨 session 意图
- 不含 secret/credential
- 有 sourceRefs

### 只能 candidate

- 模型推断的偏好
- 可能长期有用但用户没有明确要求记住的信息
- 多次行为中推测出的工作习惯

### 禁止写入

- 网页事实、市场数据和新闻
- 单次调研结论
- 搜索摘要和 provider content
- API Key、环境变量、私钥
- raw prompt、raw trace、raw tool output
- 未授权第三方个人信息
- 当前 session 的临时要求

## 4. 类型

```ts
type MemoryType =
  'user_preference' | 'workflow_preference' | 'format_preference' | 'user_correction';

type MemoryStatus = 'candidate' | 'active' | 'superseded' | 'rejected' | 'expired';
```

R1 后首版不引入 project convention、organization policy 或外部知识类型。

## 5. MemoryRecord

```ts
type MemoryRecord = {
  memoryId: string;
  userId: string;
  type: MemoryType;
  title: string;
  summary: string;
  content?: string;
  sourceRefs: StateRef[];
  evidenceRefs?: StateRef[];
  confidence: 'low' | 'medium' | 'high';
  freshness: 'fresh' | 'stale' | 'unknown';
  status: MemoryStatus;
  sensitivity: 'normal' | 'private' | 'secret_suspected';
  policy: {
    allowAutoInject: boolean;
    allowUseInWorker: boolean;
  };
  extraction: {
    sourceSessionId: string;
    sourceRunId?: string;
    extractorVersion: string;
    policyVersion: string;
  };
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};
```

没有 `sourceRefs` 的 Memory 不允许 active。

## 6. MemoryCandidate

```ts
type MemoryCandidate = {
  candidateId: string;
  userId: string;
  sourceSessionId: string;
  sourceRunId?: string;
  type: MemoryType;
  title: string;
  summary: string;
  sourceRefs: StateRef[];
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  status: 'pending_review' | 'accepted' | 'rejected';
};
```

推断内容只能进入 candidate，不能静默 auto-active。

## 7. 写入流程

```text
Run completed/idle
-> eligibility check
-> candidate extraction
-> external-content exclusion
-> secret redaction
-> explicit-intent classification
-> dedup/conflict check
-> explicit durable preference: active
-> inferred content: candidate
-> store with sourceRefs
```

Memory extraction 异步执行，不阻塞当前 run finalization。

## 8. Eligibility

```ts
type MemoryEligibility = {
  sourceIsUserAuthored: boolean;
  hasDurableIntent: boolean;
  containsExternalResearchFact: boolean;
  containsSecretRisk: boolean;
  sourceRefs: StateRef[];
};
```

Auto-active 条件：

```text
sourceIsUserAuthored
AND hasDurableIntent
AND NOT containsExternalResearchFact
AND NOT containsSecretRisk
AND sourceRefs.length > 0
```

## 9. 读取

Memory Retriever 在 Context Compiler 外执行：

```ts
type MemoryRetrievalRequest = {
  userId: string;
  sessionId: string;
  runId: string;
  query: string;
  types?: MemoryType[];
  maxCards: number;
  tokenBudget: number;
  includeStale?: boolean;
};
```

只返回当前 user 的 active Memory，按 relevance、freshness、confidence 排序。

## 10. MemoryCard

```ts
type MemoryCard = {
  memoryId: string;
  type: MemoryType;
  title: string;
  summary: string;
  confidence: 'low' | 'medium' | 'high';
  freshness: 'fresh' | 'stale' | 'unknown';
  sourceRefs: StateRef[];
  flags?: {
    stale?: boolean;
    conflict?: boolean;
  };
};
```

模型默认只看到 MemoryCard。读取完整内容或 prior-session evidence 必须发起显式 ref expansion。

## 11. 跨 Session Ref Expansion

授权条件：

1. Memory 属于当前 user。
2. sourceRef 目标也属于当前 user。
3. 当前 step 已选中该 MemoryCard。
4. 请求的 ref 位于该 Memory 的 sourceRefs/evidenceRefs。
5. 展开受 token/count budget 限制。

禁止通过任意 prior `sessionId` 扫描历史 State。

## 12. 注入优先级

```text
System Instructions
Current User Instruction
Current Session Task Frame
Current Run Facts
Current User Steer
Relevant User Memory Cards
```

Memory 不能覆盖当前用户指令、当前 session facts 或安全边界。

## 13. MemoryInjectionTrace

```ts
type MemoryInjectionTrace = {
  runId: string;
  stepId: string;
  includedMemoryIds: string[];
  omitted: Array<{
    memoryId?: string;
    reason: 'low_relevance' | 'stale' | 'budget' | 'sensitive' | 'disabled';
  }>;
  tokenEstimate: number;
};
```

Trace 进入 Observe，不默认展示给用户或模型。

## 14. Candidate Review

P10 UI 必须允许：

- accept candidate
- reject candidate
- edit before accepting
- delete active Memory
- disable Memory use/generation

候选 Memory 不自动注入模型。

## 15. Conflict / Supersede

新偏好与 active Memory 冲突时：

- 明确新用户指令优先。
- 新记录 active 后，旧记录 superseded。
- 保留可审计关系和 sourceRefs。
- 不由模型静默合并相互矛盾的偏好。

## 16. Session 删除

删除 session 时：

```text
find Memory records referencing deleted session
-> remove deleted sourceRefs
-> no evidence remains: delete or expire
-> evidence remains: recompute confidence/freshness/status
```

用户不可见的旧 session 证据不能在后台永久保留。

## 17. Worker

P11 Worker 默认不读取 User Memory。只有 Lead 明确授权、Memory policy 允许且与 WorkerTaskFrame 相关时，Context Engineering 才注入 MemoryCard。

Worker 不能搜索、写入、修改、接受、拒绝或删除 Memory。

## 18. Storage

Memory metadata 和内容存 PostgreSQL `memory_records/memory_candidates`。Memory 不复制 raw Artifact；大证据继续通过 sourceRefs 指向 State/Artifact。

首版使用 PostgreSQL keyword/topic search，不要求向量数据库。

## 19. P9/P10 验收

P9：

- 只检索当前 user active Memory。
- 新 session 可收到相关 MemoryCard。
- prior-session evidence 必须显式展开。
- 无任意历史 session 扫描。

P10：

- 明确长期偏好可 auto-active。
- 推断内容只能 candidate。
- 网页事实不能进入 Memory。
- candidate review 和 delete 可用。
- session delete 会重新评估 Memory。
- secret/external content tests 通过。
