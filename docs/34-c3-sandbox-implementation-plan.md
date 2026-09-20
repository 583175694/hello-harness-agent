# C3 Sandbox Implementation Plan / C3 沙箱实施设计

> 文档状态：C3-A 实施设计稿。
>
> 最后更新：2026-09-20。
>
> 本文把 [33-c3-agent-sandbox-cloud-execution.md](./33-c3-agent-sandbox-cloud-execution.md) 的方向收敛为下一阶段可实施的工程边界。本文不把 OpenSandbox HTTP API 直接暴露给 Agent Runtime，也不提前冻结完整的前端、Artifact 或 Browser Use 协议。

## 1. 当前范围

前置 PoC 已完成 OpenSandbox + Docker 的本地和腾讯云基础验证。C3-A 的目标是把这个基础设施接入现有 Harness Tool Loop，形成第一个可测试的 `execute_command` 能力。

```text
当前已完成：
  OpenSandbox Server -> Docker Sandbox -> Shell / Python -> 文件回传 -> 销毁

C3-A 要完成：
  Agent Runtime -> execute_command -> SandboxManager -> OpenSandboxProvider
  -> Run-scoped Session -> Tool Result / Activity
```

C3-A 不包含：

- 生产级多租户调度和多 Provider 路由。
- 用户可见的交互式 Terminal 或完整 PTY。
- 跨 Run 永久机器、Project 级共享 Sandbox 或多 Agent 共享状态。
- 登录态浏览器、页面写操作和用户接管。
- 让 Sandbox 直接访问数据库、对象存储或 Harness 内部凭证。

## 2. 目标模块边界

首版模块放在 `apps/api/src/sandbox/`，并由 `ToolsModule` 组合进现有 Tool Registry。

```text
apps/api/src/sandbox/
  sandbox.module.ts
  sandbox.types.ts
  sandbox-manager.service.ts
  sandbox-provider.ts
  opensandbox.provider.ts
  sandbox-session.ts
  sandbox-error.ts
  sandbox-config.ts

apps/api/src/tools/
  execute-command.tool.ts
```

职责边界：

| 模块 | 责任 | 不负责 |
| --- | --- | --- |
| `SandboxProvider` | 抽象创建、查询、执行、上传、下载、销毁 | Run 语义、审批、Artifact 持久化 |
| `OpenSandboxProvider` | 将抽象映射到 OpenSandbox SDK/API | 向 Runtime 暴露 Provider 响应原文 |
| `SandboxManager` | Run 到 Session 的关联、懒创建、复用、清理、错误映射 | 解析模型 Tool Call |
| `SandboxSession` | 一个 Sandbox 的有状态命令和文件操作 | 决定用户权限或最终交付身份 |
| `ExecuteCommandTool` | 校验输入、调用 Manager、归一化 Tool Result | 直接创建 Docker 容器或拼接 OpenSandbox URL |
| `ToolRegistry` | 暴露工具定义、参数校验和统一分派 | Sandbox 生命周期细节 |

依赖方向必须保持单向：

```text
execute-command.tool
  -> sandbox-manager.service
    -> sandbox-provider
      -> opensandbox.provider
```

Agent Runtime 只依赖 `ToolRegistryService`；不依赖 OpenSandbox SDK、Docker 类型或 Sandbox ID。

## 3. Provider 抽象

以下接口是 C3-A 的最小方向，具体字段可以在实现时补充，但不能把 OpenSandbox 特有字段泄漏到上层。

```ts
export type SandboxId = string;

export type CreateSandboxInput = {
  image: string;
  timeoutMs: number;
  env?: Record<string, string>;
};

export type ExecuteCommandInput = {
  command: string;
  cwd?: string;
  timeoutMs: number;
  signal?: AbortSignal;
};

export type ExecuteCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export interface SandboxProvider {
  create(input: CreateSandboxInput): Promise<SandboxSession>;
}

export interface SandboxSession {
  readonly id: SandboxId;
  execute(input: ExecuteCommandInput): Promise<ExecuteCommandResult>;
  upload(input: { path: string; data: Uint8Array; mode?: number }): Promise<void>;
  download(input: { path: string }): Promise<Uint8Array>;
  destroy(input?: { signal?: AbortSignal }): Promise<void>;
}
```

约束：

- Provider 的方法必须支持 `AbortSignal` 或可证明地在上层超时后结束等待。
- `destroy` 必须幂等；Sandbox 已不存在时视为清理成功。
- Provider 错误必须映射为稳定的内部错误码，不能把 Docker/OpenSandbox 原始堆栈写入模型上下文。
- Sandbox ID 只存在服务端日志、关联记录和诊断数据中，不进入用户业务身份。
- 首版优先使用 SDK 的 server proxy 模式，避免 API 进程直接访问动态 Sandbox 端口。

## 4. Run 与 Sandbox Session 映射

首版采用 Run-scoped、懒创建、单 Session 映射：

```text
Run 第一次调用 execute_command
  -> SandboxManager 查找 runId
  -> 不存在则创建一个 Sandbox
  -> 保存 runId -> session 引用
  -> 后续同一 Run 复用该 Session
  -> Run 终态进入清理流程
  -> destroy Sandbox 并删除活动引用
```

首版规则：

- 一个 Run 最多一个活动 Sandbox Session。
- 同一 Run 的并发命令首版串行化，避免 cwd、依赖安装和文件状态产生竞态。
- 不同 Run 之间绝不共享 Sandbox 或 Workspace。
- Run 结束、取消、超时和进程关闭都必须触发 best-effort cleanup。
- 清理失败不能覆盖原始 Run 结果；清理失败进入告警和遗留回收队列。
- Follow-up 是否复用原 Sandbox 暂不作为 C3-A 前提，首版默认新 Run 新 Session。

进程内映射可以先使用 `Map<runId, SandboxSession>`，但接口要保留后续替换为 durable repository 的可能。C3-A 不承诺 API 进程重启后自动恢复活动 Sandbox。

## 5. `execute_command` Tool 契约

首版使用受限 Shell 字符串，而不是直接暴露 argv 数组。这样可以先兼容 Python、Node、CLI 和浏览器命令，同时把风险判断集中到 Policy 层。

建议输入：

```ts
type ExecuteCommandInput = {
  command: string;       // 1-8,000 code points
  cwd?: string;          // 仅允许 /workspace 下的绝对路径
  timeoutMs?: number;    // 默认 30s，范围 1s-120s
};
```

建议成功结果：

```ts
type ExecuteCommandOutput = {
  exitCode: number;
  stdout: string;        // 有界，超出部分截断并标记
  stderr: string;        // 有界，超出部分截断并标记
  durationMs: number;
  truncated: boolean;
};
```

建议失败状态：

```text
succeeded   命令完成，exitCode 可为非零但请求本身执行成功
timeout     达到 Tool 或 Sandbox 执行上限
cancelled   Run 或用户取消
failed      Provider、参数、镜像或执行基础设施失败
```

命令返回非零退出码不应自动变成 Tool transport failure；应作为结构化结果返回模型，由模型决定是否修复或重试。真正的 Provider 错误、超时和取消使用统一 `ToolExecutionResult` 状态。

## 6. 安全与 Policy 接入

C3-A 不实现命令黑名单作为安全边界。第一版必须接入现有 Tool 外层策略，并为后续 K5 动态策略留下输入：

```text
Tool name
Run / Session
command
cwd
timeoutMs
网络与目标（若未来显式表达）
Workspace 权限
```

最低约束：

- Sandbox 默认使用固定镜像和非 root 用户。
- `cwd` 只能位于 `/workspace`，禁止 Host 路径和 Docker socket。
- 默认不注入模型、数据库、COS 或 Harness 凭证。
- 输出大小、进程数、CPU、Memory、Disk 和总执行时间必须有上限。
- `timeout`、Run cancel 和服务关闭都必须调用 Provider destroy/terminate 路径。
- Tool Result 和日志必须过滤 Provider 原始错误中的密钥、环境变量和内部路径。
- 是否允许网络、安装依赖和访问外部 URL 由后续 Policy 配置，不由模型自行授予。

## 7. 错误映射

Provider 错误至少归一化为以下类别：

| 类别 | Tool 状态 | 是否可重试 |
| --- | --- | --- |
| 参数非法 / cwd 越界 | `failed` | 否 |
| API Key / 权限错误 | `failed` | 否，需配置修复 |
| Sandbox 创建失败 | `failed` | 通常是 |
| 镜像拉取失败 | `failed` | 是，需镜像或网络修复 |
| 命令执行超时 | `timeout` | 是，需缩短命令或增加预算 |
| Run / 用户取消 | `cancelled` | 由用户决定 |
| 下载/Artifact 读取失败 | `failed` | 通常是 |
| 结果未知（请求断开） | `failed`，记录 `execution_unknown` | 不自动重试 |

`execution_unknown` 不能被伪装为命令失败或成功。C3-A 可以先记录诊断字段，正式对账和 exactly-once 语义留到 C3-B/K5。

## 8. 观测与清理

每次执行至少关联：

```text
sessionId
runId
toolCallId
sandboxSessionId（仅服务端）
command duration
exitCode / status
stdout/stderr 截断信息
provider latency
cleanup result
```

首版复用现有 Tool Activity / Run Event，不新增专用前端协议。事件中可以展示“正在执行命令”“命令完成”“命令失败”，但默认不把完整命令输出写入长期 Event；完整输出由 Tool Result 按上限进入模型上下文，服务端诊断日志也必须有界。

清理顺序：

```text
Tool 完成 / timeout / cancel
-> 终止当前命令和进程树
-> Run 终态后 destroy Sandbox
-> 删除内存映射
-> 记录 cleanup outcome
```

## 9. 实施切片

### Step 1：契约和 fake Provider

- 新增 `sandbox.types.ts`、Provider 错误和 fake Provider。
- 编写 Manager 的懒创建、复用、串行化、销毁和错误映射单测。
- 不连接真实 OpenSandbox，不修改模型协议。

### Step 2：OpenSandbox Provider

- API 侧优先使用官方 TypeScript SDK `@alibaba-group/opensandbox`；当前候选版本为 `0.1.11`，正式落地时锁定版本并补充 Provider contract test。现有 Python PoC 使用的是独立的 Python SDK，不能替代 TypeScript adapter 验证。
- 配置 `OPEN_SANDBOX_DOMAIN`、`OPEN_SANDBOX_API_KEY`、镜像、默认超时和 proxy 模式。
- 完成 create/execute/upload/download/destroy 的 adapter。
- 在腾讯云 OpenSandbox 上跑 provider contract test。

### Step 3：`execute_command` Tool

- 新增 Zod input schema、工具定义和执行策略。
- 接入 `ToolsModule` 和 `ToolRegistryService`。
- 复用 Agent Runtime 当前 timeout、AbortSignal、Tool Result 和 Activity 机制。
- 完成命令成功、非零退出、超时、取消、Provider 错误和输出截断测试。

### Step 4：Workspace / Artifact

- 首版只实现显式 upload/download，不做自动 Diff 扫描。
- 从现有 File / Artifact 读取任务输入并 Stage 到 `/workspace`。
- 对显式输出路径执行大小、路径、类型和内容校验后创建 Artifact。
- 只有这一切完成后，才把 C3-A 标记为已完成。

### 后续衔接：C3-C 云端浏览器

- 在腾讯云 x86_64 构建 Chromium + `agent-browser` 镜像。
- 验证 snapshot、screenshot、download 和同一 Session 状态保持。
- 浏览器动作语义仍留给 C6；该验证属于 C3-C，不把浏览器专用参数塞入 `execute_command` 长期契约。

以上不属于 C3-A 验收范围，进入 C3-C 阶段时实施。

## 10. 验收标准

C3-A 通过条件：

- Agent Runtime 能通过普通 Tool Call 创建并复用一个 Run-scoped Sandbox。
- Shell/Python 命令在 OpenSandbox + Docker 中真实执行。
- 命令 stdout、stderr、exit code、timeout、cancel 均能被稳定归一化。
- 同一 Run 的第二次调用能看到第一次调用写入的 `/workspace` 文件。
- 不同 Run 之间 Workspace 隔离。
- Run 完成、失败、取消和超时后 Sandbox 最终被清理。
- Provider 原始 API、容器 ID 和动态端口不进入模型上下文或前端协议。
- 至少一个输入文件 Stage 和一个输出 Artifact Collect 流程通过。
- agent-browser/Chromium 属于后续 C3-C 验收项，不阻塞 C3-A 的 Shell/Python Integration；但必须在 C3-C 完成前通过。

## 11. 暂不更新的文档与协议

C3-A 实施前暂不修改以下公共契约：

- `packages/agent-protocol` 的最终 Tool Schema 版本。
- Web Workbench 的用户可见 Terminal 协议。
- C6 Browser Use 的结构化动作协议。
- C2 Artifact 的最终自动发现和版本语义。

原因是这些契约依赖输出截断、Artifact Collect、审批策略和浏览器能力的实际验证。C3-A 先在 API 内部完成稳定边界，再决定哪些字段需要进入 canonical protocol。

## 12. 下一步

下一步从 Step 1 开始：先实现 fake Provider 与 `SandboxManager` 的单元测试，再接入腾讯云 OpenSandbox。这样可以先验证 Run/Session 生命周期和取消清理，不把远程基础设施的不确定性混入 Runtime 逻辑。
