# Implementation Status

> 文档类型：研发状态快照。它记录当前代码、验证结果和已知限制，不替代产品契约、架构文档或实施计划。
>
> 最后更新：2026-08-05

## 1. 当前结论

项目已经完成 P1 工程基线、P3 前端 Workbench fixture 交互切片，以及持久化普通对话闭环。当前可运行的是一个本地单用户 Web/API 工作台：普通对话通过 OpenAI-compatible Chat Completions 流式返回，Session/Message 持久化到 PostgreSQL，刷新、切换和删除均可恢复；检索 Agent、Run 事件投影和工具执行链路尚未完成。

当前状态不能描述为“调研 Agent 已可用”。生产 `/agent` 的普通对话已调用真实模型；预览页面中的运行、来源、报告和控制状态仍为本地确定性 fixture。

## 2. 已完成

### 工程与基础设施

- pnpm workspace 已建立。
- Web：React + Vite + TypeScript。
- API：NestJS，监听 `4318`。
- PostgreSQL：本机 PostgreSQL 服务，监听 `5432`。
- Prisma schema、migration、数据库 readiness 和本地用户初始化已接入。
- canonical 协议包和 agent-testkit 已建立；阶段一 Chat 协议与阶段二 Function Calling 数据结构已落入共享 schema，当前仅启用阶段一。
- 配置校验、请求 ID 和敏感字段脱敏已接入；生产环境保留结构化 JSON 日志。
- 开发环境日志已切换为彩色中文单行格式，关闭常规 HTTP 请求/响应明细和 Nest 启动路由噪声；模型链路只记录生成开始、首字响应、完成或失败，并提供会话短 ID、模型、上下文条数、首字耗时、总耗时和输出字数。
- OpenAI 官方 SDK 和 OpenAI-compatible Chat Completions 已接入；`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL` 从环境变量读取。
- 普通对话已支持 SSE 流式输出；Web 会先显示用户消息，再逐段更新 assistant 消息。
- Prisma 已实现 `Session`、`Message` 及数据库级联删除；会话和消息固定归属 `local-user`。
- 已实现会话创建、列表、详情、重命名、置顶、删除、session-scoped Chat SSE 和模型标题生成 API。
- 普通对话上下文由 API 从 PostgreSQL 读取最近 20 条消息，Web 不再提交完整历史。
- 首次发送前只保留本地空白草稿；首次发送创建 Session，用户消息先落库，完整 assistant 回复结束后再落库。
- 不同 Session 可并行生成；同一 Session 由内存执行注册表限制为单流，活跃会话禁止删除。
- 用户消息、模型消息和后续报告共用 `MarkdownContent` 组件，支持 GFM、代码块、表格和安全外链。
- 根目录 `pnpm dev` 会分别启动 Web/API，等待健康检查通过后输出可点击地址。

### Web 工作台

- `/agent` 已接入真实 Session Sidebar、Conversation、Composer 和 URL 恢复。
- `/agent?session=<sessionId>` 可刷新恢复；无有效参数时打开最近会话，无会话时进入未持久化空白草稿。
- Web 按 `sessionId` 保存独立消息缓存和 pending 状态，切换会话不会让后台 delta 串入当前视图。
- 首轮回复完成后异步请求模型标题；失败保留临时标题，不影响聊天交付。
- 删除会话有确认交互；删除当前、非当前和最后会话分别按约定选择恢复落点。
- Sidebar 会话项采用单行标题和按需 `…` 菜单，不展示时间或装饰图标；重命名和置顶状态可跨刷新恢复。
- 生产空状态不渲染空 Workbench。
- `/agent/preview?state=...` 仅在开发环境启用。
- Preview 已覆盖 empty、direct-answer、running、waiting、steer、cancelling、cancelled、failed、sources、limited-report、final-report 等状态。
- RunCard 已支持状态摘要、Progress、logical tool call rows、展开/收起、steer 和 cancel。
- 点击 RunCard 或具体工具调用可以打开 Workbench 并定位到对应 Activity execution。
- Activity 已实现 execution timeline、当前调用详情、auto-follow 和手动 pinned 行为。
- Workbench 已实现 Activity、Sources、Report 统一外壳和动态 Tab；没有内容时不显示空工具 Tab。
- Composer 已区分 new-run、clarification、steer、disabled 等状态。
- Composer 支持 Enter 发送、Shift+Enter 换行；提交后立即清空输入框，用户消息和流式 assistant 占位即时显示。
- Workbench、Tab、Activity detail 和 RunCard 展开/收起已加入克制动画，并支持 `prefers-reduced-motion`。
- 使用现有 `lucide-react` 图标库；本地资源目录为 `apps/web/src/assets/`。

## 3. 可用入口

```text
Web production:  http://127.0.0.1:4317/agent
Web preview:     http://127.0.0.1:4317/agent/preview?state=tool-running-open
API health:      http://127.0.0.1:4318/healthz
API readiness:   http://127.0.0.1:4318/readyz
PostgreSQL:      127.0.0.1:5432
```

启动前需要准备 `.env`、依赖和 PostgreSQL：

```bash
pnpm install
pnpm db:local:init
pnpm db:deploy
pnpm dev
```

`pnpm dev` 输出的 Web/API 地址以当前配置为准；如果 `4317` 或 `4318` 已被占用，启动脚本会直接报告冲突，不会打印误导性的成功链接。PostgreSQL 使用本机服务，不再依赖 Docker。

首次完成 `db:local:init` 和 `db:deploy` 后，日常开发只需运行 `pnpm dev`；PostgreSQL 由本机服务管理。

## 4. 验证记录

最近一次 UI/工程验证已通过：

```text
pnpm check
pnpm test:integration
pnpm --filter @harness/web test:e2e
```

2026-08-05 完成会话持久化、Sidebar 操作和日志治理后再次执行：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
git diff --check
```

结果为全量 lint、typecheck、unit test 和 build 通过；API integration 共 9 项通过。另使用临时 API 端口验证开发日志：启动过程仅输出一条中文就绪信息，访问 `/healthz` 不产生请求头、响应对象或 `request completed` 噪声。

覆盖范围包括：

- Web lint、TypeScript typecheck、unit tests、production build。
- API health/readiness 和 capability boundary integration tests。
- Session CRUD、置顶排序、重命名、详情恢复、local-user 归属、级联删除、并发冲突、活跃删除和标题 fallback。
- 开发/生产日志配置分支、HTTP 自动访问日志关闭，以及模型生成关键耗时日志。
- Web 首次发送绑定真实 Session、session-scoped SSE、URL 刷新恢复和持久化 Markdown 消息。
- Playwright desktop/mobile E2E。
- production 空状态无空 Workbench。
- running / Sources / Report / waiting / failed / cancel fixture。
- Conversation 到 Workbench 的定位、steer、cancel、状态切换和 1280px 布局。

## 5. 当前未完成

以下内容仍按 `docs/17-implementation-plan.md` 和相关契约文档执行，不能从 Preview 状态推断已经完成：

- Run、State、Artifact 的持久化和恢复；Session/Message 普通对话持久化已经完成。
- Agent Runtime、Agent loop 和面向工具调用的 OpenAI-compatible ModelAdapter；当前仅有普通 Chat Completions 适配。
- Bocha/SERP 搜索供应商、fallback、证据持久化和引用校验。
- Markdown Report Artifact 的真实生成、保存、下载和重开。
- 面向 Agent Run 的 SSE/事件投影、真实 steer/cancel 控制链路；普通对话 Chat SSE 已完成。
- Function Calling 的实际工具注册、执行循环和结果回传尚未接入；当前仅完成协议结构定义。
- user Memory、Delegation、Worker 和多用户认证。

## 6. 下一阶段建议

按照分阶段演进计划，下一步应优先完成普通 Function Calling vertical slice：

1. 在现有 ChatMessage/ToolCall/ToolResult schema 上接入模型 Function Calling。
2. 建立最小工具注册、参数校验、执行结果回传和循环上限。
3. 先让短工具调用沿用 session-scoped Chat SSE，再评估何时升级为可恢复 Run Event。
4. 工具闭环稳定后，再把 Activity/Workbench fixture 替换为真实事件投影。

UI fixture 只能作为验收基线，不应继续扩展成伪造的生产 Agent。

## 7. 关联文档

- 产品与范围：[docs/00-agent-core-roadmap.md](./00-agent-core-roadmap.md)
- 实施阶段：[docs/17-implementation-plan.md](./17-implementation-plan.md)
- 前端契约：[docs/19-agent-frontend.md](./19-agent-frontend.md)
- Workbench 契约：[docs/20-agent-workbench.md](./20-agent-workbench.md)
- API 协议：[docs/11-api-protocol.md](./11-api-protocol.md)
- 工程结构：[docs/18-project-structure.md](./18-project-structure.md)
- 面试知识点：[docs/interview-knowledge.md](./interview-knowledge.md)

## 8. 维护规则

- 每完成一个可验证的阶段或跨模块切片，更新本文件的“当前结论”“已完成”“验证记录”和“下一阶段建议”。
- 设计变更写入对应契约文档，不在本文件复制完整规范。
- 所有状态必须区分 production capability、development-only fixture 和 planned capability。
- 每次更新保留日期，并记录实际执行过的验证命令。
