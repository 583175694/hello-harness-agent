# Native Mobile Gate A — UI 回归签字（19 条）

用例定义：[native-mobile-gate-a-ui-regression.md](./native-mobile-gate-a-ui-regression.md)。**自动化**指 Paparazzi / iOS Snapshot / `pnpm validate:gate-a` 已覆盖视觉或不变量；**手工**仍需 Preview 内点按验收。

**手验入口（三端）**：[Android](../apps/android/docs/gate-a-quick-smoke.md) · [iOS](../apps/ios/docs/gate-a-quick-smoke.md) · [鸿蒙](../apps/harmony/docs/gate-a-quick-smoke.md)。最近全量自动化绿：`pnpm gate-a:verify:all`（见 [evidence](./native-mobile-gate-a-evidence.md)）。

| # | 自动化（Android / iOS / 鸿蒙） | Android ☐ | iOS ☐ | 鸿蒙 ☐ | 签字日期 |
| --- | --- | --- | --- | --- | --- |
| 1 | process+WB Snapshot；**Plan lockCollapsed 静态** / 同 / 手验重叠 | | | | |
| 2 | **44% detent Snapshot** / 同 / 手工（键盘+44%） | | | | |
| 3 | **Drawer Snapshot**（GateAChrome） / 同 / 手验（搜索·清空·菜单·点选；静态见 validate #3） | | | | |
| 4 | **WB sheet 多 Tab Snapshot** / 同 / 手验 detent 切换 | | | | |
| 5 | **整屏 Snapshot** + scrim 静态 / 同 / 手验顶栏 | | | | |
| 6 | **Composer overlay Snapshot** / 同 / 手验与 WB 独立 | | | | |
| 7 | **Composer overlay Snapshot** / 同 / 手验开闭 | | | | |
| 8 | Reduce Motion 不变量 + Settings / 同 / 同 | | | | |
| 9 | 整屏 + sheet Snapshot / 整屏 + sheet / 手工 | | | | |
| 10 | hitl-clarification **Composer Snapshot** / 同 / 手工 | | | | |
| 11 | hitl-tool-approval **Composer Snapshot** / 同 / 手工 | | | | |
| 12 | streaming + Replay / Replay / Replay | | | | |
| 13 | **Peek Snapshot**（GateAChrome） / 同 / 手验点开 WB | | | | |
| 14 | **Passage half-sheet Snapshot** / 同 / 手工（Passage 半屏） | | | | |
| 15 | **Report+Artifact Reader Snapshot** / 同 / 手工（Reader 导航） | | | | |
| 16 | **Settings 根 Snapshot** / 同 / 同（API URL 手验） | | | | |
| 17 | **MCP + Memory Snapshot** + 路由不变量 / 同 / 同 | | | | |
| 18 | **long-thread 整屏 Snapshot** + ≥40 fixture / 同 / 手验滚动 | | | | |
| 19 | connection-offline **整屏+Chrome Snapshot** / 同 / 手工 | | | | |

**通过**：三端对应列全部 ☑ + 日期；§8.2 见 Android/iOS runbook（2026-10-28 已填模拟器数据，真机可选复测）。关 Goal 步骤：[signoff-checklist](./native-mobile-gate-a-signoff-checklist.md)。
