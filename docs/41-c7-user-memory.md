# C7 User Memory（专项规范）

> **文档状态**：C7 的**唯一实施依据**（本文件即全部规范）。`17-implementation-plan.md` 仅保留里程碑摘要。
>
> **编号约定**：**C7** 首版闭环（写 Tool + 向量读 + pgvector + Embedding 网关 + Settings）→ **C7-C** Delegation 联动。  
> 原 C7-A/C7-B 文档拆分已合并为 **单一交付阶段 C7**（见 §12）。
>
> **归属**：Memory 子系统（Store / Embed / Retriever / Tool Handler）+ K5（预算、渲染）。与 [C6 Skills](./40-c6-skills.md) 分离，仅共享 Context 编译入口。
>
> **设计立场（2026-03 修订）**：
> - **写**：主 Agent 在对话中调用 **`memory_write` Tool**（类似 Kimi 记忆工具）；内容由模型通过参数给出，服务端门控、落库、**写入时向量化**。
> - **读**：**不**提供读记忆 Tool；每轮 Context 编译前 **向量 Top-K 检索** → Gate → 预算 → K5 渲染 `<user_memory>`。
> - **不做** Run 结束后第二条 LLM Extractor 流水线（避免双轨门控与「记不全」）。
> - **偏可信、可审计、用户可管**；Settings **继续展示已生效记忆列表与条数**（「共 N 条」）。

| 阶段 | 名称 | 摘要 |
|------|------|------|
| **C7** | Memory MVP | pgvector + Embedding API、`memory_write`、向量 Retriever、K5 注入、Settings（含 **共 N 条**） |
| **C7-C** | Delegation | Worker 读 Memory 门控；可选 ConsolidationJob |

## 1. 要解决什么问题

LLM Agent 无原生长期记忆。User Memory 为**同一 user** 提供跨 Session 可复用的偏好与稳定上下文，并在新任务中**按需、有预算**进入编译后的 Context。

```text
User Memory = user-scoped, evidence-backed, user-reviewable, embed-on-write, vector-recall-on-read
```

### 1.1 产品承诺（与用户心智）

| 用户可能理解 | 系统实际承诺 |
|--------------|--------------|
| Settings「已生效的记忆」= Agent **永远知道** | 仅当 **本轮向量检索成功注入** `<user_memory>` 时，模型才「看见」；受相似度、embed 就绪、token 预算约束 |
| 聊天里 Agent 整理的表格 = 已写入长期记忆 | 表格是 **当轮 Working Memory**；**持久化仅当** 本轮/近期 **`memory_write` 成功** 或 Settings 手动写入 |
| 问「你记得什么」 | 模型应依据 **注入块 + Tool 写入结果** 回答；禁止编造未写入内容（可选二期 `memory_list` Tool） |

对外表述：长期记忆 = **可管理的偏好与稳定事实参考**，不是全知档案。

## 2. 架构总览

```text
┌──────────────────────────────────────────────────────────────┐
│                    Lead Agent Loop（单模型）                   │
│  User Message → Model → [ memory_write? ] → Tool Handler      │
└───────────────────────────────┬──────────────────────────────┘
                                │ create/update/delete + embed
                                ▼
                    ┌───────────────────────┐
                    │ PostgreSQL memory_records│
                    │ + embedding (pgvector   │
                    │   或 JSONB fallback)    │
                    └───────────┬─────────────┘
                                │
        每 model round 编译前    │  query embed → Top-K
                                ▼
                    ┌───────────────────────┐
                    │ Memory Retriever       │
                    │ Gate / budget / trace  │
                    └───────────┬─────────────┘
                                ▼
                    K5 → <user_memory> → Model
```

**与 Runtime 的边界**：Run Executor **不** enqueue 记忆抽取 Job。写入 **仅** 来自 `memory_write`、Settings API、用户 accept candidate。

**与 State**：Memory 不复制大段 Artifact；`sourceRefs` 指向 Message / Run / Session 等，ref expansion 规则不变。

**与 Skills**：Skills = 怎么做；Memory = 用户是谁、偏好什么。Memory 不得覆盖 System / Tool Policy。

## 3. Scope 与隔离

```ts
type MemoryScope = 'user';
```

- 每条 Memory 归属 `userId`。不支持 project / workspace / org。
- 新 Session **禁止**扫描全部历史 Session transcript；只能：
  1. 对当前 user 的 **active** Memory 做 **向量检索**；
  2. 按 `sourceRefs` **显式 ref expansion**（同 user、有 budget）。
- **Worker（C7-C）**：默认不读 User Memory；仅 Lead 授权且 policy 允许时注入。

## 4. 什么能进 Memory

### 4.1 鼓励写入

- 用户 **明确**「记住 / 以后都 / 别忘了」。
- 用户 **稳定自述**（身份、常住、职业、语言/格式偏好等），模型判断跨 Session 有用时应调用 `memory_write`。
- Settings **手动新增/编辑**。

### 4.2 建议 candidate（不注入，直至用户 accept）

- 模型 **`storageIntent: inferred`** 且用户当轮 **无** durable 信号（未说记住、非明显自述）；
- 低置信内容（若 Tool 传 `confidence: low`，服务端可直接拒绝）。

首版可简化为：**Tool 成功且通过门控 → 一律 active**；candidate 仅 Settings 手工或二期收紧。

### 4.3 禁止写入（Tool Handler 硬拒绝）

- 网页/调研事实、行情、搜索摘要当作用户偏好；
- Secret / credential（规则 + `secret_suspected`）；
- Raw trace、整段 tool output 副本；
- 单次任务结论、纯 chitchat。

## 5. 类型与状态

```ts
type MemoryKind =
  | 'preference'
  | 'workflow'
  | 'format'
  | 'correction'
  | 'identity_context';

type MemoryStatus =
  | 'candidate'
  | 'active'
  | 'superseded'
  | 'rejected'
  | 'expired';
```

**多条并存**：同一 `kind` 下 **允许多条 active**（如「姓名」与「职业背景」）。**禁止**按 `kind` 整类 supersede。

**Supersede**：仅当 `memory_write` 的 `action: update` 指向明确 `memoryId`，或 dedup 判定为 **同一事实更新** 时，将旧记录标为 `superseded` 并填 `supersedesMemoryId`。

## 6. 数据模型

### 6.1 MemoryRecord

```ts
type MemoryRecord = {
  memoryId: string;
  userId: string;
  kind: MemoryKind;
  title: string;              // Settings 与检索标题，建议 ≤80 字
  summary: string;            // 注入主文案，建议 ≤500 字（对齐 Kimi 单条上限量级）
  status: MemoryStatus;
  confidence: 'low' | 'medium' | 'high';
  freshness: 'fresh' | 'stale' | 'unknown';
  importance: 'low' | 'medium' | 'high';
  sensitivity: 'normal' | 'private' | 'secret_suspected';
  sourceRefs: StateRef[];     // active 必填；由 Tool Handler 注入，模型不可伪造
  policy: { allowAutoInject: boolean; allowUseInWorker: boolean };
  provenance: {
    sourceSessionId: string;
    sourceRunId?: string;
    sourceToolCallId?: string;
    writer: 'memory_write' | 'settings' | 'candidate_accept';
    policyVersion: string;
  };
  supersedesMemoryId?: string;
  embeddingModel?: string;
  embeddedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  useCount?: number;
};
```

**Invariant**：`status === 'active'` ⇒ `sourceRefs.length > 0` 且非 `secret_suspected` 且 embedding 就绪（或 Settings 展示 `indexingStatus: pending`）。

### 6.2 MemoryCandidate（C7 可选）

推断写入或产品收紧时使用；**pending 不注入、不参与向量 active 集**。首版可只做 `memory_records`，candidate 表延后。

### 6.3 PostgreSQL 向量存储

**生产路径**：启用 [pgvector](https://github.com/pgvector/pgvector) 扩展，在 `memory_records` 上存 **document embedding**（与 query 同模型、同维度）。

```sql
-- migration 内（扩展可用时）
CREATE EXTENSION IF NOT EXISTS vector;

-- 列名实现可微调，语义冻结如下：
-- embedding_model  text        -- 如 kinfra-text-embedding-4b（revision 字符串）
-- embedded_at      timestamptz
-- embedding        vector(2560) -- 维度须与 MEMORY_EMBEDDING_DIMENSIONS 一致
```

检索：

```sql
-- 仅 status = 'active' AND user_id = $1 AND embedding IS NOT NULL
ORDER BY embedding <=> $queryVector::vector
LIMIT top_k;
```

**降级路径**（本地无 extension）：`embedding_json jsonb` 存 float 数组 + 应用层 cosine；**不得**静默改读 keyword 主路径。`readyz` 可选报告 `pgvector: ok | fallback_jsonb`。

**Invariant**：换 embedding 模型/revision 后，旧向量视为 `missing_embedding`（Gate omit），需 backfill 脚本重 embed。

### 6.4 MemoryCard / K5 输入

与现协议一致：`MemoryCard` 供 trace；`MemoryContextInput[]` 供 K5 渲染 `<user_memory>`，附 **disclaimer**（参考优先级低于当前用户指令）。

## 7. 写路径：`memory_write` Tool

### 7.1 工具注册

- 协议名：`memory_write`（写入 `AGENT_TOOL_NAMES`）。
- `approval`：首版 `auto_execute`（与 `get_current_time` 同级）；若滥写严重可对 `action: delete` 单独加 approval。
- **Feature flag**：`MEMORY_WRITE` + 用户 Settings「允许 Agent 写入记忆」（与展示开关分离：可读可关写）。

### 7.2 参数 Schema

```ts
type MemoryWriteAction = 'create' | 'update' | 'delete';

type MemoryWriteInput = {
  action: MemoryWriteAction;
  /** update/delete 必填；create 禁止 */
  memoryId?: string;
  /** create/update 必填 */
  title?: string;
  /** create/update 必填；注入与 Settings 展示主文 */
  content?: string;
  kind?: MemoryKind;
  /** 模型自报；服务端可覆盖 */
  storageIntent?: 'explicit' | 'inferred';
  confidence?: 'low' | 'medium' | 'high';
};
```

**组合规则**：

| action | 必填 | 行为 |
|--------|------|------|
| `create` | `title`, `content` | 门控 → dedup（命中则转 update）→ insert active → embed |
| `update` | `memoryId`, `title`, `content` | 归属校验 → supersede 链 → upsert → re-embed |
| `delete` | `memoryId` 或服务端按 title 唯一匹配 | soft delete 或 `status: expired` |

**Tool 返回**（模型可见）：

```ts
type MemoryWriteOutput = {
  ok: boolean;
  action: MemoryWriteAction;
  memoryId?: string;
  status: 'active' | 'candidate' | 'rejected';
  reason?: string;           // rejected 时：secret_suspected | external_fact | duplicate | limit_exceeded | ...
  indexingStatus?: 'ready' | 'pending' | 'failed';
};
```

### 7.3 Handler 流程

```text
memory_write(input)
  → normalize title/content 长度
  → Eligibility（secret / external / userId / sourceRefs 自动挂载当前 message+run）
  → confidence === low → reject
  → dedup（title 归一化 + embedding cosine ≥ dedupThreshold）
  → persist
  → embed（见 §7.4）
  → return MemoryWriteOutput
```

**sourceRefs**（服务端强制）：

```ts
{ refType: 'message', refId, userId, sessionId, runId, relation: 'source' }
```

### 7.4 Embedding 时序

| 场景 | embed |
|------|--------|
| `storageIntent: explicit` 或用户句匹配「请记住」类 pattern | **同步** embed，返回前完成（失败则 `indexingStatus: failed`，记录仍可为 active） |
| 其余 create/update | **异步** embed + 重试；未就绪前 Retriever Gate `missing_embedding` |

文档向量：`buildMemoryDocumentText(title, summary)`；query 与 document 同一 embedding 模型/revision。

### 7.5 模型指令（Tool description + System 摘要）

- 用户明确要求长期记住 → **必须** `memory_write`（`create` 或 `update`）。
- 用户 **多事实自述**（身份、地址、职业等）→ 应写入；可 **一条 content** 含多事实（≤500 字）或 **多条 create**（避免只写出生年丢地址）。
- 用户更正 / 忘记 → `update` / `delete`。
- **禁止**写入搜索结果、一次性任务结论。
- 写入成功后，**同 Run 后续轮次**仍依赖 **向量注入**；Tool 结果仅作确认，不替代读路径。

### 7.6 限额（可调）

建议默认（对齐 Kimi 量级，可 env 覆盖）：

- 每 user **active 条数上限** 50（超出 → reject 或 candidate）。
- 单条 `content` **500 字符**（超出 truncate 或 reject）。

## 8. 读路径：向量 Retriever

### 8.1 原则

- **语义主召回**：embedding cosine；**禁止**用 keyword/regex 作为主 relevance 打分（Gate 布尔规则除外）。
- **不**提供 `memory_search` / `memory_read` Tool 给主 Agent（读为编译器职责）。

### 8.2 请求

```ts
type MemoryRetrievalRequest = {
  userId: string;
  sessionId: string;
  runId: string;
  query: string;              // composeMemoryRetrievalQuery(lastUser, prevUser)
  kinds?: MemoryKind[];
  maxCards: number;           // 默认 8
  tokenBudget: number;        // 默认 ~600 tokens
  retrieveTopK: number;       // 默认 32
  minSimilarity: number;      // 默认 ~0.32，环境可配
  includeStale?: boolean;
};
```

### 8.3 步骤

1. `query.trim()` 空 → 不检索。
2. Query embedding；失败 → trace `queryEmbedFailed`，不注入。
3. 向量 Top-K（pgvector；无扩展时 JSONB + 回退）。
4. 行级 **Gate**：secret、sensitive、disabled policy、stale、无 sourceRefs、**missing_embedding**、kind 过滤。
5. **minSimilarity**；小库可选 `MEMORY_SMALL_SET_INJECT` 绕过阈值（仅 dev/极小 active 集）。
6. 排序：similarity → importance → freshness → confidence → lastUsedAt。
7. 预算裁剪 → `MemoryCard[]` + `MemoryInjectionTrace`（含 `includedSimilarities`、omitted reasons）。
8. 更新 `lastUsedAt` / `useCount`（异步）。

### 8.4 注入优先级

```text
System / Skills
Current User Instruction + Steer
Session Task Frame + Run Facts
<user_memory>（Retriever 结果）
Compaction + Transcript
Tools
```

### 8.5 MemoryInjectionTrace

```ts
type MemoryInjectionTrace = {
  runId: string;
  stepId: string;
  includedMemoryIds: string[];
  includedSimilarities?: Record<string, number>;
  omitted: Array<{ memoryId?: string; reason: string }>;
  tokenEstimate: number;
  queryEmbedFailed?: boolean;
};
```

结构化日志事件：`memory.injection.trace`（info）、`memory.query_embed.failure`、`memory.tool.write`（success/reject）。

## 9. 用户控制面（Settings — 保留现有产品形态）

Web Settings → **记忆** Tab **必须保留**：

| 能力 | 说明 |
|------|------|
| **已生效的记忆** | 列表展示 active 条目（kind 标签、title、summary 摘要） |
| **条数** | 列表标题旁 **「共 N 条」**（N = 当前 user active 计数） |
| **删除** | 单条删除（等价 delete 或 status 变更） |
| **手动新增/编辑** | 走 Settings API，provenance `settings`，同步 embed |
| **开关** | 全局 Memory 读/写 capability（`MEMORY_READ` / `MEMORY_WRITE` + 用户级「允许 Agent 写入记忆」） |
| **indexingStatus** | 未 embed 就绪时展示「索引未就绪」，避免用户以为已可被召回 |
| **待审核（可选）** | candidate 列表 + accept/reject；与「共 N 条」分开展示 |

**不做变更**：用 Settings 列表作为用户管理记忆的主界面；条数统计继续对用户可见。

## 10. API（摘要）

- `GET /api/agent/memories` — active 列表（供 Settings 与条数）。
- `POST/PATCH/DELETE /api/agent/memories/:id` — 手动 CRUD。
- `GET/PATCH /api/agent/memory-settings` — 用户级开关。
- `POST /api/agent/memory-candidates/:id/review` — 若启用 candidate。

公开 config：`capabilities.memoryRead` / `memoryWrite`。

## 11. 配置与环境

### 11.1 功能开关

| 变量 | 含义 |
|------|------|
| `MEMORY_READ` | 启用读路径（Retriever + K5 注入） |
| `MEMORY_WRITE` | 注册 `memory_write` Tool |
| `MEMORY_MIN_SIMILARITY` | 召回 cosine 阈值（默认 `0.32`） |
| `MEMORY_RETRIEVE_TOP_K` | 向量候选数（默认 `32`） |
| `MEMORY_DEDUP_THRESHOLD` | 写入 dedup（默认 `0.92`） |
| `MEMORY_SMALL_SET_INJECT` | active ≤ cap 时 bypass 阈值（**生产默认 false**） |
| `MEMORY_ACTIVE_CAP` | 每 user active 上限（默认 `50`） |

### 11.2 Embedding 网关（必填：生产 / 推荐：本地）

与 Chat 模型 **分离**：Memory 使用 **OpenAI 兼容** `POST {baseUrl}/embeddings`（或网关文档等价路径）。

| 变量 | 含义 |
|------|------|
| `MEMORY_EMBEDDING_BASE_URL` | Embedding HTTP 根地址，如 `https://your-gateway.example/v1`（**无** trailing slash 歧义时实现应 normalize） |
| `MEMORY_EMBEDDING_API_KEY` | Bearer API Key |
| `MEMORY_EMBEDDING_MODEL` | 模型 id，默认 **`kinfra-text-embedding-4b`** |
| `MEMORY_EMBEDDING_DIMENSIONS` | 向量维度，默认 **`2560`**（须与 pgvector 列维一致） |
| `MEMORY_EMBEDDING_TIMEOUT_MS` | 请求超时（默认 `30000`） |

**请求语义（冻结）**：

- Document：`input = title + "\n" + summary`（见 `buildMemoryDocumentText`）
- Query：`input = composeMemoryRetrievalQuery(...)` 的字符串
- 响应：取 `data[0].embedding` float 数组，长度必须等于 `MEMORY_EMBEDDING_DIMENSIONS`

**`embeddingModel` revision**：持久化字段存 **`MEMORY_EMBEDDING_MODEL` 字符串**；Retriever Gate 要求 record.embeddingModel 与当前配置一致，否则 `missing_embedding`。

**本地开发**（仅 `NODE_ENV=development` 且未配置 `MEMORY_EMBEDDING_API_KEY`）：允许 **deterministic 伪向量** 以便无网关跑通链路；**生产禁止**，`MEMORY_READ=true` 且无 Key 时应 fail fast 或 health 告警。

### 11.3 pgvector 与数据库

- Docker/本地 Postgres 镜像需带 pgvector，或启动后 `CREATE EXTENSION vector`。
- 提供脚本：`pnpm --filter @harness/api memory:backfill-embeddings`（对 `embedded_at IS NULL` 的 active 记录重算向量）。

`.env.example` 须包含 §11.1–11.2 变量（见仓库根目录）。

## 12. 分阶段交付

### C7 — Memory MVP（单一阶段，完整闭环）

**存储与向量**

- `memory_records` + pgvector（§6.3）+ migration；
- `MemoryEmbeddingService` 对接 **BASE_URL + API_KEY**；
- 写入/更新后 embed；显式记住 **同步 embed**，其余可 async 重试。

**写**

- `memory_write` Tool（§7）+ 门控 + dedup + sourceRefs 服务端挂载；
- Settings 手动 CRUD（provenance `settings`）；
- **无** Run-terminal Extractor。

**读**

- Retriever（§8）+ K5 `<user_memory>` + InjectionTrace + ref expansion 归属校验。

**UI**

- Settings → 记忆：**已生效的记忆** + **共 N 条**、删除、手动增改、`indexingStatus`、读/写开关（用户级可简化为与全局 capability 一致）。

**验收**（全部满足）

1. 配置 `MEMORY_EMBEDDING_BASE_URL` + `MEMORY_EMBEDDING_API_KEY` 后，Tool 或 Settings 写入 → DB 有向量 → Settings 显示 **共 N 条** 且 `indexingStatus=ready`。
2. 新 Session：用户先「请记住…」或自述 + 模型调 Tool → 再问相关事实 → trace 有 included，context 含 `<user_memory>`。
3. **同 kind 多条并存**；`update` 才 supersede 单条。
4. 调研/secret 写入被拒绝；`MEMORY_READ=false` 不注入。
5. 无「扫描全 Session transcript」API。

### C7-C — Delegation

- Worker 读门控；禁止 Worker 调用 `memory_write`；
- 可选 ConsolidationJob（去重 candidate、标记 stale）。

## 13. 测试场景

| 场景 | 期望 |
|------|------|
| Tool create 后跨 Session 问答 | 向量命中并注入 |
| 只聊天不调 Tool | Settings 条数不变 |
| 同 kind 两条 identity | 均 active，均可能被检索 |
| update 姓名 | 旧姓名 superseded，新姓名 active |
| 调研句 write | Tool reject |
| embed 失败 | Settings indexingStatus 提示 |
| Token budget | trace omitted `budget` |

## 14. 明确不做（首版）

- Run terminal **Extractor** 第二 LLM 流水线；
- 读记忆 **Tool**（主 Agent）；
- 按 **kind** 批量 supersede；
- project/org Memory scope；
- 全 transcript episodic 入库；
- Worker 默认读/写 Memory。

## 15. 参考

- Kimi [记忆空间](https://www.kimi.com/help/features/memory-space)（Tool + 条目管理心智）
- Mem0 / LangGraph Store（embed on write + vector recall）
- Skills（独立）：[40-c6-skills.md](./40-c6-skills.md)
- K5：[39-k5-context-engineering.md](./39-k5-context-engineering.md)
