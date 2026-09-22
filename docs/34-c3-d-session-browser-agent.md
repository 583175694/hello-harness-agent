# C3-D：Session Sandbox 内 Chromium + agent-browser

> 文档状态：**已验收**（D0–D3，2026-09-22；D4 可选未做）  
> C3 权威索引：[33-c3-agent-sandbox-cloud-execution.md §6.4](./33-c3-agent-sandbox-cloud-execution.md#64-c3-dsession-内-chromium--agent-browser)（§6.4.3 冻结决策、§6.4.4 验收签字）  
> 本文：C3-D 完整实施方案（架构、镜像、契约、里程碑、风险）  
> 关联能力：**C6 Browser Use**（页面语义与写操作，本阶段不实现）

## 1. 目标与定位

### 1.1 要解决的问题

在 **C3-C Session Sandbox** 之上，让模型能在 **隔离容器** 内操作真实 Chromium（非纯 HTTP fetch），完成：

- 打开公开 URL、读取可访问性快照（`snapshot`）
- 截图 / PDF、点击下载到 workspace
- 通过既有 **`bash.output` Collect** 将文件交付为 Host **Artifact**

### 1.2 产品定位

| 说法 | 是否成立 |
| --- | --- |
| Session 内具备 headless 浏览器自动化 **底座** | C3-D 完成后 **是** |
| 完整 Browser Use（登录、用户接管、结构化 page tools） | **否**，归 **C6** |
| 对齐 DSH Host 侧 Playwright MCP / `browser_use` Provider | **否**，刻意不做 |

### 1.3 非目标（本阶段）

- 镜像矩阵、预热/快照、多 Provider、成本控制台（见 docs/33 §6.4.1）
- Host 侧 Playwright、Workbench 内嵌实时浏览器画面
- 默认全网 egress；Secret Proxy
- 独立 `browser_*` Tool 包（**可选**里程碑，首版不强制）

---

## 2. 架构

### 2.1 分层（不变）

```text
可信 Host：Agent Runtime / Policy / Artifact / SSE
        ↓ bash（+ 可选 job_*）
隔离面：OpenSandbox Session
        ├── /workspace（Session 共享）
        ├── bash -c …
        └── agent-browser CLI → Chromium（CDP）
```

Browser **进程与数据** 只在容器内；Host 只接收 **命令结果文本** 与 **Collect 后的 Artifact**。

### 2.2 与 C3-C 的关系

- **同一 Session 一个 Sandbox 实例**，多 Run 共享 `/workspace` 与已装依赖。
- Run 结束 **releaseRunLease**，无 running job 时按 TTL 回收；**不**因单次 Run 结束销毁盒。
- `bash` / `job_*` 与浏览器命令 **共用 Session 级 execute 串行队列**（延续 C3-C）。

### 2.3 agent-browser 会话映射（建议默认）

容器内注入环境（每次 `bash` 执行时，与 `HARNESS_SESSION_ID` 同级）：

| 变量 | 值 | 作用 |
| --- | --- | --- |
| `AGENT_BROWSER_SESSION` | `harness-<sessionId>` | 隔离不同 Chat Session 的浏览器实例 |
| `AGENT_BROWSER_SESSION_NAME` | 同上（可选） | 同 Session 内跨 Run 复用 cookie/storage（落在容器 FS，随 Sandbox 销毁而消失） |

首版 **不** 把浏览器 storage 同步回 Host；Session Sandbox 销毁即清空。

### 2.4 浏览器进程生命周期（冻结建议）

**方案 A（推荐 MVP）**：**按需启动、命令结束可保留进程**

- 模型通过多条 `bash` 调用 `agent-browser …`，依赖 `--session` 复用同一 Chromium。
- 不在 Host 维护「浏览器 daemon」；回收交给 **Sandbox TTL / Session 删除**。
- 长任务可用现有 **`run_in_background` + job_output**（例如 `agent-browser open … && sleep 999` 不推荐；更合理是单条较长 timeout 的 bash 或后台脚本）。

**方案 B（后置）**：Host 感知的「Browser 保活 job」或专用 watcher——**不在 C3-D MVP**。

---

## 3. 镜像与依赖

### 3.1 现状

- 默认 `SANDBOX_IMAGE` 为 **`python:3.12-slim`**（无 Chromium、无 Node agent-browser）。
- Host 上 `generated-file.renderer` 使用 Playwright **仅用于 Host 侧渲染**，与 Sandbox 内浏览器 **无关**。

### 3.2 C3-D 镜像策略（二选一，建议 3.2.1）

#### 3.2.1 专用 Sandbox 镜像（推荐）

- 新建 **`harness-sandbox-browser`**（命名待定）基于 debian/ubuntu slim：
  - Chromium 及依赖（fonts、libnss、libgbm 等）
  - Node 20+ + 全局或固定路径 **`agent-browser`** CLI
  - 保留 Python/常用 CLI（与现有 slim 能力相当或略扩）
- **`SANDBOX_IMAGE` 换 digest**；文档与 `.env.example` 增加 browser 变体说明。
- 本地：`dev/opensandbox-local` README 增加构建/引用步骤。

**优点**：首屏无 `apt/curl` 安装；行为稳定；CI/live 可重复。  
**缺点**：镜像体积↑；需维护 Dockerfile。

#### 3.2.2 运行时安装（不推荐作唯一路径）

- 首条命令 `apt-get` / `npm i -g agent-browser` + `npx playwright install chromium`。
- 强依赖 **install + network 双审批**；慢、易 flaky；仅作 **dev 过渡** 可选。

### 3.3 资源配额

当前 `sandboxLimits` 为 **2GiB RAM / 256 PID**。Chromium 可能逼近上限。

| 项 | MVP 建议 |
| --- | --- |
| 内存 | 浏览器镜像启用时，评估调至 **3–4GiB**（配置项，文档写清） |
| 超时 | 浏览器类 bash 仍受 **600s** 上限；复杂流可 `run_in_background` |
| 磁盘 | 下载/截图写入 `/workspace`，受 Collect **20MiB** 等既有上限约束 |

---

## 4. 模型契约与安全

### 4.1 工具面

**首版仅扩展 `bash` 使用方式**，不强制新 Tool：

- System prompt 增加 **短段**：公开页用 `agent-browser`；路径在 workspace；大文件用 `output` Collect；外网需 network 权限。
- `bash` description 可补一句：「工作区已预装 agent-browser（Sandbox 启用且为 browser 镜像时）。」

**可选后续**：`browser_screenshot` 等薄封装 Tool（内部拼 CLI + 固定 `output`），改善 UI 卡片——**单独立项，不阻塞 MVP**。

### 4.2 策略与 egress

- **Preflight**：沿用 `BashCommandPolicyService`；`agent-browser open https://…` 归类 **network**（与 `curl` 同级 interrupt + 升权）。
- **egress v2**：批准后当次 execute **boost**；allowlist 外 host **fail-closed + audit**（与 C3-C 一致）。
- **不** 为浏览器单独开「全网模式」。

### 4.3 审批

- 普通 `agent-browser snapshot` / 本地 `file://`（若禁止则策略拒绝）按 workspace 规则。
- 首次访问新 HTTPS 域名：**network 审批**（用户可见 command summary）。

### 4.4 威胁与约束

- 浏览器在容器内 = **仍受 egress 与 workspace 边界约束**；不等同于用户本机浏览器。
- 模型可见内容仅 **CLI 文本 + snapshot YAML**；截图进 Artifact 后按 C2 规则展示。
- **取消/timeout**：沿用 bash 的 **kill 进程树**；agent-browser 子进程应随 bash 退出（需 live 验证）。

---

## 5. 典型工作流

### 5.1 截图 → Artifact

```text
1. bash: agent-browser open https://example.com
2. bash: agent-browser screenshot /workspace/out/example.png
3. bash: 同次或下次调用带 output.path=out/example.png → Collect → artifactId
```

### 5.2 快照（给模型读）

```text
bash: agent-browser open https://example.com && agent-browser snapshot
→ stdout 进入 renderBashResult / Terminal（可能 spill）
```

### 5.3 下载

```text
bash: agent-browser open … ; agent-browser download <sel> /workspace/downloads/x
→ output Collect
```

### 5.4 与 web_fetch 的分工

| 能力 | 工具 |
| --- | --- |
| 静态页/批量 URL 原文 | `web_fetch`（Host） |
| JS 渲染、交互、截图、下载 | Sandbox **`agent-browser`** |

Prompt 中避免鼓励「能用 fetch 却开浏览器」。

---

## 6. 实施计划

### 6.1 里程碑

| ID | 内容 | 产出 | 状态 |
| --- | --- | --- | --- |
| **D0** | 镜像 POC | Dockerfile、`SANDBOX_IMAGE` digest、本地 OpenSandbox 手工：`agent-browser open` + `screenshot` | 已完成 |
| **D1** | Host 集成 | `bash` 注入 `AGENT_BROWSER_*` env；策略表覆盖 `agent-browser`；文档/.env.example | 已完成 |
| **D2** | 产物闭环 | Workbench 冒烟：截图 Collect → Artifact 预览；egress 审批路径 live | 已完成（§6.4.4 签字） |
| **D3** | 测试 | fake 单测 + Workbench/容器手工 live；无 Nest live 脚本 | 已完成 |
| **D4**（可选） | 薄 Tool / UI | 专用 Terminal 卡片或 `browser_snapshot` Tool | 未做 |

### 6.2 代码触达面（预估）

```text
dev/docker或dev/opensandbox-local   browser 镜像构建与 digest
apps/api/src/sandbox               可选 memory 配置；bash env 注入点（SandboxManager 或 BashTool）
apps/api/src/sandbox/bash-command-policy   agent-browser 命令分类
apps/api/src/tools/bash.tool.ts    dshEnv 等价：HARNESS_* + AGENT_BROWSER_*
packages/agent-protocol            （可选）文档化 extension；无 breaking
apps/web                           无必须改；Artifact 预览复用 C2
docs/33、docs/34、.env.example
```

**刻意不改**：OpenSandbox Provider 协议、job 协议、Prisma（除非 TTL 配置独立 env）。

### 6.3 验收标准（签字）

与 [docs/33 §6.4.4](./33-c3-agent-sandbox-cloud-execution.md#644-c3-d-验收与冒烟) 一致。

1. **镜像**：新 digest 在本地 OpenSandbox 可创建 Session；容器内 `agent-browser --version` 与 `chromium` 可启动。
2. **网络**：未审批时访问 allowlist 外 HTTPS 失败且有 audit；批准后 `open` 成功。
3. **bash**：`agent-browser snapshot` 返回文本；流式/Terminal 无协议错误。
4. **Artifact**：`screenshot` + `output` Collect 后 Workbench 可打开图片 Artifact。
5. **Session 复用**：同 Session 两次 Run：`open` 后 workspace 写入文件，第二次 Run 可读（与 C3-C §6.3.4 第 9 条一致）。
6. **回归**：`pnpm --filter @harness/api test`；browser 能力 Workbench/手工签字。
7. **文档**：33 §6.4 与本文档状态更新为「已验收」。

### 6.4 Workbench 冒烟 Prompt（建议）

1. 「请用 bash 在 sandbox 里执行 agent-browser 打开 https://example.com 并 snapshot，把主要标题告诉我。」
2. 「对 example.com 截图保存到 workspace/screenshot.png，并用 output Collect 给我 Artifact。」
3. （需审批）「打开 https://registry.npmjs.org 上某包页面并 snapshot。」

---

## 7. 风险与开放问题

| 风险 | 缓解 |
| --- | --- |
| Chromium 在 Docker 内启动失败（`/dev/shm`、sandbox flag） | 镜像内 `--no-sandbox` 等容器常用参数；OpenSandbox 文档/POC 先验证 |
| 内存 OOM | 提高 `memoryMiB` 配置；prompt 提醒关 tab / `agent-browser close` |
| agent-browser 与 OpenSandbox `bash -c` 引号 | 与 C3-C job 相同：复杂命令用 heredoc 或脚本文件写入 workspace |
| 模型滥用浏览器刷 egress | network 审批 + allowlist + Session 并发由运维控 |
| **开放**：是否在 MVP 强制 browser 镜像 vs 运行时 install | **建议强制专用镜像** |
| **开放**：是否在 bash 结果中自动识别 png 路径并提示 Collect | MVP 靠 prompt；后置 UI hint |

---

## 8. 与路线图衔接

```text
C3-C（已完成）→ C3-D（本文）→ C6 Browser Use（结构化 tools + K5）
                      ↓
                 C5 可复用浏览器做预览/构建验证
```

C3-D 验收通过后，在 `implementation-status.md` 将 C3-D 标为已落地，并填写 [docs/33 §6.4.4](./33-c3-agent-sandbox-cloud-execution.md#644-c3-d-验收与冒烟) 手工签字表。

---

## 9. 方案立场与取舍

本节记录 **当前冻结方案** 的设计理由，便于评审时对照；**不**改变 §1–§8 的实施范围。

| 取舍 | 选择 | 理由 |
| --- | --- | --- |
| 浏览器跑在哪 | **Session Sandbox 容器内** | 与 C3「隔离面执行、Host 策略/Artifact」一致；外网走既有 egress，不另开浏览器全网通道 |
| 是否对齐 DSH Browser Use | **否** | DSH 为 Host 本机 Chromium + MCP Provider；云 Harness 不在可信 Host 上叠 Playwright MCP |
| 模型入口 | **bash + agent-browser CLI** | 复用 C3-C 串行 execute、Collect、job_*；首版不加 Host 侧 Browser Runtime 抽象 |
| 独立 `browser_*` Tool | **D4 可选** | 改善 UI/可靠性时再薄封装 CLI；MVP 用 system prompt + bash description |
| 镜像 | **专用 browser 镜像（MVP 强制）** | 避免运行时 apt/npm 双审批、 flaky 与不可重复 live；代价是体积与运维 digest |
| 内存 | **3–4GiB（browser 部署）** | Chromium 在 2GiB 下易 OOM；属运维配置而非新模块 |
| Host Playwright（PDF 等） | **保留，与 Sandbox 无关** | 可信面渲染与隔离面浏览分栈；接受双 Chromium 依赖的维护成本 |
| 与 C6 边界 | **C3-D = 进程 + 文件 + CLI 结果** | 登录、用户接管、结构化 page 副作用归 C6/K5 |

---

## 10. 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-09-22 | 初稿：范围冻结为 Sandbox 内 Chromium + agent-browser；DSH Browser Use 不对齐 |
| 2026-09-22 | 与 docs/33 §6.4.3–§6.4.4 对齐；补充 §9 方案立场 |
| 2026-09-22 | D0–D3 落地：browser 镜像、Host env/策略、PNG Collect、单测 + 手工 live |
| 2026-09-22 | 补齐：`scheduleDestroyIfIdle` 无 DB 行误销毁；跨 Run live；job inner env；PNG Artifact 预览 |
