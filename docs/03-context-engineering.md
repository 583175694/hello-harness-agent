# Context Engineering

> 文档状态：Greenfield R1 模型输入契约。

## 1. 定义

Context Engineering 是模型输入的唯一编译路径：

```text
frozen structured materials -> pure compile -> CompiledStepContext
```

它不是 prompt 字符串拼接器，也不决定下一 action。

## 2. 两阶段

```text
ContextMaterialLoader
  I/O, authorization, retrieval, freezing

ContextCompiler
  pure selection, ordering, truncation, rendering
```

数据库、Artifact、Memory 和 provider I/O 禁止进入 Compiler。

## 3. R1 输入

```ts
type ContextCompileInput = {
  userId: string;
  sessionId: string;
  runId: string;
  stepId: string;
  phase: ResearchPhase;
  currentUserInstruction: UserInstruction;
  conversationSummary?: ConversationSummary;
  taskFrame: TaskFrame;
  openGaps: GapCard[];
  observations: ObservationCard[];
  clues: ClueCard[];
  evidence: EvidenceCard[];
  artifactCards: ArtifactCard[];
  pendingSteer: SteerCard[];
  toolCards: ToolCard[];
  reportDraft?: ReportDraftCard;
  reportReview?: ReportReview;
};
```

P9 才增加 `memoryCards`。P11 才增加 WorkerTaskFrame scope。

## 4. Instruction Hierarchy

```text
System / product policy
Current user instruction
Current accepted steer
Task frame / current phase
Current session facts
User MemoryCard (post-R1)
Untrusted external evidence
```

外部 evidence 永远不能覆盖上层 instruction。

## 5. Untrusted Evidence Block

```ts
type EvidenceCard = {
  evidenceId?: string;
  displayId?: string;
  resultId: string;
  kind: 'clue' | 'evidence_candidate' | 'evidence';
  title: string;
  url: string;
  provider: string;
  retrievedAt: string;
  snippet?: string;
  passage?: string;
  locator?: EvidenceLocator;
};
```

编译输出必须显式标记：

```text
BEGIN UNTRUSTED EVIDENCE
... source-delimited data ...
END UNTRUSTED EVIDENCE
```

不得把网页中的 instruction-like text 提升到 guidance section。

## 6. Clue 与 Evidence

- Clue 用于规划查询，不允许被描述为正式证据。
- Evidence candidate 可用于选择 passage。
- Durable EvidenceSource 才能分配 `[Sx]` 并进入正式报告引用上下文。

ContextCompiler 保留这些类型标签，不能为了节省 token 抹去资格差异。

## 7. Phase Context

### Clarifying

只提供用户目标、关键歧义和已知 session context，不暴露搜索工具。

### Planning / Searching

提供 ResearchBudget、已执行 query、open gaps、clues/evidence summaries 和当前 step 可用的 `web_search` / `web_fetch` ToolCard。

### Drafting

提供用户目标、durable EvidenceCards、报告结构和限制；不提供 clue-only content 作为可引用来源。

### Reviewing

提供 draft、EvidenceCards 和 review checklist；默认不暴露工具。

### Revising

提供 draft、structured review、EvidenceCards 和 required revisions。

### Validating / Finalizing

模型不参与 deterministic validation/finalization；无需编译模型上下文。

## 8. Token Budget

建议层级：

```text
stable instructions
current user/steer
task frame/open gaps
durable evidence passages
recent observations
clues
conversation summary
artifact cards
```

不能截断掉：

- 当前用户目标
- phase constraints
- evidence source boundary
- `displayId`、`evidenceId` 和 passage 映射
- pending steer
- ResearchBudget hard limits

## 9. Progressive Disclosure

R1 支持：

- full provider response -> short-lived Artifact ref
- EvidenceCard -> durable cited passage
- Report Artifact -> ReportDraftCard

P9 支持：

- MemoryCard -> explicit prior-session sourceRef expansion

模型不能提交任意 user/session ID 来读取历史数据。

## 10. Determinism

```text
compile(snapshot, input, config, templateVersion, tokenizerVersion)
```

相同值必须产生相同：

- ordered sections
- included/omitted refs
- truncation decisions
- rendered model messages
- context hash

时间、随机数、数据库排序和模型 rerank 不得隐藏在 compiler 中。

## 11. CompiledStepContext

```ts
type CompiledStepContext = {
  version: string;
  runId: string;
  stepId: string;
  phase: ResearchPhase;
  messages: ModelMessage[];
  tools: ToolCard[];
  includedRefs: StateRef[];
  omitted: Array<{
    ref?: StateRef;
    reason: 'irrelevant' | 'budget' | 'unauthorized' | 'stale' | 'phase';
  }>;
  tokenEstimate: number;
  contextHash: string;
};
```

## 12. Context Trace

```ts
type ContextTrace = {
  runId: string;
  stepId: string;
  phase: ResearchPhase;
  includedRefs: StateRef[];
  omittedCounts: Record<string, number>;
  truncations: Array<{ section: string; original: number; included: number }>;
  tokenEstimate: number;
  contextHash: string;
};
```

Trace 进入 Observe，不默认进入模型或用户 UI。

## 13. Conversation Compaction

Session 可包含多次 run。Loader 可以生成 session conversation summary，但必须保留：

- 当前用户消息
- unresolved clarification
- accepted steer
- prior final deliverable refs
- explicit corrections

Compaction summary 是当前 session context，不是 User Memory。

## 14. User Memory (P9)

Memory Retriever 在 Compiler 外按 userId 取 MemoryCard。Compiler 只把选中的 card 放在 current facts 之后。

Prior-session evidence expansion 必须先通过 user ownership 和 selected Memory sourceRefs authorization。

## 15. Worker Context (P11)

Worker 只看到 WorkerTaskFrame-scoped context、授权 Evidence/refs 和 scoped toolset。它不能读取完整 session 或全量 User Memory。

## 16. R1 验收

1. Compiler 无 I/O。
2. snapshot tests 确定性。
3. clue/evidence 类型不会丢失。
4. external content 保持 untrusted section。
5. pending steer 在下一 safe step 出现。
6. waiting_for_user 不暴露搜索工具。
7. review step 不混入无关 clue。
8. API Key/provider secret 永不进入 context。
