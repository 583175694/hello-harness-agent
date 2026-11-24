# Agent 设计问题记录

> 每条：**现象 → 证据 → 方案**（无方案则标「待定」）。编号 `#1`–`#9` 固定。

## 速览

| # | 分类 | 问题（一句话） | 方案 |
|:-:|------|----------------|------|
| 1 | 工具面 | 自研 `web_fetch` 被关，Prompt 仍指向它，模型落到第三方 MCP | 已确认 |
| 2 | 工具面 | MCP 直通区是静态切片，与当前任务无关 | 已落地（Codex 风格动态 tool_search + 激活控容） |
| 3 | 上下文 | 压缩触发线过低，且压缩一次的成本接近收益 | 待定 |
| 4 | 上下文 | 前缀不稳定，Prompt 缓存命中率低 | 待定 |
| 5 | 调度 | 同批工具串行、无 URL 去重 | 待定 |
| 6 | 生命周期 | 每 Run 全量 reconcile MCP，无目录缓存 | 已落地（SWR 目录缓存 + 并发 reconcile + 执行期容错） |
| 7 | 反馈 | 长时无可见进度，靠事后 nudge 补救 | 待定 |
| 8 | 停止 | 停止靠轮数上限，无「证据已够」判据 | 待定 |
| 9 | 记忆 | 每轮先付 embedding，空召回也全价 | 待定 |

---

### #1 · 工具面 — 网页读取链路主动退化

**现象**  
`web_fetch` 被关，Prompt 仍要求用它；实际走第三方 MCP，慢且结果被 8k 上限大幅截断。

**证据**

- `tool-availability.ts:7` → `false`；`web-fetch/` 链路仍完整。
- `chat.constants.ts:6-8` 仍写「直接用 `web_fetch`」。
- 单 Run：5 次第三方 fetch **75.9s（≈60%）**，37KB 返回后再被砍 **≈80%**。

**方案（已确认）**

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
   - 彻底移除 Run 启动链路上的远程 Embedding，首字前等待由 **22.5s 压回 1s**（0 外部网络耗时）；
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

- `model-catalog.ts:37-40`；实测 `43250 → 38101（88%）`，**7.51s**。

**方案**  
待定。

---

### #4 · 上下文 — 前缀不稳定，缓存被击穿

**现象**  
压缩、记忆块位置、随机 fileId、指针不落库、全量 reasoning 回放等导致前缀漂移。

**证据**

- `context-engineering.service.ts:232`、`files.service.ts:418`、`model-transcript-integrity.ts:14` 等。
- 命中率 **4/54/5/45/68%**，整体 **36%**。

**方案**  
待定。

---

### #5 · 调度 — 工具串行且无去重

**现象**  
工具批逐个 `await`；重复 URL 重复付费。

**证据**

- `agent-runtime.service.ts:1109` 起串行。

**方案**  
待定。

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

- `agent-runtime.service.ts:302`；日志召回 **0** 张。

**方案**  
待定。