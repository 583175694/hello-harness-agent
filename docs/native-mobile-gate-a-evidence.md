# Native Mobile Gate A — 证据索引（2026-10-27）

权威任务书：[44-native-mobile-phase-a-static-ui.md](./44-native-mobile-phase-a-static-ui.md)

**最近全绿（本地）**：2026-10-28 15:53 — `pnpm gate-a:verify:all` 绿（validate + Paparazzi + 鸿蒙 assert + iOS TEST SUCCEEDED）。

**此前**：2026-10-28 15:49 — 空态 **「加载演示 Mock」** → `rich-session-showcase.json`；演示场景置顶；Workbench 四 Tab。

**此前**：2026-10-28 15:34 — `rich-session-showcase.json` 综合 mock；Workbench 四 Tab + 内容区滚动；Context Tab 已移除。

**此前**：2026-10-28 14:47 — 三端 Sheet 280ms、全屏蒙层、鸿蒙 `safeAreaPadding`。

**此前**：2026-10-28 14:44 — Workbench/Drawer 全屏蒙层 + 盖住 Composer；Android Workbench `Dialog`；鸿蒙 `AppSheet` 上滑。

**此前**：2026-10-28 13:39 — `pnpm gate-a:verify:all` 绿（皮皮虾 BrandIcon、Workbench 空态/Bash、Paparazzi + iOS Snapshot 已对齐重录）。

**此前**：2026-10-28 13:22 — `pnpm gate-a:verify:all` 绿（Paparazzi BUILD SUCCESSFUL + iOS TEST SUCCEEDED + 鸿蒙 assert）。

**此前**：2026-10-28 13:18 — `pnpm gate-a:verify:all` 绿；鸿蒙 Chat：Composer 22dp + 底栏 +/模型/发送、Sheet「添加/模型/Skill」对齐 Android、Drawer/AppSheet 完成按钮、安全区 `expandSafeArea`、去 fixture 脚注。

**此前**：2026-10-28 13:16 — Android edge-to-edge + Composer `Dialog` Sheet；iOS 顶栏/Composer 对齐 RN；Paparazzi + iOS Snapshot 重录；`SnapshotTestConfig` 支持 `TEST_RUNNER_SNAPSHOT_RECORD`

**此前**：2026-10-28 11:53 — `pnpm gate-a:verify:all` 绿（RN VIA：Workbench Tab、顶栏/Composer/用户气泡）

**此前**：2026-10-28 11:14 — `pnpm gate-a:verify:all` 绿（validate + Paparazzi + 鸿蒙 assert + iOS **33** TEST SUCCEEDED；§8.2 benchmark 脚本已接不变量）。§8.2 runbook 同日已填。合并前：`pnpm gate-a:prep-commit`。

## 自动化（CI / 本地）

| 检查 | 命令 | 状态 |
| --- | --- | --- |
| Contract + 不变量 | `pnpm validate:gate-a`（§4.1 + §4.3 含 Settings 主题/字号 + UI 回归 **#1–#19**；**#2** 双端 44% 快照 + 键盘/鸿蒙手验） | CI **Android + iOS + Harmony** Gate A jobs |
| Android 一键 | `pnpm gate-a:verify:android` | 不变量 + sync + Paparazzi |
| 三端一键（macOS） | `pnpm gate-a:verify:all` | 单次 validate + Paparazzi + 鸿蒙 assert + iOS Snapshot（勿在子目录下重复 cd） |
| 关键 Snapshot PNG | `pnpm gate-a:list-snapshot-baselines` | CI Android/iOS Gate A job 同步检查 |
| 合并前自检 | `pnpm gate-a:prep-commit` | validate + 20/20 PNG + git 范围提示（不 commit） |
| Android §8.2 Macrobenchmark | `pnpm gate-a:benchmark:android` | 无 adb 时自启 AVD；`core-ui` 已含 `benchmark` buildType |
| iOS §8.2 长列表滚动 | `pnpm gate-a:benchmark:ios` | `-GateAScrollPerf` + CADisplayLink → `gate-a-scroll-perf.json` |
| iOS 一键 | `pnpm gate-a:verify:ios` | 不变量 + HarnessTests（macOS + **iPhone 17** Simulator） |
| 鸿蒙 一键 | `pnpm gate-a:verify:harmony` | 不变量 + sync + ≥11 preview JSON |
| 交互回归清单 | [native-mobile-gate-a-ui-regression.md](./native-mobile-gate-a-ui-regression.md) | **手工**（三端 Preview） |
| 交互回归签字 | [native-mobile-gate-a-ui-regression-signoff.md](./native-mobile-gate-a-ui-regression-signoff.md) | **待填** |
| Android Paparazzi | `cd apps/android && ./gradlew :app:verifyPaparazziPreviewDebug` | CI 同上（**20** tests：整屏十场景 + Workbench/Reader/Passage/detent 等） |
| iOS Snapshot | `cd apps/ios && xcodegen generate && xcodebuild test -scheme Harness -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:HarnessTests` | CI `native-mobile-gate-a-ios` |
| iOS 快照重录 | `TEST_RUNNER_SNAPSHOT_RECORD=1 xcodebuild test …`（见 `apps/ios/docs/gate-a-runbook.md`） | 本地 / 模拟器升级后 |
| 鸿蒙 contract 同步 | `bash apps/harmony/scripts/sync-mobile-contract.sh`（DevEco 前必跑） | CI `native-mobile-gate-a-harmony`（11 JSON + **字段校验** 与 contract 同规则） |
| 鸿蒙 DevEco 手验 | [apps/harmony/docs/gate-a-runbook.md](../apps/harmony/docs/gate-a-runbook.md) | **待签字**（十场景 + UI 回归 19 条） |
| 三端 Preview 快速手验 | [Android](../apps/android/docs/gate-a-quick-smoke.md) / [iOS](../apps/ios/docs/gate-a-quick-smoke.md) / [鸿蒙](../apps/harmony/docs/gate-a-quick-smoke.md) | 填 [UI 回归签字](./native-mobile-gate-a-ui-regression-signoff.md) + 帧率表 |

## 手工 / 待填

| 检查 | 证据位置 | 状态 |
| --- | --- | --- |
| Macrobenchmark ≥55fps | [apps/android/docs/gate-a-runbook.md](../apps/android/docs/gate-a-runbook.md) 表格 | **待真机** |
| Instruments 长列表 | [apps/ios/docs/gate-a-runbook.md](../apps/ios/docs/gate-a-runbook.md) | **待真机** |
| 鸿蒙十场景 | [apps/harmony/docs/gate-a-scenario-signoff.md](../apps/harmony/docs/gate-a-scenario-signoff.md) | **待 DevEco 签字** |
| RN 对照交互规格 | [apps/mobile/docs/ui-regression-checklist.md](../apps/mobile/docs/ui-regression-checklist.md) 改编 | **未系统跑完** |

## 场景矩阵

见 [native-mobile-gate-a-scenario-matrix.md](./native-mobile-gate-a-scenario-matrix.md)。

## 里程碑审计（A0～A9）

见 [native-mobile-gate-a-milestone-audit.md](./native-mobile-gate-a-milestone-audit.md)。

## 未证毕索引

见 [native-mobile-gate-a-open-items.md](./native-mobile-gate-a-open-items.md)（真机帧率、三端手验签字、#2 detent）。

## 完成度审计（§44 逐条）

见 [native-mobile-gate-a-completion-audit.md](./native-mobile-gate-a-completion-audit.md)。

**本地一键（2026-10-27 晚）**：`gate-a:verify:android` / `gate-a:verify:ios` / `gate-a:verify:harmony` 均可绿；整屏 Snapshot 已含 **`workbench-sources-retrieval-only.json`**（Android Paparazzi + iOS PNG 基线需随 PR 提交）。

**结论**：v1 **Android + iOS** 快照与不变量门禁可合并；**三端静态全量**与性能 Runbook 尚未证毕，Goal 仍进行中。
