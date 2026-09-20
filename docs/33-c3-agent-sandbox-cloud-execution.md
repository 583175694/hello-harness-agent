# C3 Agent Sandbox & Cloud Execution Environment / Agent 云端沙箱与执行环境

> 文档状态：C3 统一方向与实施方案；C3-A 工程边界已冻结，可以开始实施。
>
> 最后更新：2026-09-20。
>
> 本文是 C3 的唯一权威文档，同时包含已完成的基础设施 PoC、C3-A 实施方案、冻结契约、后续阶段和验收标准。

## 0. 当前结论

C3 的目标是为每个 Agent Run 提供任务级隔离、可持续且可配置的云端执行环境。模型通过普通 Tool 使用 Sandbox；Agent Runtime、Tool Registry、Policy、Credential、Audit 和 Artifact 继续留在可信 Harness Host。

当前状态：

```text
前置 PoC  OpenSandbox + Docker / Cloud Execution   已通过
C3-A      Sandbox 抽象与 execute_command 接入       待实施，可立即开工
C3-B      首版安全通用 Agent Sandbox                待实施
C3-C      Browser 与复杂 Artifact 工作流            待实施
C3-D      成熟度与规模化                            待实施
```

服务端基础设施已经部署并验证，不属于 C3-A 待办：

- 腾讯云 x86_64 CVM 已部署 OpenSandbox Server 和 Docker backend。
- OpenSandbox 已启用 API Key、systemd 托管和 SDK server proxy。
- 开发机当前通过 SSH 隧道访问；Harness 云端部署后通过 VPC 私网访问。
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
- 同一 Run 的多次正常命令共享 Workspace 和已安装依赖。
- Shell/Python 命令返回有界 stdout、stderr、exit code 和 duration。
- timeout、cancel 和 Provider 错误映射为稳定 Tool Result。
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
| `SandboxSession` | 有状态命令和文件操作 | 权限判断和最终交付身份 |
| `SandboxWorkspaceService` | Stage、路径校验、单文件 Collect、Artifact 导入 | 自动扫描全部输出 |
| `ExecuteCommandTool` | Zod 校验、调用 Manager/Workspace、归一化 Tool Result | 直接调用 OpenSandbox 或 Docker |

Agent Runtime 只依赖 `ToolRegistryService`，不依赖 OpenSandbox SDK、Docker 类型或 Sandbox ID。

### 1.3 实施切片

#### Step 1：公共协议、契约和 fake Provider

- 在 `packages/agent-protocol` 增加 `execute_command` 名称、输入 Schema、公共结果摘要、Activity、Snapshot 和错误码。
- 补齐 Chat / Projection 的显式分支，禁止未知工具回退成 `web_search`。
- 新增 Sandbox types、Provider token、内部错误模型和 fake Provider。
- 实现并测试 Manager 的懒创建、single-flight、同 Run 复用、串行化、Session 失效、幂等销毁和错误映射。
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
- 测试成功、非零退出、timeout、cancel、Session invalidation、Provider 错误、输出截断和未知工具不回退。

#### Step 4：Workspace / Artifact

- 实现 `inputFiles[]` 显式 Stage 和单个 `output` Collect。
- 新增 `FilesService.importGeneratedBytes`、`ArtifactsService.importFromSandbox` 一类受控字节导入能力。
- 校验文件归属、状态、路径、regular-file、symlink、特殊文件、大小、格式、内容和 Session 配额。
- 测试 Stage 失败不执行命令、Collect 失败保留命令结果、Artifact 幂等和清理失败补偿。

### 1.4 C3-A 验收标准

C3-A 只有在以下条件全部满足后才标记完成：

- Agent Runtime 能通过普通 Tool Call 创建并复用 Run-scoped Sandbox。
- Shell/Python 在真实 OpenSandbox + Docker 中执行。
- stdout、stderr、exit code、duration、timeout 和 cancel 均稳定归一化。
- 同一 Run 的正常第二次调用能看到第一次写入的 Workspace；不同 Run 相互隔离。
- timeout/cancel 能证明远端进程树已经终止；被销毁的 Session 不会再次复用。
- Run 完成、失败、取消和服务关闭执行有界 cleanup；失败实例具有非空 TTL 并最终过期。
- 至少一个输入 File Stage 和一个输出 Artifact Collect 闭环通过。
- Provider API、Sandbox ID、容器 ID 和动态端口不进入模型上下文或公共协议。
- `packages/agent-protocol`、SSE、历史 Snapshot 和 Projection 对 `execute_command` 有显式分支。
- stdout/stderr 不进入长期 Event 或 Assistant metadata。
- `SANDBOX_ENABLED` 默认关闭；命令需要审批；固定非 root 镜像、资源上限和默认 deny 网络不能被模型覆盖。
- `agent-browser`/Chromium 不阻塞 C3-A，但必须在 C3-C 前完成云端验证。

## 2. 架构基线：Sandbox as a Tool

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

## 3. C3-A 冻结契约

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
- C3-A 使用受限 Shell 字符串，不同时提供 argv、PTY 或后台进程协议。

### 3.2 Tool Result

```ts
type ExecuteCommandOutput = {
  exitCode: number;
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

- stdout/stderr 按 UTF-8 byte 有界收集，超限保留 head 与 tail 并标记截断。
- 原始输出只进入有界模型 Tool Result，不进入长期 SSE、Assistant metadata 或公共 Projection。
- 非零 exit code 是成功完成的命令结果，不是 Tool transport failure。
- Stage 失败时命令不执行，Tool 返回 `failed`。
- 命令完成但 Collect 失败时 Tool 仍为 `succeeded`，通过 `collection.failed` 返回错误。
- `execution_unknown` 不伪装成成功或普通非零退出，也不自动重试。

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
- `destroy` 幂等，Sandbox 已不存在时视为成功。
- `stat + download` 只允许读取受控 regular file，不能跟随 symlink 逃逸。
- Provider 错误转换为稳定内部错误码；原始堆栈、密钥和内部路径不进入模型上下文。
- Sandbox ID 只用于服务端日志和诊断。
- 首版使用 SDK server proxy，不直接访问动态 Sandbox 端口。

### 3.4 Run / Session 生命周期

- 一个 Run 最多一个活动 Sandbox；不同 Run 绝不共享。
- 第一次使用按 Run single-flight 懒创建。
- 同一 Run 的命令串行执行。
- 正常命令完成后保留 Sandbox。
- timeout/cancel 必须终止完整远端进程树；不能只终止 Host Promise。
- 如果命令级终止能力不能被证明，销毁整个 Sandbox、删除 Run 映射并返回 `session_invalidated`。
- 同一 Run 后续调用会创建全新 Sandbox，异常路径不保证保留 Workspace。
- `RunExecutor.finally` 有界等待 `releaseRun`；清理失败不覆盖 Run 结果。
- `SandboxManager.onModuleDestroy` best-effort 清理全部内存 Session。
- API 崩溃后的最终回收依赖非空服务端 TTL；durable orphan repository 进入 C3-B。
- Follow-up 默认新 Run、新 Sandbox。

### 3.5 Workspace Stage / Collect

- 输入通过 `inputFiles[]` 显式 Stage，不自动挂载全部附件。
- Stage 前验证 File 属于当前 Session 且为 ready。
- 同路径同内容可幂等成功；不同内容默认拒绝覆盖。
- 每次 Tool Call 最多 Collect 一个输出，因为当前 Artifact 以 `(runId, toolCallId)` 唯一。
- Collect 检查目标和所有路径组件，仅允许 regular file；拒绝 symlink、目录、设备、socket、FIFO 和超限文件。
- Host 再验证文件名、扩展名、MIME、内容、哈希、大小和 Session 配额。
- Sandbox 原始字节通过内部 import API 进入 File / Artifact，不重新解释成 Markdown 或 sheets。
- C3-A 不做自动 Diff、目录输出、增量 Collect 或候选 Artifact 自动发现。

### 3.6 公共协议

C3-A 必须修改 `packages/agent-protocol`：

- `AGENT_TOOL_NAMES.executeCommand`。
- `executeCommandInputSchema` 和安全输入摘要。
- 不含 stdout/stderr 的 `executeCommandPublicResultSchema`。
- `ToolExecutionSnapshot`、`tool.started`、`tool.completed` 显式分支。
- Sandbox 创建、Stage、Collect、timeout、cancel、session invalidated 和 cleanup 错误码。
- Chat / Projection 显式处理 `execute_command`，Artifact Collect 成功时追加普通 Artifact block。
- 未知工具不能回退成任何已有工具。

### 3.7 错误映射

| 类别 | Tool 状态 | 是否可重试 |
| --- | --- | --- |
| 参数非法 / cwd 越界 | `failed` | 否 |
| API Key / 权限错误 | `failed` | 否，需修复配置 |
| Sandbox 创建失败 | `failed` | 通常是 |
| 镜像拉取失败 | `failed` | 是，需修复镜像或网络 |
| 命令执行超时 | `timeout` | 是，需缩短命令或增加预算 |
| Run / 用户取消 | `cancelled` | 由用户决定 |
| Stage 失败 | `failed`，命令不执行 | 取决于文件状态 |
| Collect / Artifact 导入失败 | 命令 `succeeded`，`collection.failed` | 通常是 |
| Session 被销毁 | 原 `timeout` / `cancelled`，记录 `session_invalidated` | 后续创建新 Session |
| 请求断开、结果未知 | `failed`，记录 `execution_unknown` | 不自动重试 |

## 4. 安全与运行约束

C3-A 是 development-only integration：

- `SANDBOX_ENABLED` 默认关闭；production 默认不暴露 `execute_command`。
- `execute_command.executionPolicy.approval` 固定为 `require_approval`。
- Approval 绑定完整 command、cwd、timeout、Stage fileId/path 和 Collect path；参数变化必须重新审批。
- 使用 Host 配置并 pin digest 的固定镜像，以固定非 root UID/GID 运行。
- 模型不能指定 image、entrypoint、volume、env、resource、credential 或 network policy。
- 默认网络策略为 deny；开发环境如需依赖源，由 Host 显式配置 allowlist。
- 不注入模型、数据库、COS 或 Harness 凭证。
- CPU、Memory、Disk、PID、TTL、命令时间、Stage/Collect 容量和输出容量都有 Host 上限。
- Tool Result 和日志过滤 Provider 原始错误中的密钥、环境变量和内部路径。

配置应集中在 `sandbox-config.ts`。C3-A 初始建议值：

```text
CPU                  1 core
Memory               2 GiB
Disk                 5 GiB
PID                   256
Sandbox TTL           15 min
Command default       30 s
Command maximum       120 s
Cancellation grace    10 s
Cleanup timeout       10 s
stdout / stderr       各 32 KiB
Stage total           50 MiB / 10 files
Collect               20 MiB / 1 file
```

这些数值是首版配置默认值，不是未来所有 Provider 的永久产品规格。

## 5. 可观察性与清理

每次执行至少关联：

```text
sessionId
runId
toolCallId
sandboxSessionId（仅服务端）
command duration
exitCode / status
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

C3 不是 Python Runner、Notebook 或 Code Interpreter 的同义词，而是 Harness 的通用隔离执行底座：

- Python、Node.js、Shell 和任务 CLI。
- 数据处理、图表、网站构建和格式转换。
- C5 Website Generation 的构建、测试和预览。
- C6 Browser Use 的浏览器进程和文件下载。
- Skills 封装的成熟命令流程。

通用 `execute_command` 与结构化领域 Tool 长期共存：前者提供开放式能力，后者提供更明确的参数、审批和 UI。

### 6.2 C3-B：首版安全通用 Agent Sandbox

- Manager、Provider Adapter 和回收机制生产化加固。
- 动态 Policy / Approval、持久化审计和生产网络治理。
- 持久化 Sandbox 关联、遗留实例扫描和异常对账。
- 更完整的 Workspace 类型、容量和恢复策略。
- Provider 支持时实现保留 Workspace 的进程树级取消。
- Python、Node.js 和基础 CLI 的正式镜像与版本策略。

### 6.3 C3-C：Browser 与复杂 Artifact 工作流

- `agent-browser`/Chromium 云端稳定运行。
- snapshot、screenshot、download 和浏览器状态保持。
- 浏览器输出 Artifact 化。
- 评估结构化 `browser_use` Tool。
- 数据处理、格式转换、图表和 Office 文件流程。

### 6.4 C3-D：成熟度与规模化

- Sandbox 模板、版本、预热、快照和缓存。
- Pause/Resume、更长任务、后台服务和端口生命周期。
- 多 Provider 路由、容量、并发和成本控制。
- 多 Agent Sandbox 策略。
- 企业网络、私有依赖源和 Secret Proxy。

## 7. 与其他 Capability 的关系

- **C4 MCP**：高权限 MCP、Credential 和业务系统连接默认留在 Host，不能因为 Sandbox 可运行程序就搬入执行面。
- **C5 Website Generation**：使用 C3 安装依赖、构建和测试；源码与构建结果最终进入 Artifact，不以 Sandbox 路径交付。
- **C6 Browser Use**：C3 管理浏览器进程、文件、网络和隔离；C6 管理动作语义、登录、页面副作用、截图和用户接管。
- **C7 Skills**：Skill 可以封装命令流程，但不能扩大 Sandbox 权限或绕过 Tool Policy。

## 8. 后续开放问题

以下问题不影响 C3-A 开工：

1. 后台进程、服务端口、完整 PTY 和用户可见 Terminal。
2. 多镜像矩阵、镜像路由、预装工具版本和受控依赖安装。
3. `agent-browser` 显示环境、浏览器状态、下载、登录和用户接管。
4. C3-B 动态 Policy、网络 allowlist、受控代理和 Secret Proxy。
5. Host 崩溃后的持久化对账和 exactly-once 执行语义。
6. 多输出 Artifact、目录打包、自动 Diff 和增量 Collect。
7. 生产资源规格、并发、冷启动、缓存和成本控制。
8. Follow-up、Session 或 Project 是否复用 Sandbox。

## 9. 当前冻结结论

1. C3 采用 OpenAI 官方 “Sandbox as a Tool” 架构，Harness 留在可信 Host。
2. 已部署的 OpenSandbox + Docker 是 C3-A 首版 Provider 和执行 backend。
3. `execute_command` 是首个模型可见 Tool，按普通 Tool Loop 处理。
4. 首版是 Run-scoped、有状态、同 Run 串行的 Sandbox Session。
5. 输入显式 Stage，每次调用最多 Collect 一个输出 Artifact。
6. timeout/cancel 必须终止远端进程树；能力不明确时销毁整个 Sandbox。
7. 所有 Sandbox 有服务端 TTL；C3-A 不承诺进程重启恢复。
8. C3-A 修改公共协议，但不实现 Terminal、流式日志或 Browser 动作协议。
9. C3-A 默认关闭、强制审批、固定非 root 镜像和默认 deny 网络。
10. Provider 可替换，OpenSandbox/Docker 细节不得扩散到 Runtime、Prompt 或公共业务身份。

## 10. 调研参考

- [OpenAI Cookbook：Architecture — sandbox as a tool](https://developers.openai.com/cookbook/examples/agents_sdk/sandboxed-code-migration/sandboxed_code_migration_agent#architecture-sandbox-as-a-tool)
- [OpenAI Codex Sandbox](https://learn.chatgpt.com/docs/sandboxing)
- [OpenAI Codex Cloud](https://learn.chatgpt.com/docs/cloud)
- [OpenAI Codex Cloud Environments](https://learn.chatgpt.com/docs/environments/cloud-environment)
- [OpenAI Codex App Server：Command execution approvals](https://learn.chatgpt.com/docs/app-server#command-execution-approvals)
- [Claude Code Security](https://code.claude.com/docs/en/security)
- [Claude Code Sandboxing](https://code.claude.com/docs/en/sandboxing)
- [Devin Introduction and Workspace](https://docs.devin.ai/get-started/devin-intro)
- [E2B Coding Agents](https://docs.e2b.dev/use-cases/coding-agents)
