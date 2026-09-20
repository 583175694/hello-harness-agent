# C3 Agent Sandbox & Cloud Execution Environment / Agent 云端沙箱与执行环境

> 文档状态：方向方案稿。本文记录 C3 当前已经达成的产品定位、架构原则、能力边界和阶段建议；Sandbox Provider、持久化协议、网络策略细则、资源规格和完整安全模型仍待后续 PoC 与评审逐步冻结。
>
> 最后更新：2026-09-20。
>
> C3 参考 OpenAI 官方 Cookbook 的 “Sandbox as a Tool” 架构思想：Agent Runtime、Tool Registry、权限、凭证、审计和 Artifact 留在可信 Host，命令、代码、浏览器和其他程序在任务级隔离 Sandbox 中执行。

## 1. 一句话定义

C3 为每个 Agent 任务提供隔离、可持续、可配置的云端执行环境，使 Agent 能通过普通 Tool 在其中运行终端命令、Python、Node.js、`agent-browser` 和其他已安装程序，并将执行结果与生成文件安全地返回 Harness。

核心链路：

```text
模型决定调用 execute_command 等 Tool
-> Agent Runtime 按普通 Tool Call 处理
-> Tool Registry 校验输入并进入 Policy / Approval
-> Tool 通过 Sandbox Manager 使用任务级 Sandbox Session
-> Sandbox 执行命令、代码或程序
-> 收集 stdout、stderr、退出状态和输出文件
-> Host 校验并导入 File / Artifact
-> 以普通 Tool Result 返回模型
-> Agent 根据结果继续任务
```

C3 的目标不是只让 Agent “会运行 Python”，也不是增加一个特殊的终端主循环，而是为 Harness 建立一层通用云端执行底座。Python、Browser Use、数据处理、网站构建、格式转换和未来尚未预见的 CLI 能力都是该底座上的使用场景。

## 2. 背景与定位调整

原路线图将 C3 定义为 `Code Execution Sandbox`，重点包括代码运行、数据清洗、图表和文件处理。这个定义覆盖了部分实现要求，但产品定位偏窄，容易被理解为 Python Runner、Notebook 或 Code Interpreter。

当前将 C3 提升为：

```text
C3 Agent Sandbox & Cloud Execution Environment
```

它与 Codex 本地终端能力的目标相似，但执行位置不同：

```text
Codex 本地形态
Agent -> Tool -> 本机受控执行环境

Harness 云端形态
Agent -> Tool -> 云端隔离 Sandbox
```

模型可见的终端仍然只是一个普通 Tool；Sandbox 是这个 Tool 背后的隔离执行环境。未来其他 Tool 也可以复用同一个 Sandbox。

## 3. 术语约定

### 3.1 Agent Sandbox

Agent 执行模型生成命令、代码和程序的隔离环境，是 C3 的基础设施主体。

### 3.2 Cloud Execution Environment

对 Sandbox 所提供完整环境的描述，包括操作系统、运行时、依赖、工具、工作目录、进程、网络和资源限制。

### 3.3 Sandbox Session

某个 Agent Task / Run 正在使用的 Sandbox 实例。一个 Session 可以承载多次 Tool Call，并在这些调用之间保留文件、依赖和必要的运行状态。

### 3.4 Sandbox Workspace

Sandbox 内当前任务可访问的受控文件区域。用户输入文件、任务中间文件和候选输出都先进入 Workspace，不直接成为 Harness 正式 Artifact。

### 3.5 Command Execution Tool

模型可见的命令执行 Tool。首版建议使用稳定名称 `execute_command`；`shell` 也可作为内部或后续协议名称。`terminal` 更适合描述人类可见的交互界面，不作为基础设施总名称。

### 3.6 Browser Use / Computer Use

运行在 C3 之上的能力。`agent-browser` 可以安装在 Sandbox 中，由 `execute_command` 在 PoC 阶段直接调用，或由后续结构化 `browser_use` Tool 间接调用。

### 3.7 Code Interpreter / Code Execution

运行 Python、JavaScript 等代码的具体能力，是 C3 的子集，不代表 C3 的完整边界。

## 4. 目标与非目标

### 4.1 当前目标

- 为云端 Agent 提供接近 Codex 调用终端的通用执行能力。
- 让模型通过普通 Tool 调用 Sandbox，不改变现有 Model-led Tool Loop。
- 支持同一任务中的多轮命令执行，并保留必要的 Workspace 状态。
- 首批验证 Python 复杂处理与 `agent-browser` 浏览器任务。
- 支持安装或预置 CLI、语言运行时和任务所需工具。
- 将生成文件经过 Host 校验后接入现有 File / Artifact 交付链路。
- 复用现有取消、超时、Tool Approval、Run Event、Projection 和恢复能力。
- 保持 Sandbox Provider 可替换，避免上层业务绑定单一供应商。

### 4.2 当前非目标

- 不把 Agent Runtime、模型调用、Tool Registry 或权限策略整体搬进 Sandbox。
- 不让 Sandbox 直接访问 Harness 数据库、对象存储、内部凭证或宿主文件系统。
- 不将 C3 限定为 Notebook、Python Runner 或数据分析功能。
- 不要求所有领域能力永久通过 Shell 表达；成熟能力仍可封装为结构化 Tool。
- 不在方向稿阶段冻结 Docker、E2B、Cloudflare、Kubernetes 或 MicroVM 等具体 Provider。
- 不在首版承诺任意长时间后台进程、完整交互式 PTY、跨任务永久机器或多 Agent 共享机器。
- 不把 Sandbox 内路径、容器 ID 或 Provider ID 暴露为用户可见业务身份。

## 5. 架构基线：Sandbox as a Tool

### 5.1 总体架构

```text
可信控制面：Harness Host
├── Agent Runtime / Model Loop
├── Tool Registry
├── Context / Transcript
├── Task State
├── Policy / Approval
├── Credentials
├── File / Artifact
├── Audit / Observability
└── Sandbox Manager
        ↓
隔离执行面：Sandbox Session
├── Sandbox Workspace
├── Shell / Process
├── Python / Node.js
├── agent-browser / Browser
├── 任务所需 CLI 与依赖
└── 临时输入、中间文件和输出文件
```

可信 Host 拥有任务语义、工具契约、权限、凭证、审计和最终交付事实；Sandbox 只获得完成当前任务所需的 Workspace 和执行能力。

### 5.2 为什么 Agent Runtime 留在 Host

Agent Runtime 留在 Sandbox 外可以确保：

- Sandbox 中的代码不能修改 Tool Registry 和 Policy。
- 模型供应商凭证、数据库凭证和内部服务凭证不进入执行环境。
- Sandbox 不能自行伪造审批结果、ArtifactRef 或 Run 终态。
- MCP、外部服务和高权限能力可以继续由可信 Host 代理。
- Sandbox Provider 可以替换而不改变 Agent Loop。
- Sandbox 输出可以在进入用户交付链路前由 Host 独立校验。

### 5.3 Sandbox 不是特殊 Agent 主循环

现有 Runtime 仍按统一路径处理工具：

```text
Model Tool Call
-> Tool Registry
-> Input Validation
-> Policy / Approval
-> Tool Execute
-> ToolExecutionResult
-> Transcript / Projection
-> Next Model Round
```

`execute_command` 与 `web_search`、`create_file`、`create_report` 在 Runtime 视角下没有本质区别。差异只在 Tool 内部：`execute_command` 将工作委托给 Sandbox Manager。

## 6. 模型可见 Tool 与 Sandbox 的关系

### 6.1 首个 Tool：execute_command

首版优先提供一个通用命令执行 Tool：

```text
execute_command
-> Sandbox Manager
-> 当前 Run 的 Sandbox Session
-> 执行命令
-> 返回结构化结果
```

方向层面至少需要表达：

- 要执行的命令或程序参数。
- 工作目录。
- 有界超时。
- 标准输出和标准错误。
- 退出状态。
- 是否超时、取消或被策略拒绝。
- 候选输出文件或 Workspace 变化摘要。

具体 Input Schema、字符串 Shell 与结构化 argv 的取舍、输出截断策略和长命令协议后续单独冻结。

### 6.2 后续结构化 Tool

通用命令执行不排斥领域 Tool。后续可以形成：

```text
execute_command
  通用、开放式、适合 PoC 和未知任务

browser_use
  结构化浏览器操作，内部可调用 Sandbox 中的 agent-browser

run_python
  结构化 Python 输入输出、数据和图表能力

render_document
  运行文档、网页或其他交付物的渲染、导出或校验程序
```

成熟、稳定和高频的能力应逐步封装为结构化 Tool，以获得更明确的参数、审批、可观察性和 UI；`execute_command` 保留为通用逃生口和能力探索入口。

### 6.3 Browser Use 的分层

PoC 可以直接使用：

```text
execute_command("agent-browser ...")
```

产品化后建议使用：

```text
browser_use Tool
-> Browser Adapter
-> Sandbox Session
-> agent-browser
-> Sandbox Browser
```

C3 负责让浏览器进程、命令、文件下载和网络策略可以在 Sandbox 中运行；C6 Browser Use 负责浏览器动作语义、登录态、页面副作用审批、截图和用户接管体验。

### 6.4 Python 能力的分层

PoC 阶段可以通过 `execute_command` 运行 Python 脚本，不必立即增加专用 Tool。只有在真实需求证明需要稳定代码输入、数据挂载、图表、Notebook 或结构化结果时，再增加 `run_python`。

## 7. Sandbox 生命周期

### 7.1 首版建议：Run-scoped Sandbox

首版建议一个需要执行能力的 Agent Run 对应一个 Sandbox Session：

```text
Run 第一次调用 Sandbox Tool
-> 懒创建 Sandbox Session
-> Stage 当前任务需要的文件
-> 多次 Tool Call 共享 Workspace 和已安装依赖
-> 提取最终文件和执行摘要
-> Run terminal 后有界清理
```

同一 Run 中复用 Sandbox 是复杂任务成立的前提。例如：

```text
第一次调用：生成 Python 脚本
第二次调用：安装或确认依赖
第三次调用：执行分析
第四次调用：检查输出
第五次调用：调用 agent-browser 验证页面
```

### 7.2 后续演进

后续根据真实需求再评估：

- Follow-up 是否复用原 Sandbox。
- Session 级 Sandbox 或 Project 级 Workspace。
- Pause / Resume 和 Provider 快照。
- 长任务、后台服务和端口生命周期。
- 多 Agent 独立 Sandbox 或受控共享 Workspace。
- Sandbox 缓存、预热和镜像版本迁移。

这些能力不作为首版架构前提。

## 8. 文件与 Artifact 边界

Sandbox Workspace 中的文件不是 Harness 正式 File / Artifact。标准链路应为：

```text
Harness File / Source
-> 选择当前任务需要的内容
-> Stage 到 Sandbox Workspace
-> Sandbox 处理并生成候选输出
-> Host 提取输出
-> 路径、大小、格式和安全校验
-> 写入正式存储
-> 创建 FileRef / ArtifactRef
-> 返回 Tool Result 和 Workbench
```

必须保持以下边界：

- Sandbox 路径只在执行期有效。
- 用户不能仅凭 Sandbox 路径访问文件。
- Tool 不能把容器路径伪装为成功 Artifact。
- 符号链接、路径逃逸和特殊文件必须在 Host 拒绝。
- 文件类型、大小、扩展名和内容继续使用现有 File / Artifact 安全边界。
- Sandbox 被销毁后，正式 Artifact 仍应独立恢复和下载。

## 9. 执行结果与 Tool Result

Sandbox 内部执行可以很复杂，但 Runtime 继续使用统一 Tool Result：

```ts
type ToolExecutionResult<TOutput> =
  | { status: 'succeeded'; output: TOutput }
  | {
      status: 'failed' | 'timeout' | 'cancelled';
      error: { code: string; detail: string; retryable: boolean };
    };
```

`execute_command` 的成功输出方向上可以包括：

```ts
type CommandOutput = {
  exitCode: number;
  stdout: string;
  stderr: string;
  artifacts?: ArtifactRef[];
  changedFiles?: Array<{ path: string; kind: 'created' | 'modified' | 'deleted' }>;
};
```

以上只是方向示意，不在本文冻结具体协议。完整输出、日志引用、截断、二进制输出、后台进程和部分成功语义需要在实施方案中继续设计。

## 10. 安全与信任边界方向

C3 是真实副作用能力，必须接入 K5 Side-effect Policy & Governance，不能仅依赖 Prompt 或命令黑名单。

当前冻结的高层原则：

- 默认只 Stage 当前任务必需的数据。
- 默认不向 Sandbox 注入 Harness 或模型供应商凭证。
- 默认限制网络，按域名、协议或任务策略逐步放开。
- Sandbox 不能访问宿主文件系统、数据库和内部控制面。
- 资源限制覆盖 CPU、Memory、Disk、Process、Time 和输出容量。
- 取消和超时必须终止完整进程树，而不仅是 Tool Promise。
- Tool Approval 与实际命令、工作目录、网络目标和 Workspace 权限绑定。
- 参数、目标或权限发生变化时不能复用旧批准。
- Sandbox 输出视为不可信数据，不能改变系统指令和权限。
- 危险命令、提权、持久化驻留和跨 Workspace 访问应由外层策略拒绝或严格审批。
- 所有执行记录需要具备 Run、Tool Call、Sandbox Session 和结果关联。

PoC 可以降低部分工程完备度，但必须明确标记为 development-only，不能把受限工作目录或命令黑名单称为生产级 Sandbox。

## 11. Provider 抽象

上层 Tool 不应直接绑定具体 Sandbox 产品。方向上需要稳定的 Provider / Session 抽象：

```ts
interface SandboxProvider {
  create(input: CreateSandboxInput): Promise<SandboxSession>;
  get(sessionId: string): Promise<SandboxSession>;
  stop(sessionId: string): Promise<void>;
  destroy(sessionId: string): Promise<void>;
}

interface SandboxSession {
  execute(input: CommandInput): Promise<CommandResult>;
  upload(input: UploadInput): Promise<void>;
  download(input: DownloadInput): Promise<Uint8Array>;
  listFiles(input: ListFilesInput): Promise<FileEntry[]>;
}
```

接口仅表达当前方向，不冻结方法数量和协议。候选 Provider 可以包括：

- 本地或开发环境 Docker。
- Hosted Agent Sandbox，例如 E2B。
- 云厂商容器或 MicroVM。
- 后续自建 Kubernetes / Firecracker 执行层。

Provider 选择应通过 PoC 比较启动时间、隔离强度、持久化、浏览器支持、网络策略、成本、并发、地域和运维复杂度后决定。

## 12. 与现有 Harness 架构的关系

### 12.1 继续复用的能力

C3 继续复用：

- Agent Runtime 和 Model Adapter。
- Tool Registry 与输入 Schema 校验。
- Tool 外层 timeout 和 AbortSignal。
- K3 Tool Approval / Interrupt。
- K4 Task State 与计划投影。
- K5 Side-effect Policy 与审计。
- Run Event、SSE、Projection、Checkpoint 和恢复。
- File / Artifact 存储、预览和下载。

### 12.2 需要新增或增强的边界

方向上至少需要新增：

- Sandbox Manager 和 Provider Adapter。
- Run 与 Sandbox Session 的关联。
- Workspace Stage / Collect 流程。
- 命令执行 Tool 和结构化结果。
- 进程树取消、资源限制和输出限制。
- 动态副作用判断，而不只是 Tool 名级静态 Approval。
- Sandbox Execution 的 Activity / Workbench 投影。
- Run terminal 后的 Sandbox 清理和遗留实例回收。

当前 `AgentTool.executionPolicy` 只有静态 timeout 和 approval，足以支撑简单 Tool，但 C3 后续需要结合命令参数、路径、网络和目标计算动态风险。具体 K5/C3 契约另行设计。

## 13. 与其他 Capability 的关系

### 13.1 C5 Website Generation

C5 使用 C3 安装依赖、构建、启动临时服务、运行测试和生成预览。网站源码与构建结果最终进入 Artifact / Workbench，不以 Sandbox 路径作为交付身份。

### 13.2 C6 Browser Use

C6 的 `agent-browser` 和浏览器进程可以运行在 C3 Sandbox 中。C3 管理进程、文件、网络和隔离；C6 管理浏览器动作语义、页面副作用、登录、下载、截图和用户接管。

### 13.3 C7 Skills

Skills 可以把成熟的命令流程、输入约定和输出检查封装成可复用能力。Skill 不扩大 Sandbox 权限，也不能绕过 Tool Policy。

### 13.4 C4 MCP

MCP 与 Sandbox 是互补关系。高权限 MCP、Credential 和外部业务系统连接优先留在可信 Host；仅当 Server 明确适合运行在隔离环境中时，才考虑在 Sandbox 内启动。不能因为 Sandbox 能运行任意程序，就默认把所有 Credential 和 MCP Server 搬入其中。

## 14. 建议阶段

### C3-0：Provider 与执行闭环 PoC

目标：验证任务级 Sandbox 能被现有 Tool Loop 调用。

包括：

- 创建、执行和销毁 Sandbox Session。
- 最小 `execute_command` Tool。
- Run 内多次调用共享 Workspace。
- Python 脚本执行。
- stdout、stderr、exit code、timeout 和 cancel。
- 输出文件提取并创建 Artifact。
- 至少一个 `agent-browser` 基础流程。

本阶段可以使用单一 Provider，但上层边界需避免直接泄漏 Provider API。

### C3-1：首版通用 Agent Sandbox

目标：形成可以被真实任务使用的最小安全执行能力。

包括：

- Sandbox Manager 与稳定 Provider Adapter。
- Workspace Stage / Collect。
- 资源、网络和文件边界。
- 动态 Policy / Approval 接入。
- 进程树取消和遗留实例清理。
- 执行 Activity、日志和 Artifact 恢复。
- Python、Node.js 和基础 CLI 环境。

### C3-2：Browser 与 Artifact 工作流

目标：让 Sandbox 支撑开放式浏览器和复杂文件任务。

包括：

- `agent-browser` 稳定运行。
- 浏览器截图、下载和结果 Artifact 化。
- 结构化 `browser_use` Tool 的必要性评估。
- 数据处理、格式转换、图表和 Office 文件流程。
- C5 和 C6 的首批真实接入。

### C3-3：成熟度与规模化

按真实需求逐步增加：

- Sandbox 模板和版本管理。
- 预热、快照、Pause / Resume 和缓存。
- 更长任务和后台服务。
- 多 Provider 路由、容量和成本控制。
- 多 Agent Sandbox 策略。
- 更完整的审计、恢复和异常对账。
- 企业网络、私有依赖源和 Secret Proxy。

## 15. 首批验证场景

### 15.1 Python 复杂任务

```text
用户上传 CSV / XLSX
-> Agent 编写或生成 Python 脚本
-> 在 Sandbox 中运行
-> 检查数据和错误
-> 生成图表或新工作簿
-> 导入 Artifact 并交付
```

### 15.2 agent-browser 浏览器任务

```text
Agent 调用 execute_command 或 browser_use
-> Sandbox 中运行 agent-browser
-> 打开页面并执行受控操作
-> 生成截图、下载文件或结构化结果
-> 返回 Tool Result
-> Agent 判断下一步
```

## 16. 仍待细化的问题

以下问题不在方向稿中提前定死：

1. 首个 Provider 选择和 PoC 对比指标。
2. 一个 Run、Session、Follow-up 与 Sandbox Session 的精确映射。
3. `execute_command` 使用 Shell 字符串还是结构化 argv，是否同时支持。
4. 同步 Tool Call、长任务和后台进程的边界。
5. stdout / stderr 截断、流式事件和完整日志存储。
6. Workspace 文件 Diff、候选 Artifact 发现和显式输出声明。
7. 默认镜像、预装工具和按任务安装依赖的策略。
8. `agent-browser` 的显示环境、浏览器状态、下载和登录策略。
9. 网络白名单、受控代理和 Secret Proxy 的具体实现。
10. Sandbox 故障、Host 故障和执行结果未知时的恢复语义。
11. 资源规格、并发、冷启动、缓存和成本控制。
12. Workbench 是否以及何时提供用户可见 Terminal。

## 17. 当前结论

1. C3 的正式方向是 Agent Sandbox 与 Cloud Execution Environment，不再局限于 Code Execution。
2. `execute_command` 是首个模型可见 Tool；它使用 Sandbox 完成工作，并以普通 Tool Result 返回。
3. Sandbox 是可被多个 Tool 共享的执行后端，不是新的 Agent Runtime，也不是特殊主循环。
4. Harness Host 保留 Agent Loop、Tool Registry、Policy、Credential、Audit 和 Artifact；Sandbox 只获得当前任务需要的 Workspace 和执行能力。
5. 首版采用 Run-scoped、有状态的 Sandbox Session，支持一个任务中的多次 Tool Call 共享文件和依赖。
6. Python 和 `agent-browser` 是首批价值验证场景，不是 C3 的能力边界。
7. 通用 Shell 与结构化领域 Tool 长期共存：前者负责开放式能力，后者负责稳定产品契约。
8. 所有生成文件必须经过 Host 校验并进入正式 File / Artifact 链路，Sandbox 路径不是产品身份。
9. C3 必须接入 K5 Side-effect Policy，安全边界不能依赖 Prompt、命令黑名单或模型自我判断。
10. Provider 必须可替换；具体选型在 PoC 后冻结。

## 18. 调研参考

- [OpenAI Codex Sandbox](https://learn.chatgpt.com/docs/sandboxing)
- [OpenAI Codex Cloud](https://learn.chatgpt.com/docs/cloud)
- [OpenAI Codex Cloud Environments](https://learn.chatgpt.com/docs/environments/cloud-environment)
- [OpenAI Codex App Server：Command execution approvals](https://learn.chatgpt.com/docs/app-server#command-execution-approvals)
- [OpenAI Cookbook：Architecture — sandbox as a tool](https://developers.openai.com/cookbook/examples/agents_sdk/sandboxed-code-migration/sandboxed_code_migration_agent#architecture-sandbox-as-a-tool)
- [Claude Code Security](https://code.claude.com/docs/en/security)
- [Claude Code Sandboxing](https://code.claude.com/docs/en/sandboxing)
- [Devin Introduction and Workspace](https://docs.devin.ai/get-started/devin-intro)
- [E2B Coding Agents](https://docs.e2b.dev/use-cases/coding-agents)
