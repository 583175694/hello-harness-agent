# Project Structure / Module Boundary

> 文档状态：权威工程结构。P1 目录和基础设施已创建；后续目录仍按实施阶段创建。

## 1. 固定技术栈

```text
Package manager     pnpm workspace
Web                 React + Vite
API                 NestJS
ORM/Migrations      Prisma
Database            PostgreSQL
Local DB runtime    Local PostgreSQL service
Artifact content    local filesystem
Model client        OpenAI official SDK
Testing             unit + contract + integration + Playwright
```

NestJS 只负责 transport、configuration、dependency injection 和 module assembly。领域协议、Runtime、Context Compiler、Citation Validator 和 Finalizer 不依赖 Nest decorator、Prisma generated type 或 HTTP DTO。

## 2. Monorepo

```text
hello-harness-agent/
  apps/
    web/
    api/
  packages/
    agent-protocol/
    agent-testkit/
  docs/
  artifacts/
  scripts/
    setup-local-postgres.mjs
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
```

职责：

```text
apps/web                 终端用户任务工作台
apps/api                 NestJS API + modular Agent backend
packages/agent-protocol  唯一跨模块 schema/type 来源
packages/agent-testkit   deterministic fixtures and contracts
scripts                  本地开发、启动和 PostgreSQL 初始化脚本
artifacts                本地 Artifact 内容根目录；P1 仅用于 readiness
```

当前代码严格停在 P1：API 只有 bootstrap、database、health 和 capability boundary；Web 只有工作台壳层；protocol/testkit 只包含 P1 所需的错误与 fixture。后文的 Runtime、Context、Tooling、Research 等目录是目标形态，不应在对应阶段前创建。

## 3. Canonical Protocol

```text
packages/agent-protocol/src/
  actions/
    lead-actions.ts
    worker-actions.ts             # P11 才创建
  api/
  citations/
  errors/
  evidence/
  events/
  memory/                         # P9 才创建
  refs/
  reports/
  state/
  statuses/
  workbench/
  version.ts
  index.ts
```

约束：

- type 和 runtime validator 来自同一份 canonical 定义。
- Web/API/Testkit 只消费导出。
- protocol package 不依赖 React、NestJS、Prisma、OpenAI SDK 或数据库。
- schema snapshot 和 backward-compatibility policy 在 package 内测试。
- 未进入里程碑的 action/type 不提前导出。

## 4. API 目录

目标形态：

```text
apps/api/src/
  main.ts
  app.module.ts

  bootstrap/
    config.module.ts
    env.schema.ts
    logging.ts

  agent/
    api/
      sessions.controller.ts
      runs.controller.ts
      events.controller.ts
      artifacts.controller.ts
      sources.controller.ts
      workbench.controller.ts

    runtime/
      lead-runtime.ts
      step-scheduler.ts
      action-dispatcher.ts
      runtime-limits.ts
      control-inbox.ts

    context/
      context-material-loader.ts
      context-compiler.ts
      context-ranking.ts

    loop/
      agent-loop.ts
      action-validator.ts
      action-repair.ts

    finalizer/
      response-finalizer.ts

    tooling/
      tool-registry.ts
      tool-executor.ts
      result-normalizer.ts
      observation-builder.ts
      search/
        search-provider.ts
        search-router.ts
        search-normalizer.ts
        providers/
          bocha.provider.ts
          serp.provider.ts

    research/
      research-budget.ts
      evidence-selector.ts
      report-pipeline.ts
      report-review.ts
      citation-validator.ts

    state/
      state-store.ts
      repositories/

    stream/
      event-sink.ts
      event-projector.ts
      workbench-projector.ts

    artifact/
      artifact-store.ts
      local-artifact-store.ts
      artifact-service.ts

    memory/                       # P9/P10
    delegation/                   # P11
    worker/                       # P11

  adapters/
    model/
      openai-model.adapter.ts
      model-profiles.ts
    database/
      prisma/
    clock/
    ids/

  shared/
    errors/
    logging/
```

目录按阶段创建，不生成空 module/service。

## 5. Prisma 边界

```text
Prisma model / generated client
  -> repository implementation
  -> domain record
  -> Runtime/Context/Tooling
```

禁止：

- Controller 直接用 PrismaClient 实现业务流程。
- Runtime 接收 Prisma generated types。
- 把 Prisma transaction 隐藏在多个不可控 service call 中。
- 用数据库 enum 取代 canonical protocol enum。

Prisma migration 是存储实现，`12-storage-schema.md` 是语义和约束来源。

## 6. Runtime 接口

```ts
interface ContextCompiler {
  compile(
    snapshot: StateSnapshot,
    input: ContextCompileInput,
    config: ContextCompileConfig,
  ): CompiledStepContext;
}

interface AgentLoop {
  decide(context: CompiledStepContext): Promise<ValidatedModelAction>;
}

interface ActionDispatcher {
  dispatch(action: ValidatedModelAction, context: DispatchContext): Promise<ActionOutcome>;
}

interface StateStore {
  loadRunSnapshot(runId: string): Promise<RunSnapshot>;
  append(records: StateRecord[]): Promise<void>;
}
```

Runtime 不依赖 NestJS、OpenAI SDK、Search SDK、Prisma 或 React。

## 7. Model Adapter

Secrets 位于 `.env`：

```text
OPENAI_BASE_URL=
OPENAI_API_KEY=
```

非敏感配置位于 model profile table/config：

```ts
type ModelProfile = {
  id: string;
  model: string;
  enabled: boolean;
  contextWindow?: number;
  supportsToolCalling: boolean;
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  tested: boolean;
  defaults: {
    temperature?: number;
    maxOutputTokens?: number;
  };
};
```

endpoint 可配置，但只有 `tested: true` 且通过 evaluation suite 的 profile 属于正式兼容清单。

## 8. Search Provider Adapter

```ts
interface SearchProvider {
  readonly id: string;
  search(input: ProviderSearchInput, signal: AbortSignal): Promise<ProviderSearchResponse>;
}
```

Bocha/SERP SDK 或 HTTP shape 只存在于 provider adapter。Tooling 上层只消费 canonical SearchResult。

Provider API Key 只从 env/config secret resolver 获取，不进入 protocol、State、logs 或 Artifact。

## 9. Artifact Store

R1 使用本地文件系统：

```text
var/artifacts/
  <userId>/
    <sessionId>/
      <artifactId>/
        content
```

要求：

- 路径由稳定 ID 生成，不使用用户标题。
- 写入 temp 文件后 atomic rename。
- metadata 先标记 pending，内容成功后 completed。
- session 删除清理所属文件。
- 启动/定时任务清理 orphan temp 文件。
- ArtifactStore 保持接口，以便 P12 增加远程实现。

## 10. Web 目录

```text
apps/web/src/
  app/
    router.tsx
    providers.tsx

  features/agent/
    api/
    components/
      conversation/
      progress/
      sources/
      report/
      activity/
      debug/
    hooks/
    projection/
      project-conversation.ts
      project-progress.ts
      project-sources.ts
      project-report.ts
      project-activity.ts
    state/
    types/
```

React 组件不直接解释 raw event。所有协议事件先经过 projection/reducer。

R1 不创建 Browser、Terminal、Memory 或 Worker UI 目录。

## 11. Testkit

```text
packages/agent-testkit/src/
  scripted-model-adapter.ts
  scripted-search-provider.ts
  in-memory-state-store.ts
  in-memory-artifact-store.ts
  in-memory-event-sink.ts
  fixed-clock.ts
  fixed-id-generator.ts
  run-fixtures.ts
  search-fixtures.ts
  evidence-fixtures.ts
  report-fixtures.ts
  event-fixtures.ts
```

Testkit 不是生产 fallback。它用于确定性验证 Runtime、Projection、Evidence 和 Citation contract。

## 12. P1/P2 创建边界

P1：

```text
apps/api/src/bootstrap/
apps/api/src/agent/api/
apps/web/src/app/
apps/web/src/features/agent/api/
apps/web/src/features/agent/components/
packages/agent-protocol/
packages/agent-testkit/
scripts/setup-local-postgres.mjs
```

P2 才增加 runtime/finalizer/state/stream/projection。P5 增加 context/loop/model。P6 增加 tooling/search。P7 增加 research/evidence/report。

## 13. 本地启动契约

当前启动命令：

```text
cp .env.example .env
pnpm install
pnpm db:local:init
pnpm db:deploy
pnpm dev
```

默认开发地址：

```text
Web          http://127.0.0.1:4317/agent
API          http://127.0.0.1:4318
PostgreSQL   127.0.0.1:5432
```

README 记录 Node、pnpm、本地 PostgreSQL、迁移和端口要求。`readyz` 只有在 PostgreSQL、Artifact path 和配置校验通过后才 healthy。

## 14. 最终边界

```text
Nest owns transport and assembly.
Prisma owns database access implementation.
Protocol owns schemas.
Runtime owns control flow.
Tooling owns provider execution.
Research owns evidence/report orchestration.
State owns durable facts.
Web owns user experience through projections.
```
