# Implementation Status

> 文档类型：研发状态快照。它记录当前代码、验证结果和已知限制，不替代产品契约、架构文档或实施计划。
>
> 最后更新：2026-08-04

## 1. 当前结论

项目已经完成 P1 工程基线，以及 P3 前端 Workbench fixture 交互切片。当前可运行的是一个本地单用户 Web/API 工作台和 development-only UI 预览；真实 Agent Runtime、模型调用、搜索供应商、SSE、持久化 session/run 执行链路尚未完成。

当前状态不能描述为“调研 Agent 已可用”。生产 `/agent` 提交任务仍由 API 返回 `CAPABILITY_NOT_IMPLEMENTED`，预览页面中的运行、来源、报告和控制状态均为本地确定性 fixture。

## 2. 已完成

### 工程与基础设施

- pnpm workspace 已建立。
- Web：React + Vite + TypeScript。
- API：NestJS，监听 `4318`。
- PostgreSQL：Docker Compose，监听 `55432`。
- Prisma schema、migration、数据库 readiness 和本地用户初始化已接入。
- canonical 协议包和 agent-testkit 已建立。
- 配置校验、结构化日志、请求 ID 和敏感字段脱敏已接入。
- 根目录 `pnpm dev` 会分别启动 Web/API，等待健康检查通过后输出可点击地址。

### Web 工作台

- `/agent` 生产空状态已实现：Session、Conversation、Composer、服务状态。
- 生产空状态不渲染空 Workbench。
- `/agent/preview?state=...` 仅在开发环境启用。
- Preview 已覆盖 empty、direct-answer、running、waiting、steer、cancelling、cancelled、failed、sources、limited-report、final-report 等状态。
- RunCard 已支持状态摘要、Progress、logical tool call rows、展开/收起、steer 和 cancel。
- 点击 RunCard 或具体工具调用可以打开 Workbench 并定位到对应 Activity execution。
- Activity 已实现 execution timeline、当前调用详情、auto-follow 和手动 pinned 行为。
- Workbench 已实现 Activity、Sources、Report 统一外壳和动态 Tab；没有内容时不显示空工具 Tab。
- Composer 已区分 new-run、clarification、steer、disabled 等状态。
- Workbench、Tab、Activity detail 和 RunCard 展开/收起已加入克制动画，并支持 `prefers-reduced-motion`。
- 使用现有 `lucide-react` 图标库；本地资源目录为 `apps/web/src/assets/`。

## 3. 可用入口

```text
Web production:  http://127.0.0.1:4317/agent
Web preview:     http://127.0.0.1:4317/agent/preview?state=tool-running-open
API health:      http://127.0.0.1:4318/healthz
API readiness:   http://127.0.0.1:4318/readyz
PostgreSQL:      127.0.0.1:55432
```

启动前需要准备 `.env`、依赖和 PostgreSQL：

```bash
pnpm install
pnpm infra:up
pnpm db:deploy
pnpm dev
```

`pnpm dev` 输出的 Web/API 地址以当前配置为准；如果 `4317` 或 `4318` 已被占用，启动脚本会直接报告冲突，不会打印误导性的成功链接。

## 4. 验证记录

最近一次 UI/工程验证已通过：

```text
pnpm check
pnpm test:integration
pnpm --filter @harness/web test:e2e
```

覆盖范围包括：

- Web lint、TypeScript typecheck、unit tests、production build。
- API health/readiness 和 capability boundary integration tests。
- Playwright desktop/mobile E2E。
- production 空状态无空 Workbench。
- running / Sources / Report / waiting / failed / cancel fixture。
- Conversation 到 Workbench 的定位、steer、cancel、状态切换和 1280px 布局。

## 5. 当前未完成

以下内容仍按 `docs/17-implementation-plan.md` 和相关契约文档执行，不能从 Preview 状态推断已经完成：

- durable session、message、run、state 的真实 API 和恢复。
- Agent Runtime、Agent loop 和 OpenAI-compatible ModelAdapter。
- Bocha/SERP 搜索供应商、fallback、证据持久化和引用校验。
- Markdown Report Artifact 的真实生成、保存、下载和重开。
- SSE/事件投影、真实 steer/cancel 控制链路。
- session 创建、打开、删除和多消息历史行为；当前 Sidebar 仍是 UI fixture/静态基线。
- user Memory、Delegation、Worker 和多用户认证。

## 6. 下一阶段建议

按照实施计划，下一步应优先完成确定性 Session/Run vertical slice：

1. 定义并实现 create session、create run、append message 的 canonical API 边界。
2. 使用固定 fixture 驱动真实 State/Event projection，替换 Web 中对应的本地运行状态。
3. 接入 SSE 或等价的增量事件传输，并保留当前 Workbench focus/selection 语义。
4. 为恢复、重复 steer、cancel race 和 session 删除补充 contract/integration tests。

UI fixture 只能作为验收基线，不应继续扩展成伪造的生产 Agent。

## 7. 关联文档

- 产品与范围：[docs/00-agent-core-roadmap.md](./00-agent-core-roadmap.md)
- 实施阶段：[docs/17-implementation-plan.md](./17-implementation-plan.md)
- 前端契约：[docs/19-agent-frontend.md](./19-agent-frontend.md)
- Workbench 契约：[docs/20-agent-workbench.md](./20-agent-workbench.md)
- API 协议：[docs/11-api-protocol.md](./11-api-protocol.md)
- 工程结构：[docs/18-project-structure.md](./18-project-structure.md)

## 8. 维护规则

- 每完成一个可验证的阶段或跨模块切片，更新本文件的“当前结论”“已完成”“验证记录”和“下一阶段建议”。
- 设计变更写入对应契约文档，不在本文件复制完整规范。
- 所有状态必须区分 production capability、development-only fixture 和 planned capability。
- 每次更新保留日期，并记录实际执行过的验证命令。
