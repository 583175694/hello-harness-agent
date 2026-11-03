# Phase B 手验记录（Gate B 签字用）

> 复制本页或新建 dated 副本填写。**未填满主路径 + §8 关键项不得标 Gate B complete。**  
> 清单细则：[native-mobile-phase-b-manual-verification.md](./native-mobile-phase-b-manual-verification.md)

## 元数据

| 字段 | 值 |
| --- | --- |
| 日期 | |
| 执行人 | |
| API Base URL | |
| API / Web 版本（commit 或 tag） | |
| Android 构建 | productionDebug / variant |
| iOS 构建 | Release + `pnpm mobile-core:xcframework`（工程：`xcodebuild` Release 模拟器 ☑ 2026-10-30） |
| 鸿蒙 | DevEco + Core 联调入口 |

## 工程自动化（本机已跑）

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `pnpm mobile-core:test` | ☐ pass | |
| `pnpm mobile-core:verify:ohos` | ☐ pass | JVM 占位；原生 ohosArm64 ☐ |
| `pnpm validate:gate-a` | ☐ pass | |
| `pnpm gate-a:verify:harmony` | ☐ pass | |
| `pnpm phase-b:smoke-api` | ☐ pass | `pnpm dev` 后 |
| `pnpm phase-b:verify:ci` | ☐ pass | 与 GitHub `native-mobile-phase-b-engine` 同 scope |
| `pnpm phase-b:verify:repo` | ☐ pass | 含 harmony + ohos JVM 占位 + smoke-api |
| `pnpm phase-b:parity <sessionId>` | ☐ | 需 `HARNESS_SESSION_COOKIE` |
| `pnpm phase-b:verify:ios-local` | ☐ pass | macOS：xcframework + Release 编译 |

> **仓库 Agent 预跑（2026-10-30）**：`mobile-core:test`、`verify:ohos`、`validate:gate-a`、`gate-a:verify:harmony`、`phase-b:verify:repo`、`phase-b:verify:ci`、Android/iOS 工程编译均已在本机通过；**不等于 Gate B 签字**。上表 ☐ 仍须执行人勾选并填日期。

## 主路径（完成标准 1）

| # | 步骤 | Android | iOS Core | 鸿蒙 Core | sessionId / runId 备注 |
| --- | --- | --- | --- | --- | --- |
| 1 | 新建会话 | ☐ | ☐ | ☐ | |
| 2 | Run + SSE | ☐ | ☐ | ☐ | |
| 3 | 取消 Run | ☐ | ☐ | ☐ | |
| 4 | Steer / pending | ☐ | ☐ | ☐ | |
| 5 | Follow-up | ☐ | ☐ | ☐ | |
| 6 | Workbench 补水 + auto-open + focus | ☐ | ☐ | ☐ | |
| 7 | Settings MCP | ☐ | ☐ | ☐ | |
| 8 | HITL | ☐ | ☐ | ☐ | |
| 9 | 版本修改 + Run | ☐ | ☐ | ☐ | |
| 10 | 版本恢复 | ☐ | ☐ | ☐ | |

## Snapshot 对拍（完成标准 2）

同一 `sessionId` / `runId`：

```bash
export HARNESS_SESSION_COOKIE='harness_session=…'
pnpm phase-b:parity <sessionId> [runId]
```

| 字段 | Web | Android | iOS | 鸿蒙 | 一致？ |
| --- | --- | --- | --- | --- | --- |
| session.title | | | | | ☐ |
| activeRun.runId / status | | | | | ☐ |
| pendingUserInputs 条数 | | | | | ☐ |
| last assistant runId + delivery | | | | | ☐ |
| run.status + messageId | | | | | ☐ |

## §8 抽样（E9 / E14 / E15 / E22 / M-RUN-6 必测）

| ID | Android | iOS | 鸿蒙 | 简述 |
| --- | --- | --- | --- | --- |
| E9 | ☐ | ☐ | ☐ | |
| E14 | ☐ | ☐ | ☐ | |
| E15 | ☐ | ☐ | ☐ | |
| E22 | ☐ | ☐ | ☐ | |
| M-RUN-6 | ☐ | ☐ | ☐ | |
| E27 | ☐ | ☐ | ☐ | |
| M-CONV-7 | ☐ | ☐ | ☐ | |
| E28 | ☐ | ☐ | ☐ | 故意 stale expectedCurrentArtifactId → 卡片提示、Workbench 不崩 |

其余 E1–E12 见 [手验清单](./native-mobile-phase-b-manual-verification.md) §2。

## 结项勾选

- [ ] B0～B7 与 [status](./native-mobile-phase-b-status.md) 一致
- [ ] 技术债已更新（iOS Keychain、ohosArm64、focusWorkbench 等）
- [ ] Preview 十场景未回归（Gate A）

**签字**：________________  **日期**：________________
