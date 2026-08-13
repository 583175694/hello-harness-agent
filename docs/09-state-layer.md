# State Layer

> 文档状态：后续 durable State 草案，不约束当前 Session/Message 与 assistant metadata 实现。Reasoning 与 provider-compatible model transcript 是独立执行事实，边界以 `27-reasoning-context-transcript.md` 为准。

## 1. 定义

State Layer 是执行事实的 source of truth：

```text
structured + self-describing + referenceable + recoverable facts
```

State 不做决策、prompt 编译、provider 执行、report review 或 UI 状态管理。

## 2. Ownership

每条 R1 StateRecord 必须携带：

```text
userId
sessionId
runId
optional stepId
```

Repository 读取必须显式 scope。R1 虽只有 local user，也禁止无归属的全局 State。

## 3. StateRecord

```ts
type StateRecord<T = unknown> = {
  id: string;
  userId: string;
  sessionId: string;
  runId: string;
  stepId?: string;
  type: StateRecordType;
  status: string;
  visibility: 'model_visible' | 'user_visible' | 'internal_only' | 'debug_only';
  summary?: string;
  payload: T;
  refs: StateRef[];
  tokenEstimate?: number;
  createdAt: string;
  schemaVersion: string;
};
```

State append-only。Correction、supersede、invalidate 使用新 record/refs 表达。

## 4. R1 Record Types

```text
user_message
assistant_message
clarification_question
clarification_answer
run_control
model_action
tool_call
tool_result
search_result_set
research_gap
research_plan
evidence_source
report_draft
report_review
report_revision
citation_validation
artifact
runtime_event
failure
```

Post-R1 才增加 memory/delegation/worker records。

## 5. StateRef

```ts
type StateRef = {
  refType: 'state' | 'artifact' | 'evidence' | 'message' | 'memory';
  refId: string;
  relation:
    | 'source'
    | 'evidence'
    | 'citation'
    | 'artifact'
    | 'derived_from'
    | 'supersedes'
    | 'conflicts_with';
  userId: string;
  sessionId?: string;
  runId?: string;
};
```

Ref 不等于授权。展开时仍校验 ownership、当前 capability 和显式 sourceRef path。

## 6. Tool Result Fact

```text
tool_result       execution fact, provider-normalized result/metrics
```

当前阶段不创建独立 `tool_observation` StateRecord。Tool 的合法结构化结果用于 execution、Projection 和当前 Tool Message；未来 Context Engineering 如何选择或压缩结果尚未冻结，不能由 State 或 Tool 宣称任务已经完成。

## 7. Search Facts

Search result 必须保留资格：

```ts
type SearchResultFact = {
  resultId: string;
  provider: string;
  query: string;
  title: string;
  url: string;
  snippet?: string;
  contentRef?: string;
  kind: 'clue' | 'evidence_candidate';
  retrievedAt: string;
};
```

State 不把 clue 自动升级为 evidence。

## 8. EvidenceSource

EvidenceSource 是 R1 引用事实：

```ts
type EvidenceSource = {
  evidenceId: string;
  displayId: string;
  userId: string;
  sessionId: string;
  runId: string;
  searchResultRef: StateRef;
  title: string;
  url: string;
  provider: string;
  retrievedAt: string;
  passage: string;
  locator?: EvidenceLocator;
  contentHash: string;
  status: 'eligible' | 'invalidated';
};
```

要求：

- passage 非空。
- 来源不是 snippet-only clue。
- displayId 在 run 内唯一。
- record 创建后 passage immutable。

## 9. Report Facts

```text
report_draft      -> draft Artifact ref
report_review     -> structured ReportReview
report_revision   -> revised Artifact ref
citation_validation -> passed/failed + checked refs/hash
```

Finalizer 只消费通过验证的 revision，不把 draft 当最终答案。

## 10. Artifact Record

State 只保存 Artifact metadata/ref，不内联大内容：

```ts
type ArtifactRecord = {
  artifactId: string;
  kind: 'report_draft' | 'report' | 'provider_payload' | 'json' | 'file';
  title: string;
  mimeType: string;
  status: 'pending' | 'completed' | 'failed' | 'deleted';
  storageKey: string;
  contentHash?: string;
  retention: 'durable' | 'short_lived';
};
```

## 11. Control Facts

Steer/cancel 是 durable controls：

- accepted event
- pending/applied/rejected status
- sequence and timestamps
- applied step

不得通过修改原 user message 表达 steer。

## 12. Snapshot

```ts
type RunSnapshot = {
  run: RunState;
  activeStep?: StepState;
  messages: MessageFact[];
  latestActions: ModelActionFact[];
  toolResults: ToolResultFact[];
  openGaps: GapFact[];
  evidence: EvidenceSource[];
  artifacts: ArtifactRecord[];
  report?: ReportState;
  pendingControls: RunControlFact[];
  version: number;
};
```

Snapshot 是 loader/recovery 输入，不直接等于 model context 或 UI model。

同理，State Snapshot、Conversation Projection 和 Canonical Model Transcript 不能互相替代：State 保存执行事实，Projection 服务用户恢复，Transcript 保存模型协议顺序和回放所需内容。Context Compiler 后续可以同时读取它们，但必须显式选择和转换。

## 13. Write Ordering

Tool：

```text
tool execution terminal
-> Artifact if needed
-> tool_result
-> refs
-> events
-> step completed
```

Report：

```text
EvidenceSource[]
-> draft Artifact
-> review
-> revised Artifact
-> citation validation
-> final message/state/events
-> run completed
```

## 14. Visibility

- `model_visible` 仍需 ContextCompiler selection。
- `user_visible` 由 Gateway projection 转换。
- `internal_only` 不推给普通客户端。
- `debug_only` 仅 debug mode，写入前脱敏。

外部 provider content 默认不整体 user/model visible；只通过 clue preview、EvidenceCard 或 Artifact ref 按需披露。

## 15. Retention

```text
durable:
  messages, run facts, cited EvidenceSource, final report

short-lived:
  uncited provider content, stream replay, observe trace
```

Session 删除覆盖所有 retention，触发真实清理。

## 16. Resume

State 必须足以判断：

- 当前 phase/step
- downstream 是否 terminal
- provider/tool 是否已提交 outcome
- steer 是否 pending/applied
- Evidence/Artifact 是否 durable
- 已批准的下游交付是否完成

## 17. User Memory (P9/P10)

Memory 是 user-scoped derived context，不是 State 子类型。Memory sourceRefs 可以指向 prior-session State，但展开必须验证当前 user ownership 和 selected Memory path。

Session 删除时，Memory 引用重算由 Memory service 执行。

## 18. Delegation (P11)

Worker/delegation facts 使用同一 envelope 和 ordering；worker result 不直接成为用户报告，必须回到 Lead Report Pipeline。

## 19. R1 验收

1. 所有记录有 user/session/run ownership。
2. State append-only。
3. clue/evidence 资格不可混淆。
4. 每个 citation 可追到 EvidenceSource 和 passage。
5. Artifact content 不内联 State。
6. report completed 前 validation fact 已 durable。
7. steer/cancel 可恢复且有应用顺序。
8. short-lived 数据可清理。
9. Snapshot 可支持 API restart recovery。
