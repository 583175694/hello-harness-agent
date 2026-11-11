# Native Mobile Phase B — 真 API 手验清单

> 对照 [45-native-mobile-phase-b-integration.md](./45-native-mobile-phase-b-integration.md) §8 与结项完成标准。  
> 勾选表同步维护：[native-mobile-phase-b-status.md](./native-mobile-phase-b-status.md) §8。

## 0. 环境

1. 启动 API：`pnpm dev`（本地默认 **API `http://127.0.0.1:4318`**，Web `4317`）。
2. 探活：
   - `pnpm phase-b:handoff`（跑 `phase-b:verify:ci` 并打印结项待办）
   - `pnpm phase-b:smoke-api`（或 `curl -sS "http://127.0.0.1:4318/readyz"`）
   - 登录后可选：`HARNESS_SESSION_COOKIE='harness_session=…' pnpm phase-b:smoke-api`（含 sessions + MCP + memories 探活）
3. 三端 Settings → **同一 Base URL**（无 trailing slash），登录拿到 session cookie / token。
4. 记录联调用的 `sessionId`、`runId`（与 Web `/agent` 同一账号对比 Snapshot）。

## 1. 主路径（完成标准 1）

| 步骤 | 操作 | Android prod | iOS Release Core | 鸿蒙 Core |
| --- | --- | --- | --- | --- |
| 1 | 新建会话 | ☐ | ☐ | ☐ |
| 2 | Composer 发 Run → SSE 流式 assistant | ☐ | ☐ | ☐ |
| 3 | Stop 取消 Run | ☐ | ☐ | ☐ |
| 4 | 再发 Run；Run 中第二条 → Steer / pending-input | ☐ | ☐ | ☐ |
| 5 | 终态后 Follow-up 发送 / dismiss | ☐ | ☐ | ☐ |
| 6 | 打开 Workbench → 补水（TopBar）；首个 tool 时 **auto-open**；时间线点击 **focus** 到 tool | ☐ | ☐ | ☐ |
| 7 | Settings → MCP 列表 / Test / 删除（或 Memory 开关） | ☐ | ☐ | ☐ |
| 8 | HITL：clarification 作答 + tool approve/reject | ☐ | ☐ | ☐ |
| 9 | Workbench 版本 **修改**（Composer 预填 + Run 带 `artifactVersionContext`） | ☐ | ☐ | ☐ |
| 10 | Workbench **恢复**旧版本 → detail 刷新 → 版本列表更新 | ☐ | ☐ | ☐ |

**Snapshot 对拍（完成标准 2）**

1. 同一账号登录 Web `/agent` 与 Native Core，选中同一 `sessionId`。
2. 终端打印 REST 摘要（与 Web Network 里 `GET …/sessions/:id` 对照）：

```bash
export HARNESS_SESSION_COOKIE='harness_session=…'   # 浏览器 Application / 登录响应
pnpm phase-b:parity <sessionId> [runId]             # session + run 一次打印（推荐）
# 或分步：pnpm phase-b:session-summary <sessionId> / pnpm phase-b:run-summary <runId>
```

3. 必对字段：`sessionId`、`title`、`activeRun.runId` / `status`、`pendingUserInputs` 条数、`artifactSeries` 版本数、最后一条 assistant 的 `runId` + `deliveryStatus`。
4. Run 进行中再对 `GET /api/agent/runs/:runId`（或 `pnpm phase-b:run-summary <runId>`）：`status`、`messageId` 与 Web SSE 终态一致；允许 UI 布局差异，**不允许** runId/sessionId 或终态 status 不一致。

## 2. §8 边界（E1–E12 与重点项）

| ID | 手验步骤摘要 | Android | iOS | 鸿蒙 |
| --- | --- | --- | --- | --- |
| E1 | A/B 两 Session 快速切换；B 的 detail 晚到时不应改当前 A 的 UI | ☐ | ☐ | ☐ |
| E2 | Run 中切 Session 再切回；不应 force detail 覆盖 live 块 | ☐ | ☐ | ☐ |
| E3 | 快速连点发送；第二击应为 pending 或忽略 | ☐ | ☐ | ☐ |
| E4 | 上一条 Run 终态后立即发下一条；无 409 active-run | ☐ | ☐ | ☐ |
| E5 | 模拟 SSE 断线（飞行模式短开）；重连无 duplicate 气泡 | ☐ | ☐ | ☐ |
| E6 | 非当前 Session 后台 Run 完成；Drawer running 清除；切回可见终态 | ☐ | ☐ | ☐ |
| E8 | 弱网 / offline chrome；恢复后 Snapshot+SSE | ☐ | ☐ | ☐ |
| E9 | Run 中 cookie 失效 → 401；observer 停止 + 登录提示 | ☐ | ☐ | ☐ |
| E11 | 100+ 消息 Session →「加载更早」分页 | ☐ | ☐ | ☐ |
| E12 | API 重启后打开进行中 Run；显示 interrupted，不假续跑 | ☐ | ☐ | ☐ |
| E14 | createRun 成功后杀 SSE（后台）；前台恢复仍单 Run | ☐ | ☐ | ☐ |
| E15 | 故意触发 createRun 失败；failed assistant + user 保留 | ☐ | ☐ | ☐ |
| E22 | 删除当前 Session → landing 或相邻 Session | ☐ | ☐ | ☐ |
| E27 | Focus 指向不存在 tool → Activity 总览 + 轻提示 | ☐ | ☐ | ☐ |
| M-RUN-6 | Run 中 App 后台 → 回前台 SSE 续流 | ☐ | ☐ | ☐ |
| M-CONV-7 | 点 Process/时间线 → Workbench 打开且定位 tool | ☐ | ☐ | ☐ |
| E28 | restoreArtifact 版本冲突 → ProblemDetails，UI 不崩 | ☐ | ☐ | ☐ |

代码侧已有分支的项见 status 表「自动化/代码」列；**Gate B 签字前上表三端须全部 ☐→☑**。

## 3. Gate A 回归（完成标准 5）

```bash
pnpm validate:gate-a
pnpm gate-a:verify:harmony   # 鸿蒙十场景 fixture
cd apps/android && ./gradlew :app:verifyPaparazziPreviewDebug
# iOS: pnpm gate-a:verify:ios
```

鸿蒙 Preview：**不要**开 `useCorePort`，Dev Menu 逐一点开 `assert-preview-fixtures.mjs` 所列 JSON。

## 4. mobile-core golden（完成标准 3）

```bash
pnpm mobile-core:test
pnpm mobile-core:verify:ohos   # JVM + ohos 占位；原生 ohosArm64 需 CI 工具链
```

## 5. 结项签字

填写可复制模板：[native-mobile-phase-b-verification-record.md](./native-mobile-phase-b-verification-record.md)

- [ ] B0～B7 三端勾选表与本文主路径、§8 一致  
- [ ] 技术债与集成方式已写入 [native-mobile-phase-b-status.md](./native-mobile-phase-b-status.md)  
- [ ] iOS Release 使用与联调同版本的 `pnpm mobile-core:xcframework` 产物  
