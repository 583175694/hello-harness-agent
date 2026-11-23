# Agent 设计问题记录

> 每条：**现象 → 证据 → 方案**（无方案则标「待定」）。编号 `#1`–`#9` 固定。

## 速览

| # | 分类 | 问题（一句话） | 方案 |
|:-:|------|----------------|------|
| 1 | 工具面 | 自研 `web_fetch` 被关，Prompt 仍指向它，模型落到第三方 MCP | 已确认 |
| 2 | 工具面 | MCP 直通区是静态切片，与当前任务无关 | 已确认（Pre-loop 向量选优 + 执行感知 Tool LRU） |
| 3 | 上下文 | 压缩触发线过低，且压缩一次的成本接近收益 | 待定 |
| 4 | 上下文 | 前缀不稳定，Prompt 缓存命中率低 | 待定 |
| 5 | 调度 | 同批工具串行、无 URL 去重 | 待定 |
| 6 | 生命周期 | 每 Run 全量 reconcile MCP，无目录缓存 | 待定 |
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
`MCP_DIRECT_CAP=32` 固定直通区，每 Run 同一批，与任务无关。

**证据**

- `deferred_search` 固定切分；`tool-exposure.service.ts:20` 按 **serverName 字母序**，`Tinyfish` 占满 32，`tushareMcp` 285 个全进 deferred。
- 全量 MCP 定义约 **110k token**，cap 不能简单加大。

**方案（已确认）**

1. **架构选择：Pre-loop 内存向量召回**  
   - 摒弃高延迟、占模型轮次、依赖模型主动搜索的 `tool_search` 路径。
   - 复用记忆模块已有 Embedding 能力：MCP 连接时离线预计算工具向量并驻留内存（300 个仅数百 KB）。
   - 用户请求到达时，系统在 Pre-loop 对 Prompt 算一次向量（~100-200ms），内存点积打分（<1ms），直接动态选出最匹配的 Top-N 工具注入 `Direct` 区。
2. **容量硬上限与三级槽位（以 `CAP=24` 为例）**  
   - **Level 0 常驻底座（6~8 个）**：内置核心工具（`bash`, `web_search`, `web_fetch`, `update_plan` 等）永久占位。
   - **Level 1 执行锁定（4~8 个）**：当前 Session 中**被模型真正执行过（Invoked）**的 MCP 工具，锁死不淘汰（解决后续短追问“换一个再查”时丢失工具的问题）。
   - **Level 2 当轮意图补位（动态填满剩余槽位）**：当轮 Prompt 向量召回的候选工具动态填入。
3. **执行感知的 Tool LRU 淘汰机制**  
   - **真调用才续租**：模型实际调用过的工具刷新高优先级；仅被推荐而**未被调用**的工具不刷新租期，下一轮意图漂移直接淘汰出局。
   - 彻底解决多轮会话中 Direct 区工具越积越多导致的无界膨胀与 Token 爆炸。
4. **Prompt Cache 保护纪律（协同 #4）**  
   - Direct 区工具最终序列化输出给模型时，必须按照固定的稳定 Key（如名称字典序）排序，严禁按浮动的相似度打乱前缀顺序，避免击穿 KV-Cache。

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

- `mcp-run-latch.service.ts:31`；`mcp-connection.manager.ts:182,401` → 日志 **4.50s**。

**方案**  
待定。

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