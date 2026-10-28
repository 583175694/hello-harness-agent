# Native Mobile Gate A — 完成度审计（§44 / Objective）

> **最后自动化验证（2026-10-28 15:49）**：`pnpm gate-a:verify:all` 绿（validate + Paparazzi + 鸿蒙 assert + iOS HarnessTests）。空态 **「加载演示 Mock」** → `rich-session-showcase.json`；Workbench **四 Tab**（无 Context）；Context 快照改为 rich showcase。
> **此前（2026-10-28 13:19）**：鸿蒙 Chat/Composer/Sheet/Workbench 与 Android RN 对齐；演示场景页顶栏返回。
> **此前（2026-10-28 11:14）**：`pnpm gate-a:verify:all` 绿。  
> **此前（2026-10-27 23:42）**：`pnpm gate-a:verify:all` 绿（Drawer 三端搜索 + 关闭清空后复验）。
> **此前（2026-10-27 23:23）**：`pnpm gate-a:verify:all` 绿（validate + Android Paparazzi + 鸿蒙 assert + iOS HarnessTests **TEST SUCCEEDED**）。`pnpm-lock.yaml` 含 `mobile-contract` workspace。
> **此前（2026-10-27 23:16）**：`pnpm gate-a:prep-commit` 绿；三端 Drawer 搜索 UI 静态门禁 #3。
> **此前（2026-10-27 23:00）**：`pnpm gate-a:verify:all` 绿（validate + Android Paparazzi **20+10** + 鸿蒙 rawfile 字段校验 + iOS HarnessTests **33** TEST SUCCEEDED）。CI Android/iOS Gate A job 含 `gate-a:list-snapshot-baselines`。  
> 本表区分 **已证毕（自动化/代码）** 与 **未证毕（需人工）**；Goal 仅在「未证毕」栏全部消除且三端静态全量手验完成后方可关闭。

| 要求（§44 / Objective） | 证据 | 状态 |
| --- | --- | --- |
| A0 `mobile-contract` + tokens + Dev Menu | `packages/mobile-contract/`、`pnpm validate:gate-a` | ✅ 自动化 |
| A0 Android/iOS Preview 壳 + Dev Menu | `apps/android`、`apps/ios`、不变量 | ✅ 自动化 |
| 无 `mobile-core` / 无 Harness SSE | `verify-gate-a-invariants.mjs` | ✅ 自动化 |
| §4.1 屏幕 / 路由三端 | `verify-gate-a-screens.mjs` | ✅ 静态接线 |
| §4.3 UI 状态 fixture 矩阵 | `verify-gate-a-ui-states.mjs` | ✅ fixture 覆盖 |
| §8.1 十场景 + retrieval-only Dev Menu | 11 JSON + 三端列表 + 鸿蒙 assert | ✅ |
| §8.2 Paparazzi / iOS Snapshot | `gate-a:verify:android` / `:ios` | ✅ 本地可绿 |
| §8.2 十场景视觉完整 | Snapshot + 手验 | ⚠️ 双端快照有；**全交互手验未签字** |
| §8.2 长列表 ≥55fps | Android/iOS runbook + benchmark 脚本 | ✅ **2026-10-28 模拟器**（Android 59.4 FPS / iOS 60.0 FPS；真机复测可选） |
| §8.3 鸿蒙十场景可演示 | DevEco + [scenario signoff](../apps/harmony/docs/gate-a-scenario-signoff.md) | ❌ **待签字** |
| §8.3 鸿蒙 tokens 一致 | HarnessColors + 不变量 dark/light | ✅ 静态 |
| §8.4 UI 回归 19 条 × 三端 | [signoff](./native-mobile-gate-a-ui-regression-signoff.md) | ❌ **待签字** |
| 三端 Settings / MCP / Memory / Reader | §4.1 + 实现 | ✅ 代码 + 静态 |
| 三端 Workbench 四 Tab + detent | activity/sources/report/artifact；双端 Snapshot + `GateAWorkbenchDetentSnapshot*`；`verify-gate-a-invariants` 禁 Context Tab | ⚠️ #2 双端 44% 快照；键盘/鸿蒙 **手验** |
| Phase A 静态 UI「全量」证毕 | 上表全部 ✅ + 手验 | ❌ **Goal 进行中** |

**下一步（人工）**：见 [blockers](./native-mobile-gate-a-blockers.md)（**#1 入库** → 三端 [quick-smoke](../apps/android/docs/gate-a-quick-smoke.md) → **57+32 签字**）。
