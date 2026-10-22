# Mobile Agent API 联调方案与规划

> 文档类型：**联调 Runbook + 里程碑验收**（可执行清单，不替代产品契约）  
> 文档状态：**静态 UI 已收口；P0–P2 联调按本文推进**  
> 最后更新：2026-10-21  
> 关联：[36-mobile-agent-frontend.md](./36-mobile-agent-frontend.md)（Parity 矩阵 §4、工程里程碑 §13）、[11-api-protocol.md](./11-api-protocol.md)、[26-connection-durable-agent-loop.md](./26-connection-durable-agent-loop.md)、[19-agent-frontend.md](./19-agent-frontend.md)、[implementation-status.md](./implementation-status.md) § L6  
> 范围：**`apps/mobile` 生产路径与 Harness API（4318）端到端联调**；`/preview/*` 与 fixture 仍服务 UI 回归，见 [apps/mobile/docs/ui-regression-checklist.md](../apps/mobile/docs/ui-regression-checklist.md)。

---

## 1. 联调目标与边界

### 1.1 目标

| 维度 | 说明 |
| --- | --- |
| **产品** | Mobile 与 Web `/agent` 使用 **同一 API、同一 Snapshot/SSE 语义**；最终 Release 以 [36 §4](./36-mobile-agent-frontend.md#4-全功能-parity-矩阵验收清单) 每一 ID 可演示或自动化覆盖为准（[36 §14](./36-mobile-agent-frontend.md#14-验收标准release-gate)）。 |
| **MVP（先跑通）** | 配置 API → Session CRUD → 发 Run → 流式 text + 内联 tool_activity → Cancel → 冷启动 Snapshot 恢复（**P1 + P2**，文件清单见 [36 §13.4](./36-mobile-agent-frontend.md#134-p1p2--最小可聊文件清单与验收)）。 |
| **协作方式** | 双端对照：同一 `sessionId` / `runId` 下 Mobile 与 Web 以服务端 Snapshot 为事实源。 |

### 1.2 本阶段明确不做

与 [36 §13.4](./36-mobile-agent-frontend.md#134-p1p2--最小可聊文件清单与验收) 一致，在 **P2 完成前** 仍可用 fixture 或占位：

- OAuth、多租户、Mobile 本地跑 NestJS/PostgreSQL  
- P2 内：Markdown/CoT 真渲染、Workbench 真数据、HITL、`controlRun` 全量、附件上传 API、MCP Settings 真 CRUD  
- Maestro 全量、推送、iPad 并排硬化（**P8**，不阻塞首次联调）

### 1.3 P2 联调收口标准（MVP Done）

1. 同一 Session、同一 Run：Mobile 与 Web 的 **conversation block 顺序、tool_activity 状态** 与服务端 Snapshot 一致。  
2. SSE replay **不重复** UI item；event cursor 严格单调（[26-connection-durable-agent-loop.md](./26-connection-durable-agent-loop.md)）。  
3. 切换 Session **不串** active Run；并行 Session 的 pending 隔离（M-SES-7）。  
4. `pnpm check` 含 mobile typecheck；共享包 reducer 单测绿（[36 §13.4 测试表](./36-mobile-agent-frontend.md#134-p1p2--最小可聊文件清单与验收)）。

---

## 2. 当前基线（2026-10-21）

| 项 | 状态 |
| --- | --- |
| Stitch v3、`/preview/*`、`ui-catalog` | 已落地 |
| Settings：API URL / 主题 / 字号（AsyncStorage） | 已落地 |
| Memory / MCP Settings | **API CRUD**（`memory-api-provider`、`use-mcp-servers`） |
| 生产 `ChatScreen` | **`AgentHostProvider` 生产路径**；`/preview/*` 仍 fixture |
| 共享包 | `agent-client`、`agent-conversation`、`agent-run-state`、`agent-projection` 已落地 |
| Web `observeRun` | 共享 `@harness/agent-conversation`；Web reducer 纯函数 |
| Mobile workspace 依赖 | 已依赖 `@harness/agent-protocol` 与 workspace client 包 |

**联调启动前 checklist**（P0–P7 工程已接线；**§14 Release Gate** 仍待 dev build + Maestro E2E + 真机签字）：

- [x] `packages/agent-client` 与 Web HTTP/SSE 对齐；可对 `4318` 联调  
- [x] Web 迁包后 `pnpm check` 绿（含 lint/typecheck/test/build）  
- [x] Mobile 依赖 workspace 包；`pnpm --filter @harness/mobile typecheck` 绿  
- [x] 生产路径默认 API；Session Drawer 真列表  
- [x] [implementation-status.md](./implementation-status.md) L6 小节已更新  

---

## 3. 环境与前置条件

### 3.1 后端与数据

```bash
pnpm dev                              # Web 4317 + API 4318 + DB
curl -s http://127.0.0.1:4318/readyz  # ready 后才应启用 Composer（M-SVC-1）
curl -s http://127.0.0.1:4318/healthz
```

- PostgreSQL 本机可用；`.env` 含有效模型 Key（与 Web 联调策略一致）。  
- 需验证 Sandbox/bash：按 [33-c3-agent-sandbox-cloud-execution.md](./33-c3-agent-sandbox-cloud-execution.md) 配置（**P5+** 重点验 Terminal 投影）。

### 3.2 Mobile 启动

**Native 开发构建（Maestro / `com.harness.agent`）**：Expo SDK 57 需 **Xcode ≥ 26.4**（`npx expo-doctor`）；低于此版本会在 `ExpoModulesJSI` xcframework 阶段因 Swift 6.2 失败。

- 本机 Xcode 满足：`cd apps/mobile && npx expo run:ios`（`pnpm ios:dev-build`）
- 本机 Xcode 不足：**EAS 模拟器包** — `eas login` → `pnpm ios:simulator:eas` → `pnpm ios:simulator:install <.tar.gz>` → `pnpm test:maestro:e2e`（见 [ios-dev-build.md](../apps/mobile/docs/ios-dev-build.md)）

**Metro**：

```bash
pnpm dev                              # API + Web（4318）
pnpm dev:mobile                       # 开发构建：`expo start --dev-client`（Maestro / API 联调）
pnpm --filter @harness/mobile ios     # Expo Go（不能跑 Maestro）
```

### 3.3 API Base URL（M-SVC-3）

| 场景 | `apiBaseUrl`（Settings） |
| --- | --- |
| iOS 模拟器 | 可空或 `http://127.0.0.1:4318` |
| Android 模拟器 / 真机 | 开发机 **LAN IP**，如 `http://192.168.x.x:4318` |
| 可选 | Tailscale 等内网；生产方向 HTTPS 反代（[36 §7.5](./36-mobile-agent-frontend.md#75-真机-api-连接) ATS） |

**禁止**在真机使用 `localhost` 指向开发机 API。

### 3.4 质量门禁（每个 PR / 阶段）

```bash
pnpm check
pnpm test
pnpm test:integration    # 不替代 Mobile 手工联调，但防 API 协议回归
```

静态 UI： [ui-regression-checklist.md](../apps/mobile/docs/ui-regression-checklist.md)。  
**策略**：`/preview/*` 保留 fixture；生产路由 P1 起接 API。

---

## 4. 分阶段联调规划

里程碑顺序与 [36 §13.2](./36-mobile-agent-frontend.md#132-工程里程碑)、PR 链 [36 §13.6](./36-mobile-agent-frontend.md#136-建议实施顺序pr-链) 一致。

```text
P0 共享包 → P1 连接+Session → P2 Run+SSE → P3 Composer 全量 → P4 HITL
  → P5 Workbench → P6 Artifact/Report → P7 MCP Settings → P8 推送/Maestro/硬化
```

### 4.1 P0 — 共享客户端与 Run 观察（联调前置）

**目的**：Mobile 与 Web 只消费一套 HTTP/SSE/reducer，避免双份逻辑漂移（[36 §13.3](./36-mobile-agent-frontend.md#133-p0--共享包切分文件清单)）。

| 工作项 | 产出 | 联调验证 |
| --- | --- | --- |
| 补齐 `@harness/agent-client` | `createAgentClient`、`readiness`、`sessions`、`runs`、`sse.subscribeRun` | 对 `4318` 调 `readyz`、`listSessions` |
| Run 观察与 reducer | Web 使用 `agent-run-state` + 共享 `observeRun`（或等价） | Web E2E 无回归 |
| Mobile 依赖 | `@harness/agent-protocol`、`agent-client`、`agent-conversation` 等 | mobile typecheck |

**完成标志**：Web `pnpm check` 绿；Mobile 可 import 并调用 `getReadiness()`（UI 可尚未接）。

**参考工作量**：约 3–5 人日（1 名主力 + 0.5 Web 迁包）。

---

### 4.2 P1 — 连接 + Session Drawer

**API**：[36 §4.1–§4.2](./36-mobile-agent-frontend.md#41-壳层与服务)（M-SVC-1/2，M-SES-1～5）。

| 方法 | 路径 | 验收 ID |
| --- | --- | --- |
| GET | `/readyz` | M-SVC-1 |
| GET | `/api/agent/config/public` | M-SVC-2（P1 可先读模型列表） |
| CRUD | `/api/agent/sessions` | M-SES-1～5 |

**工程文件**：[36 §13.4 P1 表](./36-mobile-agent-frontend.md#p1--连接--session-drawer)。

#### P1 手工联调用例

| # | 步骤 | 期望 |
| --- | --- | --- |
| 1 | Settings 改 API URL → 杀进程重进 | URL 持久化（UI 清单 #18） |
| 2 | API 未启动 | ServiceBanner 不可用 + 重试；Composer 禁用 |
| 3 | API ready | Drawer 列表与 Web Sidebar 条数、标题、置顶顺序一致 |
| 4 | 新建 / 重命名 / 置顶 / 删除 Session | Web 刷新后一致 |
| 5 | 切换 Session | 加载 `GET session` 历史消息（可无 active Run） |

**完成标志**：[36 §13.4 P1 验收](./36-mobile-agent-frontend.md#p1--连接--session-drawer) — 改 URL → ready → Drawer 与 API 一致 → CRUD 生效。

**参考工作量**：约 3–4 人日。

---

### 4.3 P2 — Run + SSE + 最小 Composer（首次端到端核心）

**API**：[36 §4.3–§4.4 子集](./36-mobile-agent-frontend.md#43-run-与-connection-durable)。

| 能力 | API / 行为 | 验收 ID |
| --- | --- | --- |
| 创建 Run | `POST .../sessions/:id/runs`（idempotencyKey；P2 reasoning 可固定 `off`） | M-RUN-1 |
| Snapshot | `GET /api/agent/runs/:id` | M-RUN-2 |
| SSE | `GET .../runs/:id/events` + `Last-Event-ID`；RN 使用 `fetch` + `ReadableStream`（与 Web 相同） | M-RUN-3 |
| 取消 | `POST .../cancel` | M-RUN-4 |
| 连接态 | `idle \| connecting \| live \| reconnecting \| offline` | M-SVC-4 |

**UI 范围**：Composer 仅 `new-run` + `disabled`；assistant 正文可先 **纯 Text**（Markdown P3）；Workbench 仍 fixture。

**工程文件**：[36 §13.4 P2 表](./36-mobile-agent-frontend.md#p2--run--sse--最小-composer)。

#### P2 手工联调用例（建议 Web + 模拟器并排）

| # | 步骤 | 期望 |
| --- | --- | --- |
| 1 | 发简单问答（尽量不触发工具） | user 落库；assistant 流式增长 |
| 2 | 发触发 `web_search` 类任务 | `text → tool_activity → text` 顺序与 Web 一致（M-CONV-3） |
| 3 | Run 中 Stop | cancelling → cancelled；Web 同 Run 一致 |
| 4 | Run 中切 Session 再切回 | 不串 Run；续订或 Snapshot 对齐（M-SES-7） |
| 5 | 杀 App → 再进同一 Session | Snapshot 恢复进行中或终态 Run（M-RUN-6） |
| 6 | 断网约 10s 再连 | reconnecting → live；无 duplicate block（M-RUN-7） |
| 7 | 快速双击发送（若已实现防抖） | 单 Run（幂等键） |

**推荐测试 prompt（示例）**

- 无工具：`用一句话介绍你自己。`  
- 有工具：`搜索今天 Harness 项目相关的公开新闻并总结三点。`（以环境实际 tool 为准）

**自动化（与 P2 同步，不挡首次联调）**

- `packages/agent-conversation` / `agent-run-state`：`run-reducer.test.ts`  
- `apps/mobile/.../map-conversation-to-mobile.test.ts`（块顺序）  
- Maestro `apps/mobile/maestro/p2-smoke.yaml`（见同目录 `README.md`）：**P8 真机签字前跑通**

**完成标志**：[36 §13.4 P2 验收](./36-mobile-agent-frontend.md#p2--run--sse--最小-composer) — 发消息 → 流式 + tool 行 → Cancel → 冷启动恢复。

**参考工作量**：约 5–8 人日。

---

### 4.4 P3 — Composer 全量

模型 / reasoning / 附件（C1 API）/ 粘贴 / Follow-up Queue / Plan 浮卡（真 `PlanSnapshot`）/ Skill mention（`skillNames` 若 API 已支持）。

**联调重点**：M-CMP-*；`GET /api/agent/config/public` capability 禁用；与 Web Composer 模式 parity。

**参考工作量**：约 5–7 人日。

---

### 4.5 P4 — HITL

`POST .../commands`：`respond` / `approve` / `reject` 等；Clarification、Tool approval 接真 interrupt（M-CMP-5/6）。

**联调脚本**：可复用 Web 已验路径 — 审批前无 Tool Activity → approve 只执行一次 → reject 不执行工具（见 [implementation-status.md](./implementation-status.md) K3 验收记录）。

**参考工作量**：约 4–6 人日。

---

### 4.6 P5–P6 — Workbench + 交付物

| 阶段 | 内容 | 联调要点 |
| --- | --- | --- |
| **P5** | 动态 Tab、`FOCUS_WORKBENCH_TARGET`、follow/pinned、Activity/Sources/Artifact 真投影 | 点 tool_activity **3s 内**定位 Workbench（[36 §14.5](./36-mobile-agent-frontend.md#14-验收标准release-gate)）；仅检索无文件时隐藏「文件」Tab（UI 清单 #16） |
| **P6** | Artifact revise/restore、Report Reader、Bash Terminal 真流 | [31-c2](./31-c2-artifact-and-report-generation.md)、[33-c3](./33-c3-agent-sandbox-cloud-execution.md) |

**参考工作量**：约 8–12 人日。

---

### 4.7 P7–P8 — Settings MCP、推送、硬化

- **P7**：MCP 与 [35-c4-mcp-client.md](./35-c4-mcp-client.md) 同 API；Mobile 修改后 Web Settings 可见（[36 §14.6](./36-mobile-agent-frontend.md#14-验收标准release-gate)）。Memory 从本地 fixture 切 C7 API（[41-c7-user-memory.md](./41-c7-user-memory.md)）。  
- **P8**：AppState 后台断 SSE、前台 Snapshot+续订（[36 §7.3](./36-mobile-agent-frontend.md#73-appstate)）；本地通知（§7.4）；Maestro；FlashList 性能；iPad 并排。

---

## 5. 联调组织与节奏

### 5.1 角色（小团队可合并）

| 角色 | 职责 |
| --- | --- |
| 协议 / 包 | P0 `agent-client`、SSE 帧、`ProblemDetails`（M-SVC-5） |
| Mobile 壳 | Provider、hooks、fixture→真数据、`map-conversation-to-mobile` |
| 后端 on-call | readyz、Run 卡住、SSE 断流、Sandbox |
| Web 对照 | 同一 session/run 抓 Snapshot JSON diff |

### 5.2 联调周日常

1. **晨会 ~10min**：阻塞项（网络、seq gap、reducer）。  
2. **固定窗口**：后端 `pnpm dev` 常开；共享文档记录 **Session UUID + Run UUID**。  
3. **缺陷分级**：P0 数据错/串 Session；P1 流式/连接；P2 纯 UI。  
4. **回归**：每合 PR 跑 **§4.3 P2 用例 1–6** + UI 清单中与 Drawer/Composer 相关项。

### 5.3 问题排查速查

| 现象 | 优先查 |
| --- | --- |
| 真机连不上 | URL、防火墙、是否误用 `localhost` |
| 流式不动 | SSE 是否被缓冲；AbortController 是否误 abort |
| UI 块重复 | `Last-Event-ID`、reducer duplicate seq |
| 与 Web 不一致 | 先比 `GET /api/agent/runs/:id` JSON，再查 projection |
| Composer 不可用 | `readyz`、public config、历史 reasoning 不兼容（M-CMP-12） |

### 5.4 Snapshot 对照命令（示例）

```bash
SESSION_ID="<uuid>"
RUN_ID="<uuid>"
curl -s "http://127.0.0.1:4318/api/agent/runs/${RUN_ID}" | jq '.conversationBlocks, .workbench' 
curl -s "http://127.0.0.1:4318/api/agent/sessions/${SESSION_ID}" | jq '.messages | length'
```

（字段名以 [11-api-protocol.md](./11-api-protocol.md) 与当前 API 为准。）

---

## 6. 建议时间线（参考）

假设 **1 名主力 Mobile + 0.5 名包/Web 迁移**，静态 UI 已完成：

| 周 | 里程碑 | 可演示 |
| --- | --- | --- |
| W1 | P0 + P1 | Settings 连 API；Session 与 Web 同步 |
| W2 | P2 | 完整聊一轮 + Cancel + 冷启动恢复 |
| W3 | P3 | 模型、附件、Queue、Plan |
| W4 | P4 | 澄清 / 工具审批 |
| W5–6 | P5–P6 | Workbench + 报告 / Artifact |
| W7+ | P7–P8 | MCP、推送、Maestro、性能 |

**并行**：P0 与 P1 UI 可部分重叠（Provider 先接 mock client，P0 合入后换真 client）。

---

## 7. 阶段交付物

| 交付物 | 说明 |
| --- | --- |
| 用例表 | 本文 §4.2–§4.3 打勾 + 可选录屏 |
| Parity 表 | [36 §4](./36-mobile-agent-frontend.md#4-全功能-parity-矩阵验收清单) 已验收 ID 标记 |
| Runbook | 真机 URL、ProblemDetails 常见码、Snapshot 对照命令（§5.4） |
| CI | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) 跑 **`pnpm check`**（§14.7）；Maestro E2E / 真机仍本地 `release-gate-runbook.md` |

---

## 8. 文档维护

- 工程里程碑与文件清单以 **[36 §13](./36-mobile-agent-frontend.md#13-实施里程碑)** 为准；本文只补充 **联调环境、用例、组织与时间线**。  
- API/协议变更：先 [11](./11-api-protocol.md) + `agent-protocol`，再 `agent-client`，最后更新本文 API 表。  
- 阶段收口后更新 [implementation-status.md](./implementation-status.md) **L6 Mobile** 小节。

---

## 9. 阅读顺序（联调专项）

1. 本文 §2 基线 checklist → §3 环境  
2. [36 §13.4](./36-mobile-agent-frontend.md#134-p1p2--最小可聊文件清单与验收) 文件清单  
3. [26-connection-durable-agent-loop.md](./26-connection-durable-agent-loop.md) — SSE / cursor  
4. [19-agent-frontend.md](./19-agent-frontend.md) — Composer / Workbench 语义  
5. P5 起：[37-c5-workbench-ui-and-preview.md](./37-c5-workbench-ui-and-preview.md)
