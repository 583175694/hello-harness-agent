# Native Mobile Gate A — 当前阻塞项（Goal 未关）

**自动化（2026-10-28 15:53）**：`pnpm gate-a:verify:all` 绿。Preview 弹层（Workbench / AppSheet / Drawer）全屏蒙层、盖住 Composer、280ms 动效；鸿蒙 `safeAreaPadding` 顶栏/侧栏。详见 [evidence](./native-mobile-gate-a-evidence.md)。**静态实现与门禁已无代码待办**；Goal 仅阻塞 **#1–#3 人工项**。

> **2026-10-28**：用户选择 **暂停 Goal**，自行手验签字；恢复时在对话中说 **「继续 Goal」**（并更新签字表或请求 prep-commit）。  
> **Agent**：在用户恢复前不重复跑 `verify:all` / 不代填签字；仅在你发消息或贴 `gate-a:completion` 输出时续作。

| # | 阻塞 | 负责人 | 完成标准 | 入口 |
| --- | --- | --- | --- | --- |
| 1 | **仓库未入库** | 工程 | `apps/*`、`packages/mobile-contract`、Snapshot PNG、Gate A 文档已 commit；CI 可跑 Gate A jobs | `pnpm gate-a:prep-commit` · 进度 `pnpm gate-a:human-evidence` |
| 2 | **UI 回归签字** | 三端 Preview 手验 | [signoff](./native-mobile-gate-a-ui-regression-signoff.md) 57 格 ☑ + 日期 | [signoff-checklist](./native-mobile-gate-a-signoff-checklist.md) |
| 3 | **鸿蒙十场景签字** | DevEco | [scenario signoff](../apps/harmony/docs/gate-a-scenario-signoff.md) 11 行 ☑ | 同上 checklist §1 |

**§8.2 长列表帧率（2026-10-28 已证）**：Android `pnpm gate-a:benchmark:android`（59.4 FPS / 4.9%）· iOS `pnpm gate-a:benchmark:ios`（60.0 FPS / 0.1%）→ 双端 runbook dated 行。真机复测可选。

**非阻塞 v1 双端 Gate A 合并**：鸿蒙 #3 与 43 文档一致，可并行但不挡 Android/iOS CI 绿。

**Goal 关闭条件**：上表 **#1–#3** 完成 + §8.2 已满足 + [completion-audit](./native-mobile-gate-a-completion-audit.md) 无 ❌。
