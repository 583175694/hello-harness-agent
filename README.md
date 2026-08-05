# Hello Harness Agent

面向终端用户的本地任务工作台。首个黄金任务是使用搜索 API 完成迭代网络调研，并交付带可验证引用的 Markdown 报告。

当前已完成 P1 工程基线：pnpm monorepo、React/Vite Web、NestJS API、Prisma/PostgreSQL、共享协议包、测试与本地开发基础设施。Agent Runtime、模型、搜索、报告生成、Memory 和 Delegation 尚未实现；任务提交会明确返回 `CAPABILITY_NOT_IMPLEMENTED`，不会伪造执行结果。

## 当前能力

```text
已实现
  Web 工作台壳层与响应式布局
  API health/readiness 与统一错误响应
  PostgreSQL 连接和 Prisma migration
  单个本地用户自动初始化
  本地 Artifact 目录 readiness 检查
  结构化日志、配置校验和敏感字段脱敏
  unit / integration / desktop+mobile E2E

待实现（P2+）
  durable session/run/state
  Agent Runtime 和 OpenAI-compatible 模型
  Bocha/SERP 搜索与证据引用
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
2. [总路线图](./docs/00-agent-core-roadmap.md)
3. [首发调研产品契约](./docs/13-research-workflow.md)
4. [顶层架构](./docs/agent-core-architecture.md)
5. [渐进实施计划](./docs/17-implementation-plan.md)
6. [工程结构](./docs/18-project-structure.md)
7. [API 协议](./docs/11-api-protocol.md)
8. [存储方案](./docs/12-storage-schema.md)

## 文档规则

- `00-agent-core-roadmap.md` 决定范围和里程碑。
- `13-research-workflow.md` 决定 R1 用户体验与质量门槛。
- `17-implementation-plan.md` 决定阶段交付和验收。
- 专题文档不得扩大 R1 范围或复制 canonical schema。
- capability 只在对应阶段创建，不生成空模块、假接口或无行为 UI。

# hello-harness-agent
