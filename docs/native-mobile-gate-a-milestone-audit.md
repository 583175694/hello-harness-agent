# Native Mobile Gate A — 里程碑审计（A0～A9）

权威：[44-native-mobile-phase-a-static-ui.md](./44-native-mobile-phase-a-static-ui.md) §6；证据索引：[native-mobile-gate-a-evidence.md](./native-mobile-gate-a-evidence.md)。

| 里程碑 | 交付 | Android+iOS | Harmony | 证据 |
| --- | --- | --- | --- | --- |
| **A0** | contract + tokens + Dev Menu + primitive | ✅ CI | ✅ 文件 + sync CI | `pnpm validate:gate-a` |
| **A1** | Drawer + Landing | ✅ Snapshot | ✅ 搜索/菜单/running/点选 + 手验待签 | Paparazzi / 整屏 + validate #3 |
| **A2** | 对话 + Replay + 长列表 | ✅ 48 turns 校验 | ✅ ReplayController | fixture 校验 + 条数头 |
| **A3** | Markdown 完成态 | ✅ MarkdownBody | ✅ PreviewMarkdownText | fixture snapshots |
| **A4** | Process / timeline | ✅ | ✅ ConversationPatterns | process-timeline fixture |
| **A5** | Composer + HITL | ✅ | ✅ ComposerStack + TextArea | fixture snapshots |
| **A6** | Workbench 全 Tab | ✅ | ✅ detent + 中文 Tab | workbench-* fixtures |
| **A7** | Settings / MCP / Memory / Reader | ✅ | ✅ 子页 + 深色 token | Settings 路由 + `main_pages.json` |
| **A8** | 动效 / Reduce Motion / 错误态 | ✅ Settings 开关 | ✅ Settings + Drawer/Workbench 深色 token 对齐 contract | §4.3 部分 |
| **A9** | Gate A 门禁 | ✅ Paparazzi + Snapshot | ⚠️ 无 Snapshot CI；rawfile + 不变量 + 手工清单 | `gate-a:verify:*` |

**自动化（2026-10-28 13:19）**：`pnpm gate-a:verify:all` 绿；鸿蒙 UI 对齐（Composer/Sheet/Drawer/Workbench）；`validate:gate-a` 含 §4.1 + UI 回归静态 **#1–#19**。未证毕见 [open-items](./native-mobile-gate-a-open-items.md)。

**此前（2026-10-27 23:42）**：`pnpm gate-a:verify:all` 绿；`pnpm-lock.yaml` 含 mobile-contract。

**未证毕（Goal 仍进行中）**：§8.2 真机 **Macrobenchmark/Instruments** 填表；鸿蒙 [十场景 DevEco signoff](../apps/harmony/docs/gate-a-scenario-signoff.md)；[UI 回归签字表](./native-mobile-gate-a-ui-regression-signoff.md) 三端 ☑ 未填（不等同于静态脚本通过）。
