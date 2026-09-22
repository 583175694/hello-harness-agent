# C3 Agent Sandbox & Cloud Execution Environment / Agent 云端沙箱与执行环境

> 文档状态：C3 统一方向与实施方案；**C3-A / C3-B 已在本机 OpenSandbox + Docker 完成验收**（Sandbox 默认仍关闭，启用需配置 `SANDBOX_*`）。
>
> 最后更新：2026-09-22（C3-B 落地与验收记录）。
>
> 本文是 C3 的唯一权威文档，同时包含已完成的基础设施 PoC、C3-A 实施方案、冻结契约、后续阶段和验收标准。

阅读顺序：

- 要开始实施 C3-A：先读第 0、1 节；这里给出当前基础、目标模块、实施顺序和完成标准。
- 要实现或评审具体代码：再读第 2–5 节；这里集中说明架构依据、与 DeepSeek Harness bash 的对齐、冻结契约、安全、观测和清理约束。
- 要判断 C3-A 之外的范围：读第 6–10 节；这里记录后续阶段、关联能力和开放问题。

## 0. 当前结论

C3 的目标是为每个 Agent Run 提供任务级隔离、可持续且可配置的云端执行环境。模型通过普通 Tool 使用 Sandbox；Agent Runtime、Tool Registry、Policy、Credential、Audit 和 Artifact 继续留在可信 Harness Host。

命令执行纪律对齐 DeepSeek Harness 的默认 `bash` 工具：每次调用是全新 `bash -c`，请求在边界处显式 resolve，结果字段正交，非零退出不是 Tool 失败，timeout/cancel 必须终止远端进程。Sandbox 产品不对齐 DSH 的本机文件沙箱：C3 继续使用 OpenSandbox + Docker 的 Run-scoped 容器、显式 Stage/Collect 和默认 deny 网络。**C3-A** 使用工具名 `execute_command` 且每条命令强制审批；**C3-B 起**主工具名为 `bash`，workspace 内普通前台命令默认不审批，仅网络/安装/升权走 K3.2。DSH 的 `ctx.sandbox.confine(argv)` 本机实现、持久 PTY 不迁入；DSH 的升权与后台 jobs 语义分别在 C3-B（升权审批）与 C3-C（`run_in_background` + `job_*`）落地。

当前状态：

```text
前置 PoC  OpenSandbox + Docker / Cloud Execution   已通过
C3-A      Sandbox 抽象与 execute_command 接入       已落地；本机 Docker 验收通过；默认关闭
C3-B      DSH 前台 bash 对齐 + 策略审批改版         已落地；本机 Docker 验收通过（见 §6.2.4）
C3-C      后台 job + 沙箱生产 + 网络/安装执行层       待实施（见 §6.3）
C3-D      Browser、复杂产物与规模化                   待实施（见 §6.4）
```

**日常开发**优先使用本机 OpenSandbox（见 [1.5 本地 OpenSandbox 开发](#15-本地-opensandbox-开发)）。腾讯云 x86_64 环境仍可作为部署目标，不属于 C3-A 代码待办：

- 腾讯云 CVM 已部署 OpenSandbox Server `0.2.3` 与 Docker backend（端口 `28473`、API Key、systemd）。
- Harness 部署到同 VPC 时建议使用私网 `10.1.24.2:28473`；公网需安全组放行且当前为 HTTP，仅建议白名单 IP。
- 已验证 Sandbox 创建、Shell/Python 执行、同一 Session 多次调用共享 `/workspace`、文件回传、Sandbox 销毁和容器清理。

C3-A 要完成的是把这套已部署基础设施接入 Harness：

```text
Agent Runtime
-> execute_command Tool
-> SandboxManager
-> OpenSandboxProvider
-> Run-scoped Sandbox Session
-> Workspace Stage / Collect
-> File / Artifact
-> Tool Result / Activity / Projection
```

## 1. C3-A 实施方案

### 1.1 目标与交付范围

C3-A 要交付第一版可测试的 Run-scoped 命令执行能力：

- `execute_command` 作为普通模型 Tool 接入现有 Model-led Tool Loop。
- 一个 Run 懒创建并复用一个 Sandbox Session。
- 同一 Run 的多次正常命令共享 Workspace 和已安装依赖；每次命令仍是全新 `bash -c`，不保留 cwd、变量或函数。
- 命令返回有界 stdout、stderr，以及正交的 `exitCode`、`signal`、`timedOut`、`aborted` 和 `durationMs`。
- timeout、cancel 和 Provider 错误映射为稳定 Tool Result；timeout 与 abort 按第一原因互斥上报。
- 输入文件显式 Stage，单个输出文件显式 Collect 并创建 Artifact。
- Run terminal 后有界清理 Sandbox，服务端 TTL 作为崩溃兜底。
- `packages/agent-protocol`、SSE、历史 Snapshot 和 Projection 显式支持 `execute_command`。

C3-A 不交付：

- 生产级多租户调度、动态风险策略或多 Provider 路由。
- 用户可见交互式 Terminal、完整 PTY、后台服务或任意长任务。
- 跨 Run 永久机器、Project Workspace 或多 Agent 共享 Sandbox。
- 多输出 Artifact、自动 Workspace Diff 或目录打包。
- 登录态浏览器、页面写操作、用户接管或结构化 `browser_use`。
- API 进程重启后的活动 Sandbox 恢复和 exactly-once 命令语义。

### 1.2 目标模块

```text
apps/api/src/sandbox/
  sandbox.module.ts
  sandbox.types.ts
  sandbox-manager.service.ts
  sandbox-provider.ts
  opensandbox.provider.ts
  sandbox-session.ts
  sandbox-workspace.service.ts
  sandbox-error.ts
  sandbox-config.ts

apps/api/src/tools/
  execute-command.tool.ts
```

依赖方向：

```text
execute-command.tool
  ├──> sandbox-workspace.service
  │      ├──> files / file-storage
  │      └──> artifacts
  └──> sandbox-manager.service
         └──> sandbox-provider
                └──> opensandbox.provider
```

职责：

| 模块 | 责任 | 不负责 |
| --- | --- | --- |
| `SandboxProvider` | 创建 Provider 无关的 Sandbox Session | Run 语义、审批、Artifact |
| `OpenSandboxProvider` | 把抽象映射到 OpenSandbox SDK | 向上层泄漏 HTTP、Docker 或动态端口 |
| `SandboxManager` | Run/Session 关联、懒创建、串行化、失效和清理 | 解析模型 Tool Call |
| `SandboxSession` | 容器内命令执行和文件操作；Workspace 跨调用保留 | Shell 状态、权限判断和最终交付身份 |
| `SandboxWorkspaceService` | Stage、路径校验、单文件 Collect、Artifact 导入 | 自动扫描全部输出 |
| `ExecuteCommandTool` | Zod 校验、`resolve(request)`、调用 Manager/Workspace、归一化 Tool Result | 直接调用 OpenSandbox 或 Docker；不暴露 stdin、env 或资源参数 |

Agent Runtime 只依赖 `ToolRegistryService`，不依赖 OpenSandbox SDK、Docker 类型或 Sandbox ID。

### 1.3 实施切片

实施关键路径：

```text
Step 1  canonical protocol + fake Provider + Manager
   ↓ 协议、生命周期和错误语义在本地测试中成立
Step 2  OpenSandbox adapter + cancellation contract
   ↓ 真实 Provider 的执行、文件和终止语义通过 contract test
Step 3  execute_command + Runtime / Approval / Projection
   ↓ 模型可通过普通 Tool Loop 稳定执行命令
Step 4  Stage / Collect + File / Artifact
   ↓ 输入文件到输出 Artifact 的完整闭环通过
C3-A 验收
```

| 切片 | 主要产出 | 进入下一步的条件 |
| --- | --- | --- |
| Step 1 | 公共协议、Sandbox 抽象、fake Provider、Manager | 不依赖远端环境的协议和生命周期单测通过 |
| Step 2 | OpenSandbox Provider、配置、取消能力验证 | 腾讯云 Provider contract test 通过，并确定 cancel 使用命令级终止还是销毁 Session |
| Step 3 | 模型可见 `execute_command`、审批、Activity、Projection | 真实 Tool Loop 覆盖成功、失败、非零退出、timeout 和 cancel |
| Step 4 | File Stage、单输出 Collect、Artifact 导入 | 至少一个真实输入到正式 Artifact 的端到端场景通过 |

四个切片按依赖顺序推进。Step 1 不连接 OpenSandbox；Step 2 不提前暴露模型 Tool；Step 3 可以先不 Collect Artifact；只有 Step 4 和全部验收条件完成后，C3-A 才算交付。

#### Step 1：公共协议、契约和 fake Provider

- 在 `packages/agent-protocol` 增加 `execute_command` 名称、输入 Schema、公共结果摘要、Activity、Snapshot 和错误码。
- 补齐 Chat / Projection 的显式分支，禁止未知工具回退成 `web_search`。
- 新增 Sandbox types、Provider token、内部错误模型和 fake Provider。
- 实现并测试 Manager 的懒创建、single-flight、同 Run 复用、串行化、Session 失效、幂等销毁和错误映射。
- Tool 层在执行前 `resolve(request)`：补全 cwd、timeout 上限和输出预算；`execute` 只接受已解析 spec。
- 暂不连接真实 OpenSandbox。

#### Step 2：OpenSandbox Provider

- 锁定 `@alibaba-group/opensandbox` TypeScript SDK；当前候选版本为 `0.1.11`。
- 配置 Domain、API Key、server proxy、固定镜像 digest、TTL、资源上限和默认 deny 网络。
- 实现 create、execute、upload、stat、download、destroy adapter。
- 先执行 cancellation contract spike：
  - 命令 timeout 后远端进程是否停止。
  - 客户端 Abort 后子进程、孙进程是否停止。
  - server proxy 下取消语义是否一致。
  - `sandbox.kill()` 返回时容器和进程是否已终止。
- 如果不能证明单 execution 可可靠终止，正式实现统一采用 kill Sandbox + invalidate Session。
- 在已部署的腾讯云 OpenSandbox 上运行 Provider contract test。

#### Step 3：`execute_command` Tool

- 实现 Zod input schema、Function Calling definition 和 `require_approval` 策略。
- 接入 `ToolsModule`、`ToolRegistryService` 和现有 Agent Runtime。
- 调整 Runtime timeout：先 abort Tool，再等待默认 10 秒 cancellation grace；不能只通过 `Promise.race` 遗弃远端执行。
- 接入 Tool Activity、Projection、Checkpoint 和模型 Tool Result。
- 测试成功、非零退出、timeout、cancel、第一原因分类、Session invalidation、Provider 错误、输出截断和未知工具不回退。

#### Step 4：Workspace / Artifact

- 实现 `inputFiles[]` 显式 Stage 和单个 `output` Collect。
- 新增 `FilesService.importGeneratedBytes`、`ArtifactsService.importFromSandbox` 一类受控字节导入能力。
- 校验文件归属、状态、路径、regular-file、symlink、特殊文件、大小、格式、内容和 Session 配额。
- 测试 Stage 失败不执行命令、Collect 失败保留命令结果、Artifact 幂等和清理失败补偿。

### 1.4 C3-A 验收标准

C3-A 只有在以下条件全部满足后才标记完成：

- Agent Runtime 能通过普通 Tool Call 创建并复用 Run-scoped Sandbox。
- Shell/Python 在真实 OpenSandbox + Docker 中执行。
- stdout、stderr、`exitCode`、`signal`、`timedOut`、`aborted`、`durationMs` 均稳定归一化；timeout 与 abort 互斥。
- 同一 Run 的正常第二次调用能看到第一次写入的 Workspace 和已安装依赖，但不能依赖上一次的 cwd、变量或函数；不同 Run 相互隔离。
- timeout/cancel 能证明远端进程树已经终止；被销毁的 Session 不会再次复用。
- Run 完成、失败、取消和服务关闭执行有界 cleanup；失败实例具有非空 TTL 并最终过期。
- 至少一个输入 File Stage 和一个输出 Artifact Collect 闭环通过。
- Provider API、Sandbox ID、容器 ID 和动态端口不进入模型上下文或公共协议。
- `packages/agent-protocol`、SSE、历史 Snapshot 和 Projection 对 `execute_command` 有显式分支。
- stdout/stderr 不进入长期 Event 或 Assistant metadata。
- `SANDBOX_ENABLED` 默认关闭；命令需要审批；固定非 root 镜像、资源上限和完全 deny 网络不能被模型覆盖。
- CI 覆盖协议、Manager、fake Provider、路径、截断、错误映射和 Projection 分支，不连接真实 OpenSandbox。
- 取消若不能证明命令级进程树终止，正式实现一律 destroy Session。
- `agent-browser`/Chromium 不阻塞 C3-A，但必须在 C3-C 前完成云端验证。

**2026-09-21 验收记录（本机 `dev/opensandbox-local` + Harness UI/API）：**

| 项 | 结果 |
| --- | --- |
| echo / stdout / exit 0 | 通过 |
| 非零退出（如 `exit 42`）Tool 仍 `succeeded` | 通过 |
| 同 Run 多次 `execute_command`，工作区文件保留、shell 状态不保留 | 通过 |
| `output` Collect → Artifact 预览/下载 | 通过 |
| 命令 timeout → `TOOL_TIMEOUT` | 通过（`apps/api/scripts/sandbox-live-timeout.mjs`） |
| 用户附件 → `inputFiles` Stage → 命令 | UI 未严格测；Collect 与命令链路已测 |
| cancel 毁盒 | 脚本级 timeout grace 已测；UI cancel 未单独签字 |

自动化入口：`pnpm --filter @harness/api test:sandbox-live`、`node apps/api/c3a-sandbox-live.mjs`。

### 1.5 本地 OpenSandbox 开发

仓库内配置与启动脚本：`dev/opensandbox-local/`（详细说明见该目录 [README.md](../dev/opensandbox-local/README.md)）。

**前置**

- Docker Desktop（或等价 Docker Engine）已运行。
- 已安装 `uv` / `uvx`（用于 `opensandbox-server@0.2.3`）。
- 首次使用可拉取镜像：`python:3.12-slim`、`opensandbox/execd:v1.0.22`、`opensandbox/egress:v1.1.7`（与 `sandbox.toml` 一致）。

**启动 Server**

```bash
./dev/opensandbox-local/start.sh
```

等价命令：

```bash
cd dev/opensandbox-local
uvx opensandbox-server@0.2.3 --config sandbox.toml
```

默认监听 `http://127.0.0.1:28473`。健康检查：

```bash
curl http://127.0.0.1:28473/health
```

**Harness 根目录 `.env`（与 `sandbox.toml` 中 `[server].api_key` 保持一致）**

```env
SANDBOX_ENABLED=true
SANDBOX_DOMAIN=127.0.0.1:28473
SANDBOX_API_KEY=<dev/opensandbox-local/sandbox.toml 中的 api_key>
SANDBOX_IMAGE=python:3.12-slim@sha256:2f17fc044b579bab302c2e8054d3a686e2cb9a83de48e70534b94cd8ebbe06a9
```

修改 `.env` 后需重启 API（`pnpm dev`）。启用 Sandbox 后模型 Tool 为 **`bash`**：workspace 内普通命令自动执行；network/install 类命令需 tool approval（见 §6.2）。

**自动化验收**

```bash
pnpm --filter @harness/api test:sandbox-live
pnpm exec dotenv -e ../../.env -- node apps/api/scripts/sandbox-live-timeout.mjs
node apps/api/c3a-sandbox-live.mjs
```

**UI 冒烟 Prompt 示例**

1. `请用 execute_command 在沙箱里执行：echo sandbox-ok，把 stdout 和 exitCode 告诉我。`
2. `请用 execute_command 执行：exit 42，告诉我 Tool 是否成功以及 exitCode。`
3. 同 Run 内依次执行 `python3` 写 `state.txt` 再 `cat state.txt`，验证工作区保留。
4. 上传 `input.txt` 后要求必须使用 `inputFiles` Stage，再 `cat input.txt > result.txt` 并 `output` Collect。

**与腾讯云并存时**

| 场景 | `SANDBOX_DOMAIN` |
| --- | --- |
| 本机开发（推荐） | `127.0.0.1:28473` + `./dev/opensandbox-local/start.sh` |
| Harness 与 OpenSandbox 同 VPC | `10.1.24.2:28473` |
| 公网（需安全组 + HTTP 风险） | `175.178.23.83:28473` |

## 2. 实现约束：Sandbox as a Tool 架构

### 2.1 总体架构

```text
可信控制面：Harness Host
├── Agent Runtime / Model Loop
├── Tool Registry
├── Context / Transcript
├── Task State
├── Policy / Approval
├── Credentials / MCP
├── File / Artifact
├── Audit / Observability
└── Sandbox Manager
        ↓ sandbox-facing capability
隔离执行面：Sandbox Session
├── Sandbox Workspace
├── Shell / Process
├── Python / Node.js
├── agent-browser / Browser
├── 任务所需 CLI 与依赖
└── 临时输入、中间文件和候选输出
```

Sandbox 是 Tool 背后的执行环境，不是新的 Agent Runtime，也不是特殊主循环：

```text
Model Tool Call
-> Tool Registry
-> Input Validation
-> Policy / Approval
-> Tool Execute
-> Sandbox Manager / Session
-> ToolExecutionResult
-> Transcript / Projection
-> Next Model Round
```

### 2.2 与 OpenAI 官方架构的对应关系

C3 直接采用 OpenAI 官方 Cookbook [Migrate a Legacy Codebase with Sandbox Agents](https://developers.openai.com/cookbook/examples/agents_sdk/sandboxed-code-migration/sandboxed_code_migration_agent#architecture-sandbox-as-a-tool) 推荐的 “Sandbox as a Tool” 模式，而不是把完整 Agent Harness 放进 Sandbox。

| OpenAI Cookbook | Harness C3 |
| --- | --- |
| Host-side Agents SDK harness | `AgentRuntimeService`、Model-led Tool Loop、Tool Registry |
| Host-side tools、MCP、credentials、policy、audit | Harness Tool、MCP、Credential、Approval、Run Event、Projection |
| Per-task manifest / scoped workspace | 显式 File Stage、Run-scoped Workspace |
| Sandbox `Shell` / `ApplyPatch` capabilities | `execute_command` 和后续结构化 Tool |
| Returned report / patch bundle | Host Collect、File / Artifact |
| Delete sandbox after task | `releaseRun` 加服务端 TTL |
| Swappable sandbox client | `SandboxProvider -> OpenSandboxProvider` |

共同不变量：

- Agent Loop、Tool Registry、MCP、凭证、Policy、Approval、审计和最终 Artifact 身份留在 Host。
- Sandbox 只获得当前 Run 明确 Stage 的文件和执行能力。
- Sandbox 输出是不可信数据，必须回 Host 校验后才能进入 File / Artifact。
- Sandbox 生命周期与正式 Artifact 生命周期解耦。
- 更换 Docker、Hosted Sandbox、Kubernetes 或 MicroVM Provider 时，不重写 Agent Loop、Tool 契约或 Prompt。

Cookbook 示例以代码迁移 shard、repo manifest 和 patch bundle 为中心；Harness 面向通用对话 Run，因此使用懒创建的 Run-scoped Session、`fileId` Stage 和 Artifact Collect。这是同一架构的产品映射，不是 Agent-in-Sandbox 架构。

### 2.3 与 DeepSeek Harness bash 的对齐

C3-A 借鉴 DSH 默认 `dsh-tool-bash` 的**命令执行纪律**，不借鉴 DSH `packages/sandbox` 的本机文件沙箱产品。对照实现见 DeepSeek Harness 的 `packages/shell/tool-bash`、`packages/shell/bash-local` 和 `docs/subsystems/shell.md`。

分层对应：

```text
DSH:  bash tool  → ctx.shell.resolve/run → bash-local → ctx.subprocess.spawn
C3:   execute_command → resolve(request) → SandboxManager → OpenSandbox Session.execute
```

OpenSandbox Provider 替换的是 DSH 的 `ctx.subprocess.spawn`，不是 `ctx.sandbox.confine(argv)`。后者在共享内核和真实仓库上包装本机 argv；C3 的隔离边界是远端容器。

借鉴的执行纪律：

| DSH 纪律 | C3-A 落地 |
| --- | --- |
| 每次调用全新 `bash -c` | 不保留 cwd、变量、函数；需要工作目录时传 `cwd` |
| `resolve(request)` 后才执行 | 默认值、timeout 上限和输出预算只在 Tool 边界填写一次；Provider `execute` 只收已解析 spec |
| 结果字段正交 | `exitCode`、`signal`、`timedOut`、`aborted` 独立上报；timeout 与 abort 按第一原因互斥 |
| 非零退出不是 Tool 失败 | 只有基础设施、Stage、权限和未知执行结果才是 Tool `failed` |
| 有界输出 | stdout/stderr 各有 Host 上限；超限保留 head 与 tail 并标记截断 |
| timeout/cancel 杀掉进程 | 必须终止远端进程树；不能只丢 Host Promise |
| 模型不提供 stdin / env / 资源 | 不暴露这些参数；凭证由 Host scrub，不注入模型或业务密钥 |
| fail-closed | 没有可用 Provider 时不静默落到 Host shell |

必须保留的 C3 产品约束（DSH 没有，不能省略）：

| C3 产品 | 原因 |
| --- | --- |
| Run-scoped 容器 Session、同 Run 串行、TTL、`releaseRun` | 文件和已装依赖靠容器保留，不靠本机仓库 |
| 显式 Stage / Collect | 容器内路径没有用户身份；输出不可信，必须回 Host 才能成为 File / Artifact |
| 每条命令 `require_approval` | 云端多租户；模型不能改镜像、网络、env 或资源 |
| stdout/stderr 不进长期 Event / Projection | 公共协议与本地会话历史不同 |
| Provider / Sandbox / 容器 ID 不进模型上下文 | 避免泄漏和误用内部路径 |

C3-A 明确不搬：

| 不搬 | 原因 |
| --- | --- |
| `ctx.sandbox.confine(argv)` 与 `read-only` / `workspace-write` / `danger-full-access` | 本机文件效果词汇；隔离靠固定镜像和 deny 网络 |
| `sandbox_permissions` + `justification` 升权 | 等于让模型拆容器墙 |
| `run_in_background` 与 `ctx.jobs` | C3-A 不做后台任务；与 TTL / 计费冲突 |
| `dsh-tool-bash-persistent` / 完整 PTY | C3-A 不做交互式 Terminal |
| 截断只留 tail + 本机 spill 路径 | 云上没有用户可打开的 spill 文件；完整字节最多经 Collect 成为 Artifact |

有状态的是 Sandbox Workspace，不是 shell。同一 Run 的第二次调用能看见第一次写入的文件和安装的依赖；不能看见第一次的当前目录或导出变量。

## 3. 实现约束：C3-A 冻结契约

### 3.1 `execute_command` 输入

```ts
type ExecuteCommandInput = {
  command: string;       // 1-8,000 Unicode code points
  cwd?: string;          // workspace-relative，默认 '.'
  timeoutMs?: number;    // 默认 30s，范围 1s-120s
  inputFiles?: Array<{
    fileId: string;
    path: string;        // workspace-relative
  }>;                    // 最多 10 个，总 Stage 上限默认 50 MiB
  output?: {
    path: string;        // workspace-relative regular file
    fileName?: string;
  };                     // 每次调用最多一个，默认最大 20 MiB
};
```

路径规则：

- 模型只提交 workspace-relative POSIX path，Host 解析到固定 `/workspace`。
- 拒绝绝对路径、空路径、NUL、`..` 逃逸和解析后不在 Workspace 根下的路径。
- C3-A 使用受限 Shell 字符串，不同时提供 argv、PTY、stdin、env 或后台进程协议。
- 只有一个模型 Tool：`execute_command`。没有单独的 Python Tool；跑 Python 就是命令里写 `python3 ...`。
- 不增加 DSH 的 `description` 参数。审批和 Activity 用 command 本身。
- 每次调用是全新 `bash -c`：不保留上一次的 cwd、变量或函数；需要工作目录时传 `cwd`，不要依赖 `cd`。
- 同一 Run 多条 `execute_command`（含同一模型轮次并行 tool call）排队串行；其他工具仍走现有 Runtime 并发。

`ExecuteCommandTool` 在调用 Manager 之前执行 `resolve(request)`：补全默认 `cwd`、把 `timeoutMs` clamp 到 1s–120s（缺省 30s）、固定输出预算。Provider 和 Session 只接收已解析 spec，不再偷偷填默认值。

模型可见 description 冻结为：

```text
在隔离的云端工作区用 bash -c 执行一条命令。每次调用是新的 shell，cwd/变量/函数不保留；同一 Run 的文件和已装依赖会保留。路径必须相对工作区。需要输入文件时用 inputFiles，需要带回一个文件时用 output。非零退出是命令结果。不要假设外网可用。
```

### 3.2 Tool Result

```ts
type ExecuteCommandOutput = {
  exitCode: number | null; // 被信号杀死或准备阶段超时且无进程时为 null
  signal: string | null;
  timedOut: boolean;
  aborted: boolean;
  timeoutMs: number;
  stdout: string;        // 默认最大 32 KiB
  stderr: string;        // 默认最大 32 KiB
  durationMs: number;
  truncated: {
    stdout: boolean;
    stderr: boolean;
  };
  collection?:
    | { status: 'collected'; artifact: ArtifactRef; file: FileRef }
    | {
        status: 'failed';
        error: { code: string; detail: string; retryable: boolean };
      };
};
```

- stdout/stderr 按 UTF-8 byte 有界收集，每流最多 32 KiB。超限保留 head 8 KiB 与 tail 8 KiB，中间插入固定截断标记，并置 `truncated.* = true`。不使用本机 spill 路径；完整字节只有经 `output` Collect 才能成为 Artifact。
- 原始输出只进入有界模型 Tool Result，不进入长期 SSE、Assistant metadata 或公共 Projection。
- `timedOut` 与 `aborted` 按第一原因互斥：执行器自有 timeout 计为 `timedOut`，调用方 Abort 计为 `aborted`。进程捕获信号后以 0 退出时，仍必须上报中断原因。
- `signal` 使用 POSIX 名字符串（`SIGTERM` / `SIGKILL`）；没有则为 `null`。
- 非零 `exitCode` 是成功完成的命令结果，不是 Tool transport failure。`timedOut` / `aborted` 分别映射为 Tool 状态 `timeout` / `cancelled`。
- Stage 失败时命令不执行，Tool 返回 `failed`。
- 命令正常结束（非 timeout/cancel）且 Collect 目标合法时执行 Collect，不要求 `exitCode === 0`。timeout/cancel 不 Collect。
- 命令完成但 Collect 失败时 Tool 仍为 `succeeded`，通过 `collection.failed` 返回错误。
- `execution_unknown` 不伪装成成功或普通非零退出，也不自动重试。
- Tool `executionPolicy.timeoutMs` 固定为 130s（命令上限 120s + cancellation grace 10s）。Runtime 先 abort signal，再等最多 10s；仍未结束则 destroy Session。

### 3.3 Provider / Session

```ts
type CreateSandboxInput = {
  image: string;
  ttlMs: number;
  env?: Record<string, string>;
  metadata?: Record<string, string>;
};

type SandboxCommandInput = {
  command: string;
  cwd?: string;
  timeoutMs: number;
  signal?: AbortSignal;
};

type SandboxCommandResult = {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  aborted: boolean;
  timeoutMs: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

type SandboxFileStat = {
  path: string;
  kind: 'regular_file' | 'directory' | 'symlink' | 'other' | 'missing';
  size: number | null;
};

interface SandboxProvider {
  create(input: CreateSandboxInput): Promise<SandboxSession>;
}

interface SandboxSession {
  readonly id: string;
  execute(input: SandboxCommandInput): Promise<SandboxCommandResult>;
  upload(input: { path: string; data: Uint8Array; mode?: number }): Promise<void>;
  stat(input: { path: string }): Promise<SandboxFileStat>;
  download(input: { path: string }): Promise<Uint8Array>;
  destroy(input?: { signal?: AbortSignal }): Promise<void>;
}
```

约束：

- `ttlMs` 是服务端自动销毁期限，不是命令 timeout；禁止永不过期 Sandbox。
- `execute` 接收已解析 spec：`timeoutMs` 必填，`cwd` 已解析到 Workspace 内。
- `destroy` 幂等，Sandbox 已不存在时视为成功。
- `stat + download` 只允许读取受控 regular file，不能跟随 symlink 逃逸。
- Provider 错误转换为稳定内部错误码；原始堆栈、密钥和内部路径不进入模型上下文。
- Sandbox ID 只用于服务端日志和诊断。
- 首版使用 SDK server proxy，不直接访问动态 Sandbox 端口。
- 没有可用 Provider 时 fail-closed，禁止静默在 Host 上执行命令。

### 3.4 Run / Session 生命周期

- 一个 Run 最多一个活动 Sandbox；不同 Run 绝不共享。
- 第一次使用按 Run single-flight 懒创建。
- 同一 Run 的命令串行执行。
- 正常命令完成后保留 Sandbox，从而保留 Workspace 和已安装依赖；不保留 shell 状态。
- timeout/cancel 必须终止完整远端进程树；不能只终止 Host Promise。
- 如果命令级终止能力不能被证明，销毁整个 Sandbox、删除 Run 映射并返回 `session_invalidated`。
- 同一 Run 后续调用会创建全新 Sandbox，异常路径不保证保留 Workspace。
- `RunExecutor.finally` 有界等待 `releaseRun`；清理失败不覆盖 Run 结果。
- `SandboxManager.onModuleDestroy` best-effort 清理全部内存 Session。
- API 崩溃后的最终回收依赖非空服务端 TTL；durable orphan repository 进入 C3-C。
- Follow-up 默认新 Run、新 Sandbox。

### 3.5 Workspace Stage / Collect

- 输入通过 `inputFiles[]` 显式 Stage，不自动挂载全部附件。
- Stage 前验证 File 属于当前 Session 且为 ready；origin 可以是 user_uploaded、agent_generated 或 tool_result。
- 同路径同 sha256 可幂等成功；同路径不同内容拒绝覆盖。
- 每次 Tool Call 最多 Collect 一个输出，因为当前 Artifact 以 `(runId, toolCallId)` 唯一。
- 仅当命令正常结束（非 timeout/cancel）且目标是合法 regular file 时 Collect，不要求 exit 0。
- Collect 检查目标和所有路径组件，仅允许 regular file；拒绝 symlink、目录、设备、socket、FIFO 和超限文件。
- Host 再验证文件名、扩展名、MIME、内容、哈希、大小和 Session 配额。扩展名/MIME 复用用户上传允许的种类，不是 `create_file` 生成白名单。
- Sandbox 原始字节通过 `FilesService.importGeneratedBytes` 和 `ArtifactsService.importFromSandbox` 进入 File / Artifact，不重新解释成 Markdown 或 sheets。
- `output.fileName` 缺省时用 path 的 basename。
- C3-A 不做自动 Diff、目录输出、增量 Collect 或候选 Artifact 自动发现。

### 3.6 公共协议

C3-A 必须修改 `packages/agent-protocol`：

- `AGENT_TOOL_NAMES.executeCommand`。
- `executeCommandInputSchema` 和安全输入摘要：`command` 最多 200 个 Unicode code points（超出加 `…`）、`cwd`、`timeoutMs`、Stage 的 `fileId`+`path`、Collect `path`/`fileName`。审批绑定完整 command 和路径，不受 200 限制。
- 不含 stdout/stderr 的 `executeCommandPublicResultSchema`：`exitCode`、`signal`、`timedOut`、`aborted`、`timeoutMs`、`durationMs`、`truncated` 和 `collection`。
- 模型 Tool Result 使用完整 `ExecuteCommandOutput`（含有界 stdout/stderr）。
- `ToolExecutionSnapshot`、`tool.started`、`tool.completed` 显式分支。
- Activity title 固定为 `执行命令`；summary 用截断后的 command。Collect 成功再追加普通 Artifact block。
- Chat / Projection / 前端 tool-copy 显式处理 `execute_command`。未知工具不能回退成 `web_search` 或其他已有工具。
- 错误码：`SANDBOX_UNAVAILABLE`、`SANDBOX_STAGE_FAILED`、`SANDBOX_COLLECT_FAILED`、`SANDBOX_SESSION_INVALIDATED`、`SANDBOX_EXECUTION_UNKNOWN`。参数问题继续 `INVALID_TOOL_ARGUMENTS`。
- 不做 Terminal 或流式日志 UI。

### 3.7 错误映射

| 类别 | Tool 状态 | 是否可重试 |
| --- | --- | --- |
| 参数非法 / cwd 越界 | `failed` | 否 |
| API Key / 权限错误 | `failed` | 否，需修复配置 |
| Sandbox 创建失败 | `failed` | 通常是 |
| 镜像拉取失败 | `failed` | 是，需修复镜像或网络 |
| 命令执行超时（`timedOut`） | `timeout` | 是，需缩短命令或增加预算 |
| Run / 用户取消（`aborted`） | `cancelled` | 由用户决定 |
| Stage 失败 | `failed`，命令不执行 | 取决于文件状态 |
| Collect / Artifact 导入失败 | 命令 `succeeded`，`collection.failed` | 通常是 |
| Session 被销毁 | 原 `timeout` / `cancelled`，记录 `session_invalidated` | 后续创建新 Session |
| 请求断开、结果未知 | `failed`，记录 `execution_unknown` | 不自动重试 |

## 4. 实现约束：安全与运行

C3-A 是 development-only integration：

- `SANDBOX_ENABLED` 默认关闭；`isAvailable()` 在关闭或 Domain/API Key/Image 缺失时为 false，工具不出现在模型 schema。production 默认不暴露 `execute_command`。
- `execute_command.executionPolicy.approval` 固定为 `require_approval`。
- Approval 绑定完整 command、cwd、timeout、Stage fileId/path 和 Collect path；参数变化必须重新审批。
- 使用 Host 配置并 pin digest 的固定镜像，以固定非 root UID/GID 运行。未配置 image digest 则 fail-closed；仓库不写死具体 digest。
- 模型不能指定 image、entrypoint、volume、env、resource、credential、network policy，也不能请求 DSH 式 `sandbox_permissions` 升权。
- 网络完全 deny，无开发放行开关。C3-A 只跑镜像里已有的解释器和工具；`pip`/`npm` 留给 C3-B 的 Host allowlist。
- 不注入模型、数据库、COS 或 Harness 凭证。
- CPU、Memory、Disk、PID、TTL、命令时间、Stage/Collect 容量和输出容量都有 Host 上限。
- Tool Result 和日志过滤 Provider 原始错误中的密钥、环境变量和内部路径。
- SDK 锁定 `@alibaba-group/opensandbox@0.1.11`。
- 配置集中在 `sandbox-config.ts`，环境变量：`SANDBOX_ENABLED`、`SANDBOX_DOMAIN`、`SANDBOX_API_KEY`、`SANDBOX_IMAGE`（必须带 digest）、可选 `SANDBOX_TTL_MS`。

C3-A 初始建议值：

```text
CPU                  1 core
Memory               2 GiB
Disk                 5 GiB
PID                   256
Sandbox TTL           15 min
Command default       30 s
Command maximum       120 s
Cancellation grace    10 s
Tool outer timeout    130 s
Cleanup timeout       10 s
stdout / stderr       各 32 KiB
Stage total           50 MiB / 10 files
Collect               20 MiB / 1 file
```

这些数值是首版配置默认值，不是未来所有 Provider 的永久产品规格。

## 5. 实现约束：可观察性与清理

每次执行至少关联：

```text
sessionId
runId
toolCallId
sandboxSessionId（仅服务端）
command duration
exitCode / signal / timedOut / aborted / status
stdout/stderr truncation
provider latency
session invalidation
cleanup outcome
```

清理顺序：

```text
Tool timeout / cancel
-> abort Tool
-> 终止远端进程树
-> 必要时 destroy Sandbox
-> 删除 Run 映射

正常 Run terminal
-> releaseRun / destroy Sandbox
-> 删除内存映射
-> 记录 cleanup outcome
-> destroy 失败由服务端 TTL 最终回收
```

完整 command 可以进入 Approval 和有界 Activity 输入；stdout/stderr 不能进入长期 Event。Sandbox Session ID、Provider request ID 和 cleanup diagnostics 只留在服务端日志与审计字段。

## 6. C3 总体范围与后续阶段

### 6.1 C3 的长期定位

C3 不是 Python Runner、Notebook 或 Code Interpreter 的同义词，而是 Harness 的**通用隔离执行底座**：

- Python、Node.js、Shell 和任务 CLI。
- 数据处理、图表、网站构建和格式转换。
- C5 Website Generation 的构建、测试和预览。
- C6 Browser Use 的浏览器进程和文件下载。
- Skills 封装的成熟命令流程。

通用 **`bash`**（C3-B 起；C3-A 为 `execute_command`）与结构化领域 Tool 长期共存：前者提供开放式命令能力，后者提供更明确的参数、审批和 UI。

**对齐声明（避免名实不符）**：

| 阶段 | 可对外的表述 |
| --- | --- |
| C3-B 完成后 | 前台 **`bash`** 与 DSH 默认 `dsh-tool-bash` 的**模型契约对齐**（参数、文本结果、exit 标记、默认不批 + 升权审批） |
| C3-C 完成后 | 在 C3-B 上补全 **长任务**（`run_in_background` + `job_*`）与 **网络/安装执行层**；可称 bash 命令行与 DSH 默认组合等价（**除隔离机制**） |
| C3-D 完成后 | Browser、复杂产物与规模化；**不属于**「bash 与 DSH 对齐」 |

**架构原则（C3-B 起贯穿）**：

1. **双轨文件语义**：Workspace 相对路径仅在容器 `/workspace` 有效；Host 文件只经 `inputFiles` Stage / `output` Collect；大输出 spill 到 Host Artifact，模型见 DSH 式截断行 + 引用，不假设本机 spill 路径。
2. **Canonical struct + DSH view**：内部与 UI 以结构化 `BashRunResult`（自 C3-A `ExecuteCommandOutput` 演进）为准；进入 Model Transcript 的 Tool Message 为 `renderBashResult()` 纯文本。
3. **审批 Host 权威**：默认 workspace 内前台命令不 interrupt；network / install 由 Host 规则触发 K3.2；审批绑定 **baseHash + permission 类型**（见 §6.5.2）。
4. **Sandbox as a Tool 不变量**：见 §2 与 §9；OpenSandbox 可替换，细节不进 Prompt。

### 6.2 C3-B：DSH 前台 bash 对齐 + 策略审批改版

**定义**：主工具 **`bash`**；模型侧 DSH 式文本结果；普通命令 **默认不审批**；网络/安装/升权走审批；Terminal UI 与 system prompt 对齐 DSH。OpenSandbox、Stage/Collect、Run 串行与 C3-A 兼容。

#### 6.2.1 必做范围

| ID | 项 | 要点 |
| --- | --- | --- |
| B1 | 工具名 | 主名 `bash`；`execute_command` 仅迁移期别名或一轮 deprecation 后删除 |
| B2 | 参数 | `command`、`description`（必填）、`workdir`、`timeoutMs`；Harness 扩展 `inputFiles`、`output`（schema 标注 optional extension） |
| B3 | timeout | 默认 120s、可配置上限（建议 ≤600s），与 Tool outer timeout 一致 |
| B4 | 执行环境 | resolve→run；`bash -c`；注入 `NO_COLOR`/`TERM=dumb`/`PAGER=cat`；`HARNESS_SHELL`、`HARNESS_SESSION_ID` 等 |
| B5 | 文本 render | stdout → `[stderr]` → `(no output)` → 超时/信号/`[exit code: N]`；**tail 优先截断** |
| B6 | spill | 超长 stdout/stderr spill 到 Host Artifact；`[output truncated; full output: artifact:<artifactId>]` |
| B7 | Transcript | Tool 成功时模型内容为 render 文本，非 JSON stdout |
| B8 | 审批 v1 | Tool 静态 `auto_execute`；`BashCommandPolicyService` 在 Runtime dispatch 前分类；命中 network/install → `tool_approval` |
| B9 | 升权参数 | 对齐 DSH 字段名：`sandbox_permissions`（`network` \| `install`）+ `justification`；仅作升权重试，非首跑必填 |
| B10 | 拒绝标记 | 如 `[sandbox: … denied under <policy> mode]`；可升权时附 DSH 式 hint |
| B11 | 当次 egress | 用户批准 network/install 后，**该次** `session.execute` 使用 Host **v1 固定 allowlist** 放宽 egress；未批准仍 deny |
| B12 | UI / 协议 | Terminal 卡片；`tool_activity` 扩展 `presentation: terminal`、`description`、`exitCode`/`exitSignal`（pill **只信 struct**，不从文本 parse） |
| B13 | System prompt | 短段：检查 bash 结果中的 `[exit code: N]` |
| B14 | first-cause | `timedOut` / `aborted` 互斥，与 DSH 一致 |
| B15 | Bash 策略表 | 与 K5 同步一页：命令类别 ↔ 是否审批 ↔ 升权类型 ↔ 审计字段（见 §6.2.3–§6.2.5） |

#### 6.2.2 明确不进 C3-B

- `run_in_background`、`job_output` / `job_list` / `job_kill`（C3-C）
- 全量 egress 治理、按命令解析域名、install 源策略表扩展（C3-C；C3-B 仅 **批准后当次调用 + v1 固定 allowlist**，见 §6.2.5）
- orphan 对账、durable Sandbox 表、腾讯云 VPC 复验（C3-C）
- agent-browser、多镜像矩阵、PTY / persistent bash、本机 Landlock 实现

#### 6.2.3 Bash 命令策略 v1（K5 与 C3-B 共表）

Host 判定优先于模型 `justification`。v1 建议分类：

| 类别 | 示例 | 默认 | 升权 |
| --- | --- | --- | --- |
| workspace | `ls`、`python script.py`、`make`（无网络） | 自动执行 | — |
| network | `curl`、`wget`、`git clone` https | interrupt | `sandbox_permissions: network` + `justification` |
| install | `pip install`、`npm install`、`apt` | interrupt | `sandbox_permissions: install` + `justification` |
| 容器已 deny | 未批准 egress 的实际连接 | 非零/连接失败 + 文本标记（可升权 hint） | 同 network |

规则实现 v1：**词法/正则**（见 §6.2.3 表 + §6.5.2），不做完整 shell AST；**不得**仅因模型在 description 中声称安全而跳过 interrupt。`npm run` / `npm test` / `npm ci`（无 `install` 子命令）首版归类 workspace，避免误杀。

#### 6.2.4 C3-B 验收标准

1. 工具列表主名为 **`bash`**；`description` 必填。
2. `echo ok`、`exit 42`、空输出：Tool succeeded，文本标记正确。
3. 超长输出：tail + spill 引用，Artifact 可打开。
4. workspace 内普通命令：**无** approval interrupt。
5. `curl` / `pip install`（或策略表等价物）：**有** approval；批准后 **当次调用** 带 v1 allowlist egress；对 allowlist 内 HTTPS（如 `https://example.com`）live 验收可成功；拒绝后无静默开网。
6. 同 Run 文件保留、shell 状态不保留；Stage/Collect/cancel/timeout 回归通过。
7. `pnpm check` 与 sandbox-live（或等价 fake）通过。

**2026-09-22 验收记录（本机 `dev/opensandbox-local` + Workbench UI/API）：**

| 项 | 结果 |
| --- | --- |
| 工具主名 `bash`、`description` 必填 | 通过 |
| `echo` / `exit 42` / 空输出：Tool succeeded + 文本 `[exit code: N]` | 通过 |
| workspace 命令（如 `npm test`）无 approval interrupt | 通过 |
| `pip install` / `curl` 类命令弹出 tool approval | 通过；批准后 install 类可成功 |
| Terminal 卡片、description、Collect → Artifact | 通过 |
| `pnpm build`；API / Web / Protocol 单测 | 通过 |
| 超长 spill → `artifact:<id>` 全文点开 | 未单独签字（B6 代码与单测已覆盖） |
| 同 Run 连续 bash 写读 `/workspace/marker.txt` | 未单独签字（C3-A 同 Run 工作区已验） |
| 批准后 `curl https://example.com` live 成功 | 未单独签字（镜像可能无 `curl`；egress boost 与 allowlist 已实现） |

自动化入口：`pnpm --filter @harness/api test`（含 `bash-render`、`bash-command-policy`、`bash.tool`）；真实 OpenSandbox 回归仍用 `pnpm --filter @harness/api test:sandbox-live`（C3-A 链路 + 可选 live egress）。

**UI 冒烟 Prompt 示例**

1. `请用 bash 在沙箱执行：echo sandbox-ok，说明 stdout 与 exit code。`
2. `请用 bash 执行 exit 42，说明 Tool 是否成功以及 exit code。`
3. `请用 bash 执行 pip install requests（需要的话请申请 network/install 权限），并汇报结果。`

### 6.3 C3-C：后台 job + 沙箱生产 + 网络/安装执行

**定义**：补全 DSH 长任务面；在 C3-B「批准后当次 egress」之上扩展 **allowlist 治理与 install 源**；收口 C3-A TTL-only 回收。

必做：`bash.run_in_background`；`job_output` / `job_list` / `job_kill`；完成通知（K3.3 Follow-up）；Job × Session TTL 规则；进程树 cancel；**扩展** Host egress allowlist（域名级、审计、与命令 URL 解析）；**install 源/包名**策略；Run↔Sandbox 持久关联与 orphan 扫描；`inputFiles` 审批/UI 严格展示（C3-A 尾巴）。

验收：后台 sleep + 增量 job_output + job_kill；已批准 curl 对 **C3-C 扩展表**内任意验收域名成功；orphan 可演示回收。此时可对外称 bash 与 DSH 默认组合**等价（除隔离机制）**。

### 6.4 C3-D：Browser、复杂产物与规模化

对外一个 C3-D；对内建议两里程碑：

- **D1**：容器内 Chromium / agent-browser；截图、下载 → Artifact；是否独立 `browser_use` Tool 按需立项。
- **D2**：镜像矩阵、预热/快照（Provider 支持时）、并发与 TTL、多 Provider、成本观测。

C5/C6：C3-D 管浏览器进程与文件；C6 管页面动作语义与 K5 页面写操作。

### 6.5 C3-B 冻结决策（参考 DSH + Harness 云映射）

以下结论 **已拍板**，实施 C3-B 以本节为准；与 DSH 差异处已注明。

#### 6.5.1 产品与 DSH 对齐

| 决策 | 结论 | DSH / 说明 |
| --- | --- | --- |
| 批准后 egress | C3-B **必须**在 user approve 后对 **该次 Tool 执行** 临时放宽 OpenSandbox egress（v1 **Host 固定 allowlist**），使「同命令升权重试」可真实成功；**不是**仅审计留到 C3-C | 同 DSH「升权后同一命令再跑」 |
| allowlist v1 | 首版写死少量 HTTPS 目标（如 `example.com`、`pypi.org`、`registry.npmjs.org`、`github.com`）；**不开全网**；C3-C 扩展域名表与审计 | 云映射替代本机「更宽文件 mode」 |
| `workdir` / `cwd` | 对外 **仅 `workdir`**（breaking）；协议与 schema **一个版本**内解析入参 `cwd` → `workdir` 后废弃 | DSH 用 `workdir` |
| spill 引用 | 模型可见：`[output truncated; full output: artifact:<artifactId>]`；Workbench 用 artifactId 打开 | DSH 用本机 spill 路径 |
| 升权字段 | **`sandbox_permissions`** + **`justification`**（DSH 同名）；枚举仅 `network` \| `install`（不含本机 file mode） | 文件升权在容器侧用 workspace 边界代替 |
| 首跑 vs 升权 | 首跑仅 `command`/`description`/`workdir`/…；遭 deny 或策略 interrupt 后，**同一 turn** 可带升权重试 | 同 DSH |
| `pip install` 无网 | 仍走 install interrupt；批准后开 v1 egress；失败则 **非零 exit 文本结果**，非 Tool failed | 同 DSH 非零即结果 |
| 历史 `execute_command` | UI/Snapshot **只读**展示旧名；新 Run 仅注册 **`bash`**；不迁移旧 Tool Message 文本格式 | — |

#### 6.5.2 架构与 Runtime

| 决策 | 结论 |
| --- | --- |
| Canonical vs 模型 | **Struct**（`BashRunResult`，C3-B 为 `ExecuteCommandOutput` type alias）供事件、日志、UI pill；**Transcript Tool Message 仅** `renderBashResult()` **纯文本** |
| 动态审批 | 独立 **`BashCommandPolicyService`**；`bash` Tool 静态 `approval: auto_execute`；Runtime 在组 `approvalItems` 前 `classify(input)` |
| `argumentsHash` | 对 **基础参数** 哈希：`command`、`workdir`、`timeoutMs`、`inputFiles`、`output`（稳定 JSON）；**不含** `sandbox_permissions` / `justification`。审批记录绑定 **baseHash + permission 类型**；批准后执行带 **当次 egress boost** |
| 工具别名 | 实现可保留 `execute_command` → 同一 Handler **一个版本周期**；**模型 definitions 只暴露 `bash`** |
| 截断 | **Tail 优先**（对齐 DSH）；弃用 head+tail 作为模型可见策略（内部调试可保留 bytes 统计） |
| 终端 env | 每次 execute 注入 `NO_COLOR`、`TERM=dumb`、`PAGER=cat`、`GIT_PAGER=cat`；`HARNESS_SHELL=1`、`HARNESS_SESSION_ID=<sessionId>` |
| timeout | 默认 **120_000** ms，上限 **600_000** ms（配置项，对齐 DSH bash-local 量级） |
| 策略 v1 实现 | 正则/词法表（§6.2.3）；首版 **不** 做 shell AST；漏网靠容器 deny + 标记 + 升权；运维侧采样误杀日志，**不** 阻塞 C3-B |
| 审批 UI | 展示 **策略类**（network/install）+ command summary + description；不只裸 command |
| 测试 | 单测：**golden** render 字符串（从 DSH 标记规则移植）；集成：无审批 `echo`、有审批 `curl https://example.com` |

#### 6.5.3 egress v1 固定 allowlist（配置真源）

实施时写入 `sandbox-config` 或等价配置（Host 只读，**不进模型 prompt**）：

```text
example.com
pypi.org
files.pythonhosted.org
registry.npmjs.org
registry.npmmirror.com   # 可选，按部署
github.com
codeload.github.com
raw.githubusercontent.com
```

Provider 若不支持单次 execute 级 networkPolicy，则在 C3-B **整 Session 临时放宽至上述 allowlist**（仅该 Run 在「已批准 network/install 的调用窗口内」），调用结束恢复 deny；Run 串行前提下与 DSH 单次升权等价。

#### 6.5.4 代码触达面（相对 C3-A）

```text
packages/agent-protocol     bash 名、workdir/description、sandbox_permissions、tool_activity terminal 字段
apps/api/src/tools          BashTool、render、spill→Artifact
apps/api/src/agent-runtime  policy.classify + approvalItems；bash 专用 serializeToolSuccess
apps/api/src/sandbox        env 包装、tail 截断、egress boost hook、first-cause
apps/web                    Terminal 卡片、审批策略类展示
```

#### 6.5.5 文件双轨（prompt 冻结文案要点）

- Workspace 路径只在 `/workspace` 内有效。  
- Host 文件只用 `inputFiles` / `output`（Harness extension）。  
- spill 用 `artifact:<id>`，不要用 shell 去读 Host。

## 7. 与其他 Capability 的关系

- **C4 MCP**：高权限 MCP、Credential 和业务系统连接默认留在 Host，不能因为 Sandbox 可运行程序就搬入执行面。
- **C5 Website Generation**：使用 C3 安装依赖、构建和测试；源码与构建结果最终进入 Artifact，不以 Sandbox 路径交付。
- **C6 Browser Use**：C3 管理浏览器进程、文件、网络和隔离；C6 管理动作语义、登录、页面副作用、截图和用户接管。
- **C7 Skills**：Skill 可以封装命令流程，但不能扩大 Sandbox 权限或绕过 Tool Policy。

## 8. 后续开放问题

C3-A 已冻结项见 §9。C3-B 决策见 §6.5；其余：

1. 完整 PTY 与用户可见 Terminal（非 C3-B/C 目标）。
2. 多镜像矩阵与预装版本（C3-D D2；install 执行与 C3-C 衔接）。
3. `agent-browser` 登录、用户接管（C3-D D1 / C6）。
4. 受控代理与 Secret Proxy（C3-C/C3-D）。
5. Host 崩溃后对账与 exactly-once（C3-C）。
6. 多输出 Artifact、目录打包、自动 Diff（按需，不阻塞 C3-B）。
7. Follow-up / Session 是否复用 Sandbox（C3-C job 设计时冻结）。

## 9. 当前冻结结论

1. C3 采用 OpenAI 官方 “Sandbox as a Tool” 架构，Harness 留在可信 Host。
2. 已部署的 OpenSandbox + Docker 是 C3-A 首版 Provider 和执行 backend。
3. C3-A 模型 Tool 名为 `execute_command`；C3-B 起主名为 `bash`，按普通 Tool Loop 处理。
4. 命令执行纪律对齐 DSH 默认 `bash`：全新 `bash -c`、`resolve(request)`、正交结果、有界输出、fail-closed；有状态的是 Workspace，不是 shell。
5. 首版是 Run-scoped、同 Run 串行的 Sandbox Session；正常命令完成后保留容器。
6. 输入显式 Stage，每次调用最多 Collect 一个输出 Artifact。
7. timeout/cancel 必须终止远端进程树，并按第一原因区分 `timedOut` 与 `aborted`；能力不明确时销毁整个 Sandbox。
8. 所有 Sandbox 有服务端 TTL；C3-A 不承诺进程重启恢复。
9. C3-A 修改公共协议，但不实现 Terminal、流式日志、后台 jobs、本机文件沙箱升权或 Browser 动作协议。
10. C3-A 默认关闭、**每条命令强制审批**、固定非 root 镜像和完全 deny 网络；C3-B 改为默认不批 + 升权审批，仍 fail-closed、无静默 Host shell。
11. 命令正常结束即可 Collect，不要求 exit 0；timeout/cancel 不 Collect。
12. Provider 可替换，OpenSandbox/Docker 细节不得扩散到 Runtime、Prompt 或公共业务身份。

## 10. 调研参考

- DeepSeek Harness bash 执行纪律（借鉴范围见第 2.3 节）：`packages/shell/tool-bash`、`packages/shell/bash-local`、`docs/subsystems/shell.md`
- [OpenAI Cookbook：Architecture — sandbox as a tool](https://developers.openai.com/cookbook/examples/agents_sdk/sandboxed-code-migration/sandboxed_code_migration_agent#architecture-sandbox-as-a-tool)
- [OpenAI Codex Sandbox](https://learn.chatgpt.com/docs/sandboxing)
- [OpenAI Codex Cloud](https://learn.chatgpt.com/docs/cloud)
- [OpenAI Codex Cloud Environments](https://learn.chatgpt.com/docs/environments/cloud-environment)
- [OpenAI Codex App Server：Command execution approvals](https://learn.chatgpt.com/docs/app-server#command-execution-approvals)
- [Claude Code Security](https://code.claude.com/docs/en/security)
- [Claude Code Sandboxing](https://code.claude.com/docs/en/sandboxing)
- [Devin Introduction and Workspace](https://docs.devin.ai/get-started/devin-intro)
- [E2B Coding Agents](https://docs.e2b.dev/use-cases/coding-agents)
