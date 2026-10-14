# C7 User Memory（专项规范）

> **文档状态**：C7 的**唯一实施依据**（本文件即全部规范，无拆分索引文档）。`17-implementation-plan.md` 仅保留里程碑摘要。
>
> **编号约定（Capability 主线）**
>
> - **大版本 `Cn`**：独立 Capability（**C6** Skills、**C7** User Memory、**C8** Browser、**C9** MCP Marketplace、**C10** Skills Marketplace）。
> - **小版本 `Cn-X`**：分阶段交付（**C7-A / C7-B / C7-C**）。与 C3-C 文档内批次序号不是同一命名空间。
>
> **C7 分阶段**：**C7-A** 读路径 → **C7-B** 写路径与 UI → **C7-C** Delegation 联动（与 P11 同期）。原路线图 P9/P10 已并入 C7。
>
> **归属**：Memory 子系统（Retriever / Extractor / Store）+ K5（选择、预算、渲染）。与 [C6 Skills](./40-c6-skills.md) 文档分离，仅共享 K5 编译管道。Runtime **不**做 Memory 提炼；Context Engineering **不**自行写入 Memory。
>
> **设计立场**：吸收业界「抽取 → 巩固 → 检索 → 注入」共性，结合 Harness 的 Session/Run/State 证据链与 K5 统一编译；**偏可信、可审计、用户可管**，而非「尽量多记、全历史 RAG」。
>
> 与 [C6 Skills](./40-c6-skills.md) 独立，仅与 K5 共享 Context 编译入口。

| 阶段 | 名称 | 摘要 |
|------|------|------|
| **C7-A** | Read Path | 存储、检索、MemoryCard 注入、ref expansion、InjectionTrace |
| **C7-B** | Write / Review | Extractor、Policy、candidate 审核 UI、Session 删除重评估 |
| **C7-C** | Delegation 联动 | Worker 读 Memory 门控；可选 Profile / ConsolidationJob |

## 1. 要解决什么问题

LLM Agent 无原生长期记忆。User Memory 为**同一用户**提供跨 Session 可复用的偏好与稳定上下文，并在新任务中**按需、有预算**进入 `CompiledStepContext`，避免：

- 每个 Session 从零解释偏好；
- 把完整历史 transcript 塞进 context；
- 把网页调研结论误当成「用户是谁」。

```text
User Memory = user-scoped, consolidated facts/preferences, evidence-backed, user-reviewable
```

## 2. 在 Harness 中的位置

```text
                    ┌─────────────────────────────────────┐
                    │           Lead Harness Runtime       │
                    │  lifecycle / step / dispatch only    │
                    └─────────────────┬───────────────────┘
                                      │ run terminal (async)
                                      ▼
                    ┌─────────────────────────────────────┐
                    │     Memory Subsystem (C7-A / C7-B)     │
                    │  Retriever │ Extractor │ Policy │ Store│
                    └─────┬───────────────────────┬─────────┘
                          │ candidates             │ MemoryCard[]
                          ▼                        ▼
                    PostgreSQL              ContextCompileInput.memories
                          │                        │
                          │ sourceRefs             ▼
                          └──────────────► K5 选择 / 渲染 / 预算
                                               │
                                               ▼
                                        CompiledStepContext → Model
```

**与 State 的关系**：Memory **不复制**大段 Artifact 或 raw tool output；`sourceRefs` 指向已有 `StateRecord` / Message / Artifact 元数据，需要时再经 **显式 ref expansion**（同 user、有 budget）。

**与 Skills 的关系**（见 [40-c6-skills.md](./40-c6-skills.md)）：

| | Skills | User Memory |
|---|--------|-------------|
| 语义 | 怎么做任务（流程、契约） | 用户是谁、偏好什么 |
| 注入 | 可作任务说明 | **仅参考**，不能覆盖 System / Tool Policy |
| 产生方 | Registry + `skills.read` | Extractor + 用户审核 |

**与 Session Compaction 的关系**：Session 内 `Compaction Summary` 是**派生继续视图**，不是 User Memory。Compaction 消失后，只有进入 Memory 且仍 active 的内容可跨 Session 复用。

## 3. 记忆分层（概念模型）

对齐业界 Semantic / Episodic / Procedural 语言，Harness **首版重点做 Semantic**；Episodic、Procedural 有边界地处理。

| 层 | 含义 | Harness 首版 |
|----|------|--------------|
| **Working** | 当前 Run 的 messages、tool results、task frame | Context Engineering 已有；**不进 Memory Store** |
| **Semantic** | 稳定事实与偏好（语言、格式、工作习惯） | **Memory 主类型** |
| **Episodic** | 「某次对话发生了什么」 | **默认不整段入库**；仅当用户明确要求记住某次结论且通过 policy 时，以 Semantic 摘要 + sourceRefs 进入 |
| **Procedural** | Agent 行为规则 | **User Rules / Skills / System Prompt**；不写入 User Memory，避免与权限和版本化规则打架 |

可选 **User Memory Profile**（C7-C 或 C7-B 二期、数据量触发时）：单用户一份短摘要（~200 tokens），由 active Memory 巩固生成，供检索锚点；**不替代**逐条 `MemoryRecord`，用户可编辑 Profile 文本。

## 4. Scope 与隔离

```ts
type MemoryScope = 'user';
```

- 每条 Memory 归属 `userId`。不支持 project / workspace / org / public。
- **Session 默认隔离**：新 Session **禁止**扫描用户全部历史 Session；只能：
  1. 检索当前 user 的 **active** Memory → `MemoryCard`；
  2. 在 Lead 选中某 Card 后，按 `sourceRefs` **显式展开**同 user 的 prior-session 证据。
- **Agent / Worker scope**（**C7-C**，与 P11 Delegation 同期）：Worker **默认不读** User Memory；仅 Lead 在 Delegation policy 授权且与 `WorkerTaskFrame` 相关时，由 K5 注入 MemoryCard（见 [08-worker-harness-runtime.md](./08-worker-harness-runtime.md)）。

## 5. 什么能进 Memory

### 5.1 鼓励写入（Semantic）

- 用户**明确**表达的长期偏好：语言、报告结构、引用风格、默认深度等。
- 用户**明确**要求「以后都…」「记住我…」的设定。
- 用户对自己工作方式的**稳定自述**（角色、常用栈），且带来源消息。

### 5.2 仅 Candidate（需审核才 active）

- 模型从多次行为**推断**的偏好（未听到用户明确「记住」）。
- 可能有用但 durable intent 不清晰的信息。
- Profile 巩固产生的条目（若与显式 Memory 冲突，以显式为准）。

### 5.3 禁止写入

- 网页事实、市场数据、新闻、单次调研结论（属于 Task 结果或 Evidence，不是用户画像）。
- Search/Fetch provider 摘要作为「用户偏好」。
- API Key、token、env、私钥；`secret_suspected` 一律 blocked。
- Raw prompt、完整 trace、raw tool output 副本。
- 未授权第三方个人信息。
- **仅当前 Session 的一次性要求**（「这次用表格」→ 不进 Memory，留在 Session context）。

### 5.4 外部内容与 Memory 的防火墙

与 [00-agent-core-roadmap.md](./00-agent-core-roadmap.md) 来源边界一致：外部内容不可信，**不能**因为出现在对话里就自动成为「用户长期偏好」。Extractor 必须带 `containsExternalResearchFact` 检测；为 true 则拒绝或仅写 Observe 调试事件。

## 6. 类型与状态

```ts
type MemoryKind =
  | 'preference'           // 语言、风格、默认选项
  | 'workflow'             // 先摘要后细节、确认再执行等
  | 'format'               // Markdown/引用/标题规范
  | 'correction'           // 用户纠正 agent 的持久规则
  | 'identity_context';    // 稳定角色/领域（非实时位置）

type MemoryStatus =
  | 'candidate'   // 待审核，不注入
  | 'active'      // 可检索、可注入
  | 'superseded'  // 被新 Memory 取代，保留审计
  | 'rejected'    // 用户拒绝
  | 'expired';    // TTL 或证据失效
```

首版不引入 `project_convention` / `org_policy` 类型；组织级规则走配置或 Skills，不走 User Memory。

## 7. 数据模型

### 7.1 MemoryRecord（持久化）

```ts
type MemoryRecord = {
  memoryId: string;
  userId: string;
  kind: MemoryKind;
  title: string;              // 短标题，UI 与检索
  summary: string;            // 注入主文案（MemoryCard 主体）
  content?: string;           // 可选长文；默认不注入模型
  status: MemoryStatus;
  confidence: 'low' | 'medium' | 'high';
  freshness: 'fresh' | 'stale' | 'unknown';
  importance: 'low' | 'medium' | 'high';  // 巩固与 budget 裁剪
  sensitivity: 'normal' | 'private' | 'secret_suspected';
  validFrom?: string;         // ISO8601，可选
  validUntil?: string;        // 事件型偏好过期
  sourceRefs: StateRef[];     // 必填方可 active
  evidenceRefs?: StateRef[];
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
  supersedesMemoryId?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;        // 检索注入时更新
  useCount?: number;
  expiresAt?: string;
};
```

**Invariant**：`status === 'active'` ⇒ `sourceRefs.length > 0` 且非 `secret_suspected`。

### 7.2 MemoryCandidate（写入管道中间态）

```ts
type MemoryCandidate = {
  candidateId: string;
  userId: string;
  sourceSessionId: string;
  sourceRunId?: string;
  kind: MemoryKind;
  title: string;
  summary: string;
  sourceRefs: StateRef[];
  confidence: 'low' | 'medium' | 'high';
  reason: string;             // 给审核 UI
  status: 'pending_review' | 'accepted' | 'rejected';
};
```

### 7.3 MemoryCard（读路径 / 模型默认可见）

```ts
type MemoryCard = {
  memoryId: string;
  kind: MemoryKind;
  title: string;
  summary: string;
  confidence: 'low' | 'medium' | 'high';
  freshness: 'fresh' | 'stale' | 'unknown';
  importance: 'low' | 'medium' | 'high';
  sourceRefs: StateRef[];
  flags?: {
    stale?: boolean;
    conflict?: boolean;
  };
};
```

模型默认只见 **MemoryCard**（及 K5 渲染后的区块）。读 `content` 或展开 prior-session 原文必须走 **Lead 工具或 ref expansion API**，受 token/count budget 限制。

### 7.4 K5 输入（与 C6 边界）

Memory Retriever 向 K5 提供（见 [39-k5-context-engineering.md](./39-k5-context-engineering.md)）：

```ts
type MemoryContextInput = {
  memoryId: string;
  content: string;            // 通常 = summary；必要时短 content
  sourceRefs: MemorySourceRef[];
  priorityHint?: number;      // 不能替代权限与归属校验
};
```

K5 决定：选哪些 Card、占多少 token、是否截断、是否 Omit 并记入 trace。

## 8. 写入路径（Consolidation）

业界共性：**读路径同步、写路径异步**。Harness 默认 **Subconscious Formation**（run 结束后异步），可选 **Explicit Formation**（用户当场说「记住」）。

### 8.1 触发时机

```text
Run → terminal (completed | failed | cancelled 且已有用户消息)
  → enqueue MemoryExtractionJob (不阻塞 finalization)
  → Eligibility → Extract → Policy → Persist
```

额外触发：

- 用户消息显式「记住 / 以后都」→ 可同步写 **candidate** 或满足 policy 时 **active**（C7-B）。
- 用户 Settings 手动新增 / 编辑 Memory。
- C7-C 可选 nightly **ConsolidationJob**：合并重复 candidate、刷新 Profile、标记 stale（输入仅限已有 sourceRefs 的记录，禁止无证据合成）。

### 8.2 Eligibility（Auto-active 门槛）

```ts
type MemoryEligibility = {
  sourceIsUserAuthored: boolean;
  hasDurableIntent: boolean;
  containsExternalResearchFact: boolean;
  containsSecretRisk: boolean;
  sourceRefs: StateRef[];
};
```

Auto-active 当且仅当：

```text
sourceIsUserAuthored
AND hasDurableIntent
AND NOT containsExternalResearchFact
AND NOT containsSecretRisk
AND sourceRefs.length > 0
```

否则 → `candidate` 或丢弃（丢弃须 Observe 可统计 reason）。

### 8.3 Extractor 行为（LLM + 规则）

1. 输入：本次 Run 内**用户消息** + 必要 Steer（不含 full tool output）。
2. 输出：0..N 条 `{ kind, title, summary, confidence, reason, sourceRefs }`。
3. 规则后处理：secret redaction、dedup（embedding 或 keyword，首版 keyword + title 归一化）、与 active 冲突检测。
4. **冲突**：新明确用户意图优先 → 新记录 `active`，旧记录 `superseded`，保留 `supersedesMemoryId` 链。
5. **时间**：抽取时识别事件型语句（「下周去新加坡」）→ 填 `validUntil` 或 extraction 后由 Consolidation 标记 stale（对齐业界 temporal / freshness 实践，首版不建图数据库）。

### 8.4 不在 Hot Path 开放「Agent 自写 Memory Tool」

Letta/MemGPT 式 agent 自管内存与 Harness 的 eligibility / candidate 门控冲突。首版 **Lead 不提供** `memory.write` 给模型；用户显式指令由 Host 解析或 C7-B UI 写入。后续若开放，仅允许写 **candidate**。

## 9. 读路径（Recall）

### 9.1 Retriever（Context 编译前）

在 K5 之前运行（或作为 C6 服务被 K5 调用）：

```ts
type MemoryRetrievalRequest = {
  userId: string;
  sessionId: string;
  runId: string;
  query: string;              // 当前 task + 最近 user turn 合成
  kinds?: MemoryKind[];
  maxCards: number;
  tokenBudget: number;
  includeStale?: boolean;
};
```

步骤：

1. 只查 `userId` + `status = active` + `allowAutoInject`。
2. 排序：`relevance`（keyword 首版；达规模后 optional hybrid vector）、`importance`、`freshness`、`confidence`、**recency of use**（`lastUsedAt` / `useCount`）。
3. 输出 `MemoryCard[]`，总量 ≤ `maxCards` 且估算 token ≤ `tokenBudget`。
4. 更新被选中卡的 `lastUsedAt` / `useCount`（异步即可）。

### 9.2 Context 注入优先级

```text
System Instructions / Skills（若本 run 启用）
Current User Instruction + Steer
Current Session Task Frame + Run Facts
Relevant User Memory Cards（K5 渲染区块）
Compaction Summary + Recent Transcript
Tool Definitions
```

Memory **不能**覆盖：当前用户指令、安全边界、Tool Policy、Steer。

### 9.3 跨 Session Ref Expansion

授权条件（全部满足）：

1. Memory 与 ref 目标均属当前 `userId`。
2. 当前 step 已选中该 MemoryCard（或 Lead 发起 expansion tool）。
3. ref ∈ `sourceRefs` ∪ `evidenceRefs`。
4. 展开条数与 token 受 `MemoryExpansionBudget` 限制。

禁止：任意 `sessionId` 全库搜索、Worker 默认 expansion。

### 9.4 MemoryInjectionTrace

```ts
type MemoryInjectionTrace = {
  runId: string;
  stepId: string;
  includedMemoryIds: string[];
  omitted: Array<{
    memoryId?: string;
    reason: 'low_relevance' | 'stale' | 'budget' | 'sensitive' | 'disabled' | 'candidate';
  }>;
  tokenEstimate: number;
};
```

写入 Observe；默认不对用户或模型展示完整 trace（Workbench 调试 C7-B+ 可选）。

## 10. 用户控制面（C7-B）

Web Workbench / Settings 必须支持：

- 查看 active Memory 与 pending candidate；
- accept / reject / edit后 accept candidate；
- 删除 active、disable `allowAutoInject`、disable 全局 Memory 生成；
- 查看简短 **Memory Summary**（可选 Profile）；
- 与 ChatGPT 类似：用户 corrections 立即影响后续检索权重（importance ↑ 或 pin）。

API 见 [11-api-protocol.md](./11-api-protocol.md)（`memory-candidates` review 等）；协议字段以 `packages/agent-protocol` 冻结为准。

## 11. Session 删除与合规

Session 删除时：

```text
find MemoryRecord where sourceRefs reference deleted session
→ remove those refs
→ if no refs remain: delete or expire record
→ else: recompute confidence / freshness / status
```

用户不可见的 Session 证据不得在 Memory 中无限期留存。

## 12. 存储与检索技术

- **Metadata + summary/content**：PostgreSQL `memory_records` / `memory_candidates`（见 [12-storage-schema.md](./12-storage-schema.md) §20）。
- **首版检索**：PostgreSQL `tsvector` / keyword + `kind` / `status` 索引；**不强制**向量库。
- **升级信号**：单用户 active 条数持续 > ~200、或检索 recall 不足 → 引入 optional embedding 索引（仍保留 sourceRefs 与 audit 字段）。
- **图 / 时序 KG**：非 C7-A/C7-B 范围；若未来需要「关系与时间线」，单独 ADR，不阻塞首版。

## 13. 分阶段交付（C7-A / C7-B / C7-C）

### C7-A — Read Path

- 表结构 + Retriever + MemoryCard；
- K5-B 将选中 Memory 渲染进 Context（feature flag `memory.read`）；
- Ref expansion 归属校验；
- MemoryInjectionTrace；
- **不做**自动写入、candidate UI。

验收：

- 仅当前 user 的 active Memory 可被检索；
- 新 Session 可收到相关 MemoryCard；
- prior-session 证据仅经显式 expansion；
- 无全历史 Session 扫描 API。

### C7-B — Write / Review

- Extractor + Policy + async job；
- Candidate review UI + CRUD；
- dedup / supersede / expire；
- secret & external-fact 测试集；
- Session 删除级联重评估。

验收：

- 明确长期偏好可 auto-active；
- 推断仅 candidate；
- 网页事实不进 Memory；
- 用户可删改关。

### C7-C — Delegation 联动（与 P11 同期）

- Worker 读 Memory 仅 Lead 授权 + `allowUseInWorker`；
- Worker 禁止 write / review / search store；
- 可选：User Memory Profile、ConsolidationJob（合并 candidate、标记 stale）。

## 14. 测试与评估建议

不迷信单一 benchmark。建议自建 Harness 集：

| 场景 | 期望 |
|------|------|
| 跨 Session 语言/格式偏好 | 检索命中并注入 |
| 用户纠正后 supersede | 旧 preference 不再注入 |
| 调研结论句 | 拒绝写入 |
| 假 API key | blocked |
| Session 删除 | ref 清理 / expire |
| Token budget | 低 importance 先 omitted |

可参考外部数据集做回归：**LoCoMo**、**LongMemEval**（见 [snap-research LoCoMo](https://snap-research.github.io/locomo/)），但产品约束以本文 §5 为准。

## 15. 明确不做（首版）

- project / workspace / org Memory scope；
- 全 transcript episodic 入库；
- 模型 hot-path 自写 Memory；
- Memory 替代 Skills 或 User Rules；
- 向量库 / 知识图谱硬依赖；
- Worker 默认 Memory 访问。

## 16. 参考（业界，非规范）

- 分层与写路径：[LangMem Conceptual Guide](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/)、[Memory in Agents — Philipp Schmid](https://www.philschmid.de/memory-in-agents)
- 独立 Memory 层：[Mem0](https://github.com/mem0ai/mem0)、[Zep / Graphiti 时序图](https://arxiv.org/abs/2501.13956)
- 产品治理：[OpenAI ChatGPT Memory / Dreaming](https://openai.com/index/chatgpt-memory-dreaming/)
- Skills（独立）：[40-c6-skills.md](./40-c6-skills.md)
