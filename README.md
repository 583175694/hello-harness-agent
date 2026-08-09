# Hello Harness Agent

面向终端用户的本地任务工作台。当前优先完成通用型 Agent 的端到端任务体验，其中联网调查能够搜索线索、读取公开网页、筛选相关原文并在有界资源内作答。

当前已完成工程基线、持久化聊天和 General Web Research V1：模型可以迭代调用 `web_search` 与 `web_fetch`，过滤重复或不可用页面，并把已读取来源、资源边界和工具过程投影到 Workbench。正式 Run/Event Store、Context Compiler、Deep Research 引用/报告、Memory 和 Delegation 尚未实现。

## 当前能力

```text
已实现
  Web 工作台壳层与响应式布局
  API health/readiness 与统一错误响应
  OpenAI-compatible 持久化对话与 session-scoped Chat SSE
  最多 20 次工具调用的简化 Agent Loop
  Bocha 或 Serper 单 Provider 网页搜索（每次最多 10 条）
  公开静态网页批量读取与 query-aware Passage 筛选
  每轮 25 个唯一 URL、120 秒调查和 60,000 字符原文安全边界
  URL/正文去重、正文质量门、无新增信息早停
  真实工具 Activity、Clue/已读/采用来源 Workbench 与刷新恢复
  可配置模型、base URL 和 API key
  PostgreSQL 连接和 Prisma migration
  单个本地用户自动初始化
  本地 Artifact 目录 readiness 检查
  结构化日志、配置校验和敏感字段脱敏
  unit / integration / desktop+mobile E2E

待实现（P2+）
  durable session/run/state
  durable Run/Step/Event 与可恢复 Agent Runtime
  Context Compiler、正式 Evidence/引用校验与搜索 fallback
  Markdown Report Artifact
  steer/cancel 和实时事件
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
pnpm db:local:init
pnpm db:deploy
pnpm dev
```

普通对话需要在 `.env` 中配置 `OPENAI_API_KEY`；使用其他 OpenAI-compatible 厂商时，同时填写 `OPENAI_BASE_URL` 和对应的 `OPENAI_MODEL`。未配置 Key 时 API 仍可启动，但发送消息会返回 `MODEL_NOT_CONFIGURED`。

联网检索一次只启用一个 Provider，例如 `SEARCH_PROVIDER=bocha` 并填写 `BOCHA_SEARCH_API_KEY`，或使用 `SEARCH_PROVIDER=serp` 和 `SERPER_SEARCH_API_KEY`。未配置 Provider 或对应 Key 时不向模型暴露 `web_search`，普通聊天不受影响。当前不支持 `bocha,serp`、fallback 或并行 Provider。

`web_search` 和 `web_fetch` 在可用时同时暴露给模型，由模型决定调用顺序。`web_fetch` 的执行层只允许读取用户在当前消息中明确提供的 HTTP/HTTPS 直链，或本轮 `web_search` 返回的 clue URL；模型自行拼出的 URL 不会发起网络请求。

General Web Research 每轮最多接受 25 个唯一 URL，调查阶段最多 120 秒，累计注入模型的 Fetch Passage 最多 60,000 Unicode code points。这些是集中在 Runtime Policy 中的代码常量；触及边界后会停止联网工具，并给最终无工具回答保留 30 秒。

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
pnpm db:local:init     # 初始化本地 harness 用户和数据库
pnpm db:migrate        # 开发期创建并应用 Prisma migration
pnpm db:studio         # 打开 Prisma Studio
```

PostgreSQL 使用本机服务，Web 和 API 通过 pnpm 在宿主机运行。首次初始化会创建或更新 `.env` 中配置的 PostgreSQL 用户和数据库；停止或重启数据库由本机 PostgreSQL 服务管理。API、数据库端口和连接字符串从 `.env` 读取；修改 Web 端口时还需同步 `apps/web/package.json`、Playwright 配置和 `WEB_ORIGIN`。

## 工程结构

```text
apps/web                React/Vite 工作台
apps/api                NestJS API + Prisma
packages/agent-protocol 跨前后端 canonical schema/type
packages/agent-testkit  确定性测试 fixtures
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

## 文档规则

- `00-agent-core-roadmap.md` 决定范围和里程碑。
- `13-research-workflow.md` 决定 R1 用户体验与质量门槛。
- `17-implementation-plan.md` 决定阶段交付和验收。
- 专题文档不得扩大 R1 范围或复制 canonical schema。
- capability 只在对应阶段创建，不生成空模块、假接口或无行为 UI。
- 新增业务代码按函数级别补充精简中文注释；业务阈值、状态容器、缓存/索引、异步生命周期标记、跨层映射和共享 fixture 等非直观变量也需要说明用途。命名已完整表达含义的短生命周期局部变量不机械加注释。简单单行注释使用 `//`，仅在确需解释较长结构时使用文档注释。

# hello-harness-agent
