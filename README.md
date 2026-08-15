# Hello Harness Agent

面向终端用户的本地任务工作台。当前优先完成通用型 Agent 的端到端任务体验，其中联网调查能够搜索线索、读取公开网页、筛选相关原文，并由模型决定继续调查或作答。

当前已完成工程基线、持久化聊天、General Web Research V1、Model-led Tool Boundary 和 Connection-Durable Agent Loop 时序加固：Run 已与 Chat/SSE 解耦，Ordered Model Rounds、Canonical Live Projection、版本化 PostgreSQL Checkpoint、Checkpoint 水位后的 Event Tail、严格 SSE cursor 和终态 CAS 已落地。客户端断线、刷新和切换会话可以恢复，且不牺牲普通 Tool Round 的 Content 首字速度。服务端重启后的自动续跑不属于本阶段；Context Compiler、Memory 和 Delegation 尚未实现，Deep Research 引用/报告是否建设由后续产品需求决定。

独立的 `@harness/agent-evals` 已提供 6 题 Smoke 和 24 题 Full 真实黑盒评测，覆盖生产 Session、Chat SSE、工具执行、持久化快照、确定性硬规则、模型 Judge 和人工抽检文件。

## 当前能力

```text
已实现
  Web 工作台壳层与响应式布局
  API health/readiness 与统一错误响应
  OpenAI-compatible 持久化对话与 session-scoped Chat SSE
  最多 20 次工具调用的简化 Agent Loop
  Bocha 或 Serper 单 Provider 网页搜索（每次最多 10 条）
  公开静态网页批量读取与 query-aware Passage 筛选
  每个 assistant run 最多 20 次模型声明的 Tool Call
  单次 Fetch URL/正文去重、正文质量门和安全处理边界
  真实工具 Activity、Clue/已读/采用来源 Workbench 与刷新恢复
  可配置模型、base URL 和 API key
  PostgreSQL 连接和 Prisma migration
  单个本地用户自动初始化
  本地 Artifact 目录 readiness 检查
  结构化日志、配置校验和敏感字段脱敏
  unit / integration / desktop+mobile E2E

下一阶段
  全局 Context Engineering
  真实评测事实源与行为阈值校准
  Release Hardening

后续能力
  搜索 fallback
  Markdown Report Artifact
  steer 和更完整的运行控制
  user Memory 与 Delegation
```

## 环境要求

- Node.js 22+
- pnpm 10+
- 本地 PostgreSQL 14+

项目使用非默认端口，避免与常见本地服务冲突：

| 服务       | 地址/端口                     |
| ---------- | ----------------------------- |
| Web        | `http://127.0.0.1:4317/agent` |
| API        | `http://127.0.0.1:4318`       |
| PostgreSQL | `127.0.0.1:5432`              |

## 本地启动

首次启动：

```bash
cp .env.example .env
pnpm install
pnpm db -- init
pnpm db -- deploy
pnpm dev
```

普通对话只需在 `.env` 中配置 `OPENAI_API_KEY`。当前模型、Base URL、推理能力和请求参数统一维护在 `apps/api/src/model/model-catalog.ts`；未配置 Key 时 API 仍可启动，但发送消息会返回 `MODEL_NOT_CONFIGURED`。

联网检索一次只启用一个 Provider，例如 `SEARCH_PROVIDER=bocha` 并填写 `BOCHA_SEARCH_API_KEY`，或使用 `SEARCH_PROVIDER=serp` 和 `SERPER_SEARCH_API_KEY`。未配置 Provider 或对应 Key 时不向模型暴露 `web_search`，普通聊天不受影响。当前不支持 `bocha,serp`、fallback 或并行 Provider。

`web_search` 和 `web_fetch` 在可用时同时暴露给模型，由模型决定调用顺序。`web_fetch` 可以读取任意通过 URL/DNS/redirect 安全 Guard 的公开 HTTP/HTTPS URL；来源是用户直链、搜索线索还是模型直接提出，由 Projection 作为 provenance 事实记录，不作为执行权限。

当前 Runtime 每个 assistant run 最多执行 20 次模型声明的 Tool Call；达到上限后进入一次无工具最终回答。Search 与 Fetch 外层 Tool timeout 分别为 10 秒和 45 秒，Fetch 单 URL transport timeout 为 20 秒。Fetch 仍保留单次调用的安全、响应容量和 24,000 code-point Passage 输出限制，但不再维护跨调用 URL/Passage 预算或领域早停状态。

Model-led Tool Boundary 已实现：模型负责是否继续调查，Runtime 只维护通用执行边界，Tool 只返回 canonical output/error，不再通过领域运行状态或控制意图改变主循环。Tool Result 当前始终注入模型上下文；全局上下文计量、选择、压缩和淘汰留给后续 Context Engineering。设计与落地边界见 [`docs/25-model-led-tool-boundary.md`](./docs/25-model-led-tool-boundary.md)。

当前 Agent Loop 已完成 Connection-Durable 时序加固：客户端断线或刷新不取消 Run，前端通过 PostgreSQL Durable Checkpoint、Checkpoint 水位后的进程内 Event Tail 和 Live SSE 恢复运行视图；Ordered Model Rounds 在保留 Content 首字流式速度的同时稳定混合 Content/Tool Call 顺序。Latest Live Snapshot fallback、严格 cursor、版本单调 Checkpoint 和终态 CAS 均已实现。服务端重启后的自动续跑暂不实现，遗留 Run 明确收敛为 `RUN_INTERRUPTED`。方案与边界见 [`docs/26-connection-durable-agent-loop.md`](./docs/26-connection-durable-agent-loop.md)。

完成首次初始化和迁移后，日常开发只需运行 `pnpm dev`；本机 PostgreSQL 由操作系统/Homebrew 服务持续运行。

随后访问 `http://127.0.0.1:4317/agent`。

健康检查：

```bash
curl http://127.0.0.1:4318/healthz
curl http://127.0.0.1:4318/readyz
```

常用命令：

```bash
pnpm check             # lint + typecheck + unit tests + build
pnpm test:integration  # API/PostgreSQL integration tests
pnpm test:e2e          # desktop/mobile browser tests
pnpm eval -- research smoke # 串行运行 6 题真实联网 Smoke 评测
pnpm eval -- research full  # 串行运行 24 题真实联网 Full 评测
pnpm setup                  # 首次准备本地数据库、应用 migration 并生成 Prisma Client
pnpm db -- update           # 拉取数据库变更后应用 migration 并生成 Prisma Client
pnpm db -- migrate          # 仅在修改 schema.prisma 时创建开发 migration
pnpm db -- studio           # 打开 Prisma Studio
```

日常只需要在首次安装时运行 `pnpm setup`，拉取到新的 Prisma migration 后运行 `pnpm db -- update`。`pnpm db -- init|deploy|generate` 作为底层排障入口继续保留；运行 `pnpm db -- --help` 可查看完整参数。PostgreSQL 使用本机服务，Web 和 API 通过 pnpm 在宿主机运行。首次初始化会创建或更新 `.env` 中配置的 PostgreSQL 用户和数据库；停止或重启数据库由本机 PostgreSQL 服务管理。API、数据库端口和连接字符串从 `.env` 读取；修改 Web 端口时还需同步 `apps/web/package.json`、Playwright 配置和 `WEB_ORIGIN`。

## 工程结构

```text
apps/web                React/Vite 工作台
apps/api                NestJS API + Prisma
packages/agent-protocol 跨前后端 canonical schema/type
packages/agent-testkit  确定性测试 fixtures
packages/agent-evals    General Web Research 真实黑盒评测
scripts                 本地开发和 PostgreSQL 初始化脚本
artifacts               本地 Artifact 内容根目录
docs                    产品、架构与实施文档
```

## 阅读顺序

1. [当前研发状态](./docs/implementation-status.md)
2. [阶段面试知识点](./docs/interview-knowledge.md)
3. [阶段一、阶段二协议](./docs/21-chat-tool-protocol.md)
4. [总路线图](./docs/00-agent-core-roadmap.md)
5. [首发调研产品契约](./docs/13-research-workflow.md)
6. [顶层架构](./docs/agent-core-architecture.md)
7. [渐进实施计划](./docs/17-implementation-plan.md)
8. [工程结构](./docs/18-project-structure.md)
9. [API 协议](./docs/11-api-protocol.md)
10. [存储方案](./docs/12-storage-schema.md)
11. [General Web Research 真实评测](./docs/24-general-web-research-evaluation.md)

## 文档规则

- `00-agent-core-roadmap.md` 决定范围和里程碑。
- `13-research-workflow.md` 决定 R1 用户体验与质量门槛。
- `17-implementation-plan.md` 决定阶段交付和验收。
- 专题文档不得扩大 R1 范围或复制 canonical schema。
- capability 只在对应阶段创建，不生成空模块、假接口或无行为 UI。
- 新增业务代码按函数级别补充精简中文注释；业务阈值、状态容器、缓存/索引、异步生命周期标记、跨层映射和共享 fixture 等非直观变量也需要说明用途。命名已完整表达含义的短生命周期局部变量不机械加注释。简单单行注释使用 `//`，仅在确需解释较长结构时使用文档注释。

# hello-harness-agent
