# Native Mobile Gate A — 未证毕项（Goal 进行中）

权威出口：[44 §8](./44-native-mobile-phase-a-static-ui.md)。**自动化绿 ≠ Phase A 全量证毕**。阻塞一览：[native-mobile-gate-a-blockers.md](./native-mobile-gate-a-blockers.md)。关 Goal 签字：[signoff-checklist](./native-mobile-gate-a-signoff-checklist.md)。

## 已具备证据（可本地/CI 复现）

| 项 | 命令 / 产物 |
| --- | --- |
| Contract + 不变量 + §4.1 屏幕 + §4.3 fixture 态矩阵 + UI 回归 #1–#19 | `pnpm validate:gate-a` |
| Android Paparazzi（含 11 整屏 + 组件） | `pnpm gate-a:verify:android` |
| iOS Snapshot（iPhone 17） | `pnpm gate-a:verify:ios` |
| 鸿蒙 rawfile + fixture 字段 | `pnpm gate-a:verify:harmony` |
| 三端 Dev Menu → Settings | `verify-gate-a-invariants.mjs` |
| 无 mobile-core / 无 Harness SSE | 同上不变量 |

## 必须人工完成（无法由 Agent 代签）

| 项 | 文档 | 完成标准 |
| --- | --- | --- |
| §8.2 Android 长列表帧率 | [apps/android/docs/gate-a-runbook.md](../apps/android/docs/gate-a-runbook.md) | **2026-10-28 已填**（`pnpm gate-a:benchmark:android`） |
| §8.2 iOS 长列表帧率 | [apps/ios/docs/gate-a-runbook.md](../apps/ios/docs/gate-a-runbook.md) | **2026-10-28 已填**（`pnpm gate-a:benchmark:ios`） |
| 鸿蒙十场景 | [apps/harmony/docs/gate-a-scenario-signoff.md](../apps/harmony/docs/gate-a-scenario-signoff.md) | 11 行 ☑ + 日期 |
| UI 交互回归 19 条 × 三端 | [native-mobile-gate-a-ui-regression-signoff.md](./native-mobile-gate-a-ui-regression-signoff.md) | 57 格 ☑ + 日期 |
| #2 Workbench 44% detent 露出 Composer | [native-mobile-gate-a-ui-regression.md](./native-mobile-gate-a-ui-regression.md) #2 | Android/iOS **Paparazzi/Snapshot 已覆盖**；键盘联动 + **鸿蒙**仍须 Preview 手验 |

## 本地一键（macOS，validate 只跑 1 次）

```bash
pnpm gate-a:verify:all
pnpm gate-a:prep-commit   # validate + 快照清单 + git status 提示（不 commit）
pnpm gate-a:human-evidence # 57+32 签字格、§8.2 runbook、git/adb 进度（不阻塞 CI）
pnpm gate-a:audit          # validate + 快照 + 上项 + blockers 摘要
```

单端：`pnpm gate-a:verify:android` | `:ios` | `:harmony`（各含 `validate:gate-a`）。

## 建议手验顺序

| 端 | 自动化 | 快速手验 | 签字 |
| --- | --- | --- | --- |
| Android | `pnpm gate-a:verify:android` | [gate-a-quick-smoke.md](../apps/android/docs/gate-a-quick-smoke.md) | UI 回归 Android 列 + [runbook 帧率](../apps/android/docs/gate-a-runbook.md) |
| iOS | `pnpm gate-a:verify:ios` | [gate-a-quick-smoke.md](../apps/ios/docs/gate-a-quick-smoke.md) | UI 回归 iOS 列 + [runbook 帧率](../apps/ios/docs/gate-a-runbook.md) |
| 鸿蒙 | `pnpm gate-a:verify:harmony` | [gate-a-quick-smoke.md](../apps/harmony/docs/gate-a-quick-smoke.md)（11×30s） | [scenario signoff](../apps/harmony/docs/gate-a-scenario-signoff.md) + UI 回归鸿蒙列 |

## 仓库提交提醒

当前工作树中 `apps/android`、`apps/ios`、`apps/harmony`、`packages/mobile-contract` 与 Gate A 文档多为 **未跟踪（`??`）**；合并前请 `git add` 并提交 **全部 Snapshot PNG** 与源码，否则 CI/他人无法复现 Paparazzi/Snapshot 基线。须同时提交 **`pnpm-lock.yaml`**（含 `packages/mobile-contract` workspace，CI `--frozen-lockfile`）。

**不要**指望提交 Android `assets/mobile-contract` 或鸿蒙 `rawfile/mobile-contract`（目录被 gitignore）；权威 fixture 在 `packages/mobile-contract/fixtures/preview/`，CI 跑 sync 脚本。

```bash
pnpm gate-a:list-snapshot-baselines   # 20/20 关键 PNG + 磁盘上 Android/iOS 全量 PNG 计数
# 当前本地基线规模示例：Android ~42、iOS ~43（含整屏十场景与组件快照）
```


整屏 Snapshot 新增 **`workbench-sources-retrieval-only`** 时，需提交 Android Paparazzi PNG 与 iOS `HarnessTests/__Snapshots__/GateAFullScreenSnapshotTests/` 下对应文件。

**Workbench / Reader 快照**（Artifact Tab、`rich-session-showcase` 综合演示、恢复确认、Passage 半屏、44% detent、**Report/Artifact Reader**；Gate A Preview **无 Context Tab**）基线 PNG 须入库；`pnpm validate:gate-a` 会检查关键路径是否存在（见 `verify-gate-a-ui-regression-static.mjs`）。
