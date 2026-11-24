# Agent 设计问题记录

> 每条：**现象 → 证据 → 方案**（无方案则标「待定」）。编号 `#1`–`#9` 固定。

## 速览

| # | 分类 | 问题（一句话） | 方案 |
|:-:|------|----------------|------|
| 1 | 工具面 | 自研 `web_fetch` 被关，Prompt 仍指向它，模型落到第三方 MCP | 已落地 |
| 2 | 工具面 | MCP 直通区是静态切片，与当前任务无关 | 已落地 |
| 3 | 上下文 | 压缩触发线过低，且压缩一次的成本接近收益 | 已落地（160k 触发线 + 20% 净收益护栏） |
| 4 | 上下文 | 前缀不稳定，Prompt 缓存命中率低 | 已落地（128k 按需折叠 + `tools[]` 只增末尾追加 + 估算/记忆稳态） |
| 5 | 调度 | 同批工具串行、无 URL 去重 | 已落地（只读受控并发 cap=4 + 同 Run 只读幂等去重 + 严格保序） |
| 6 | 生命周期 | 每 Run 全量 reconcile MCP，无目录缓存 | 已落地（SWR 目录缓存 + 并发 reconcile + 执行期容错） |
| 7 | 反馈 | 长时无可见进度，靠事后 nudge 补救 | 待定 |
| 8 | 停止 | 停止靠轮数上限，无「证据已够」判据 | 待定 |
| 9 | 记忆 | 每轮先付 embedding，空召回也全价 | 已落地（空库 0ms 短路 + 查询 2.5s 超时 + 60s 熔断兜底） |

---

### #1 · 工具面 — 网页读取链路主动退化

**现象**  
`web_fetch` 被关，Prompt 仍要求用它；实际走第三方 MCP，慢且结果被 8k 上限大幅截断。

**证据**

- `tool-availability.ts:7` → `false`；`web-fetch/` 链路仍完整。
- `chat.constants.ts:6-8` 仍写「直接用 `web_fetch`」。
- 单 Run：5 次第三方 fetch **75.9s（≈60%）**，37KB 返回后再被砍 **≈80%**。

**方案（已落地 · `1f09272`）**

1. **打开 `web_fetch`**：`tool-availability.ts:7` → `true`。
2. **直连链路**：guard → LRU → 直连（`transportTimeoutMs` **6s**/URL，`20s` 改掉）→ 既有 `web-fetch/` 管线；单项失败返回稳定 `code` + `detail`（超时、HTTP 错误、类型、正文空、与 query 不相关等）。
3. **JSON 直通**：`allowedContentTypes` 纳入 `application/json`；成功响应仿 `text/plain` 进 normalizer → chunker → ranker；补/改单测（原 JSON fixture 期望成功）。
4. **Prompt**（`chat.constants.ts`）：说明 `web_fetch` 用于公开、可直连的 HTML 与 JSON API；补充原则——需渲染、强风控或直连失败时，可再选 tools 里其它抓取 / 浏览器能力。
5. **编排**：`web_fetch` 之后是否调用 MCP 或其它工具，由模型根据失败信息与当前 tools 描述决定。

**实测基线（2026-11-20）** · 生产 `175.178.23.83` vs 本机，评 #1 收益：

| 目标 | 生产 | 本机 | 备注 |
|------|------|------|------|
| `push2*.eastmoney.com` | 0.15–0.18s / 200 | 0.18–0.46s / 200 | JSON；实现 JSON 直通后可走内置链路 |
| `news.qq.com/rain/...` | 0.06s / 501 | 0.08s / 501 | WAF |
| `api.github.com` | 1.26s / 200 | 0.61s / 200 | |
| `en.wikipedia.org` | 12s 超时 | 2.35s / 200 | 生产境外不通 |

境内 RTT **0.15–0.45s**；75.9s 主要来自模型反复调第三方 MCP（对照 #1 目标）。

---

### #2 · 工具面 — MCP 目录暴露是静态切片

**现象**  
`MCP_DIRECT_CAP=32` 固定直通区按 `serverName` 字母序死切，与任务无关（`Tinyfish` 占满 32，`tushareMcp` 285 个全被延后）；首字前等待长，多轮工具无界累积膨胀（实测 54→62→70 个）。

**证据**

- `deferred_search` 固定切分；`tool-exposure.service.ts:20` 按 **serverName 字母序**，`Tinyfish` 占满 32，`tushareMcp` 285 个全进 deferred。
- 全量 MCP 定义约 **110k token**，cap 不能简单加大。
- 实测预选方案（2026-11-23）：线上算 328 个工具向量导致 `MCP latch` 耗时 **22.43s**；且多轮后工具从 54 飙到 70 个，上下文再次膨胀。

**方案（已落地 · 2026-11-24）**

1. **零冷启动延迟：全量 Deferred + 纯本地内存 BM25 检索**  
   - 除显式白名单（`enabledTools`）外，所有 MCP 工具默认归入 `deferred`，仅内置核心工具进 `tools[]`（首轮仅 ~30 个工具，模型注意力极度集中，Token 节省 85%+）；
   - 依赖 Host 本地内存 BM25 检索（双语 2-gram + Exact Match 强保底），检索耗时仅 **< 5ms**。
2. **能力感知声明（System Capability Hint）**  
   - 在 System Prompt 动态注入紧凑的 MCP 服务能力纲要（Server 级摘要，仅消耗 ~50 token）：  
     `"MCP Services: tushareMcp (financial/stock/index data), Tinyfish (web automation). Use tool_search to discover tools."`
   - 解决通用模型（如 DeepSeek）“不知道系统有哪些生态工具”的认知盲区，精准激发自然语言检索。
3. **精准检索物化与同轮激活（Materialization & Same-Turn Execution）**  
   - 模型通过思考链生成高精度专业检索词（如 `index daily quotes`，比用户模糊 Prompt 精准 10 倍）；
   - `tool_search` 限制默认返回数（`limit: 4~6`，防止单次搜出冗余 Schema）；
   - 同轮多工具调用支持：当批次内 `tool_search` 优先执行并立即写入 `activatedTools`，同轮随后的具体 MCP 调用不被拦截。
4. **执行感知控容与淘汰（防多轮 54→70 膨胀）**  
   - `activatedTools` 设定硬上限（如 `MAX_ACTIVATED = 8`）；
   - **真调用才留存**：上一轮被 `tool_search` 召回但模型未真正调用的工具，在下一轮自动失效移出 `tools[]`；只有真正被执行过的工具才在会话中锁定留存；
   - 暴露工具按 `publicName` 字典序稳定输出，保住 Prompt Cache（防 Issue #4）。

**实测验证（2026-11-24 · `6a3fe10`）**

| 指标 | 改造前（32 静态直通） | 改造后（全量 Deferred） |
|------|----------------------|------------------------|
| 首轮暴露工具数 | 54 个（32 未用 Tinyfish） | **22 个**（0 冗余 MCP） |
| 首轮 `promptTokens` | 21,114 | **6,111**（-71%） |
| 首轮 Cache 命中率 | 24% | **92%** |
| 整次 Run 压缩 / 总耗时 | 1 次 / 64.43s | **0 次 / 20.95s** |

---

### #3 · 上下文 — 压缩策略失效

**现象**  
1M 窗口下 40k 即压；一次压缩 ~7.5s 全模型调用，压完仍贴近触发线。

**证据**

- `model-catalog.ts:37-40`；实测 `43250 → 38101（88%）`，**7.51s**；27 轮长任务（`8fb56298`）第 6 轮 `41069 → 38941（95%）`，耗时 **5.14s**，且当轮缓存命中率直接跌至 **2%**。

**方案（已落地 · 2026-11-24）**

1. **拉高压缩触发线**：`DEEPSEEK_COMPACTION_TRIGGER_TOKENS` 由 `40_000` 调整至 **`160_000`**（约占 566k 输入预算的 28%），避免常规 20–30 轮长任务在远未接近预算时过早压缩。
2. **净收益护栏**：`ContextEngineeringService.compileRound()` 压缩完成后校验净缩减比例；若未超 `promptBudget` 且净缩减不足 **20%**，放弃本次压缩并保留原前缀，防止花 5 秒仅省几个百分点还击穿缓存。

---

### #4 · 上下文 — 前缀不稳定，缓存被击穿

**现象**  
压缩、记忆块位置、随机 fileId、指针不落库、全量 reasoning 回放等导致前缀漂移。

**证据**

- `context-engineering.service.ts:38,117,232,813,1018`、`activated-tool-pool.ts`、`tool-exposure.service.ts:69`、`model-transcript-integrity.ts:14`。
- 27 轮长任务实测（`8fb56298`）：整体命中率仅 **43%**（`280,832 / 659,645`），而前缀稳定轮（R22/R24/R27）命中率高达 **97%–99%**；主要击穿点为每轮无条件折叠旧工具结果、`tools[]` 跨轮淘汰与中间插入、记忆块头部漂移及 `reasoning_content` 漏估（估算 24.7k vs 实际 39.1k）。

**方案（已落地 · 路线 A · 2026-11-24）**

1. **旧工具结果按需折叠（取代每轮强制改历史）**  
   - `compileRound` 不再在每轮无条件调用 `collapseOldToolResults(messages, sessionId, 3)`；仅当 `estimatedInputTokens >= 128_000`（压缩线 160k 的 80%）时才对历史旧工具结果执行折叠外置；
   - 常规长任务（含收尾 HTML 生成与导出）全程保持历史消息不可变，既保住 **90%+ KV-Cache 命中**，又省掉每轮 200ms–2.4s 的外置落盘开销。
2. **稳住 `tools[]` 前缀（只增不减 + 末尾追加）**  
   - 单 Run 内 `ActivatedToolPool` 改为**只增不减**（取消跨轮未调用淘汰，硬上限调为 **`12`**，总暴露工具恒定 $\le 34$）；
   - `buildMcpDefinitions` 对 Direct 工具保持字典序，新激活的 MCP 工具**按激活先后顺序追加到数组末尾**（不再插在中间破坏 `tools[]` 前半段缓存），同时保留原生 Function Call 的 100% 参数 Schema 准确率。
3. **补齐 `reasoning` 估算与记忆块稳态**  
   - `toTokenizerMessage` 将带 `toolCalls` 的 `assistant.reasoning` 纳入 token 估算，实测误差收敛至 `< 3%`（76.2k vs 78.2k）；
   - Run 内记忆检索结果在首轮冻结（仅 query 变更如 steer 时重查），消除跨轮召回波动导致的 `messages[1]` 前缀漂移与重复 embedding 延迟。

**实测验证（2026-11-24 · `066b2177`）**

| 指标 | 优化前（`8fb56298`, 27 轮） | 优化后（`066b2177`, 12 轮） |
|------|----------------------------|----------------------------|
| 整体 Prompt 缓存命中率 | 43%（280k / 659k） | **74%**（430k / 580k，稳态轮 88%–99%） |
| 过早压缩次数 | 1 次（R6 41k，耗时 5.14s，命中跌至 2%） | **0 次**（触发线 160k） |
| Token 估算误差 | ~14k（漏算 reasoning） | **2.5%**（76.2k vs 78.2k） |
| 记忆检索次数 | 每轮重查 | **1 次/Run**（594ms，占比 0%） |

---

### #5 · 调度 — 工具串行且无去重

**现象**  
工具批逐个 `await`；重复 URL 重复付费。

**证据**

- `agent-runtime.service.ts:1109` 起串行。

**方案（已落地 · 2026-11-24）**

1. **同批只读受控并发（`TOOL_BATCH_MAX_CONCURRENCY = 4`）**：`tool-batch-scheduler.ts` 对免审批只读工具（`web_search`、`web_fetch`、`read_file`、`read_file_lines`、`search_file`、`get_current_time`、`job_list` 及 `auto_execute` MCP 工具）按连续分段并发执行；`tool_search` 维持先行激活，写/副作用/审批类工具维持串行。
2. **严格保序**：复用 `PendingToolResult` 与 `emitPendingToolEventsInCallOrder` / `sortPendingToolResultsByCallOrder`，前端思维链、Workbench 步骤与喂给模型的 `messages[]` 严格保持模型原始声明顺序。
3. **同 Run 只读幂等去重**：对非时间敏感的只读工具按 `hashCanonical(toolName, toolInput)` 维护 Run 级缓存（含同批 in-flight 复用），重复查询直接复用成功结果；失败/取消结果不缓存以保留重试能力。
4. **批耗时口径校准**：工具批次耗时按真实墙钟耗时记录，避免并发时重复累加。

---

### #6 · 生命周期 — MCP 每 Run 全量 reconcile

**现象**  
每 Run 串行 `listTools`，无目录缓存。

**证据**

- `mcp-run-latch.service.ts:31`；`mcp-connection.manager.ts:142,182,401` → 实测日志 **4.50s–6.56s**（其中 `Tinyfish` 单次 `listTools` 占 4–5s，且多 Server 串行执行、每次重算全量 token 估算耗时 ~400ms）。

**方案（已落地 · 2026-11-24）**

1. **Run Latch 默认走 SWR 目录缓存 + 配置指纹校验**  
   - `reconcile(userId, { force?: boolean })` 对比 DB 启用配置指纹（`configFingerprint`：含启用 server 列表、url、enabled/disabledTools、`updatedAt`）。
   - **指纹未变 + 已连上 + 在 TTL 内（如 5 分钟）**：直接跳过 `listTools`，**0ms 返回现有内存快照**（连同 `estimatedTokens` 一并按 generation 缓存，省掉 ~400ms 重算）。
   - **指纹未变但 TTL 过期（SWR）**：本次 Run 仍直接用旧快照秒开，同时触发**后台异步刷新**（single-flight 去重，防止并发 Run 重复刷），刷完后原子替换 `PublishedCatalog` 供下一次 Run 使用。
   - **首次冷启动 / 配置指纹变更 / Settings 保存 / `mcp_add_server`**：走 `force: true` 同步刷新，保证配置修改即时生效。
2. **多 Server 并发拉取（`Promise.all`）**  
   - 真正需要 reconcile 时，各 Server 并发连接与 `listTools`，冷启动耗时从「总和」降到「最慢单个 Server」。
3. **执行期容错保底**  
   - 若缓存期间远端 MCP 重启导致工具调用报连接异常，执行层触发单 Server 重连并标记该用户缓存失效，下一次自动刷新。

**实测验证（2026-11-24）**

| 指标 | 优化前（每 Run 串行 reconcile） | 冷启动（`cache=sync` 并发） | 热 Run（`cache=hit`） |
|------|--------------------------------|---------------------------|-----------------------|
| MCP latch 耗时 | 6.56s | 5.10s（Tinyfish 4.64s ∥ tushare 1.01s） | **45ms（提速 145 倍）** |
| Run 启动到模型循环 | 6.63s | 5.20s | **96ms** |
| 全量 Token 估算 | 437ms | 437ms | **0ms（命中缓存）** |
| 首轮 Reasoning / Cache 命中 | 1.08s / 24% | 887ms / 95% | **710ms / 97%** |

---

### #7 · 反馈 — 长时黑屏

**现象**  
正文首见 **117.58s**；nudge 在第 10 轮才插。

**证据**

- 首条推理 **4.15s**；`runtime-policy.ts:26` `deliveryNudgeAfterRounds: 10`。

**方案**  
待定。

---

### #8 · 停止 — 仅靠轮数上限

**现象**  
40 轮调查 / `agentToolMaxCalls=40`，无证据饱和判据。

**证据**

- 各 runtime 常量，无饱和度检测。

**方案**  
待定。

---

### #9 · 记忆 — 先 embedding 后筛选

**现象**  
每轮远程 embedding ~500ms，召回 0 仍全价。

**证据**

- `agent-runtime.service.ts:302`、`memory.retriever.service.ts:53`、`memory.constants.ts:17`；日志召回 **0** 张；实测 `565ec01b` 在未启 embedding 服务时首轮硬卡 **30.02s**（占总耗时 16%，首字延迟拖至 31.46s）。

**方案（已落地 · 极简兜底 · 2026-11-24）**

暂不改动记忆核心业务逻辑（留待后续重构），仅在检索入口加三层轻量化兜底：
1. **空库 0ms 短路**：`MemoryRetrieverService.retrieve` 先查 `repository.countActive(userId)`，为 0 时直接返回空结果，不发起远程 embedding。
2. **读写超时分离**：`MemoryEmbeddingService.embedQuery` 使用独立紧超时 `queryEmbeddingTimeoutMs = 2_500ms`（后台写入 `embedDocument` 保持 `30_000ms`），杜绝单次检索卡死首字 30 秒。
3. **查询轻量熔断**：`embedQuery` 连续失败 **2 次**后开启 **60s 冷却熔断**（冷却期内 0ms 快速降级为空召回，60s 后自动半开探测恢复）。（叠加 `#4` 中已落地的 Run 级记忆冻结，同 Run 内不再每轮重复检索。）
