# Native Mobile Gate A — UI 交互回归（改编）

源自 [apps/mobile/docs/ui-regression-checklist.md](../apps/mobile/docs/ui-regression-checklist.md)；路由改为各端 **Preview Dev Menu** + 上表 fixture 名。§8.4 人工参考。

## 准备

- Android/iOS：Run Preview flavor / Harness Debug scheme → Dev Menu  
- 鸿蒙：`bash apps/harmony/scripts/sync-mobile-contract.sh` → DevEco Run `entry`

## 用例（fixture 驱动）

| # | Fixture / 操作 | 验收 |
| --- | --- | --- |
| 1 | `process-timeline-tools.json` → 开 Workbench 中档 detent → Artifact Tab | Plan 浮卡不与 diff 重叠 |
| 2 | 同上 | 底部 Composer / 安全区不被 Sheet 永久遮挡 |
| 3 | 任意 → ☰ Drawer（`empty-landing.json` 可测搜索） | 打开/关闭 Drawer；**搜索过滤**；关闭后搜索清空；**点选会话**关闭 Drawer；关闭后会话可滚动 |
| 4 | `workbench-sources.json` | 五 Tab 切换 **detent 高度不变** |
| 5 | Workbench 最高档 | Sheet 顶在顶栏下，scrim 变暗 |
| 6 | 附件/Skill Sheet 与 Workbench **互不** 强制互关（浮层独立） |
| 7 | `process-timeline-tools.json` | 模型/附件/Skill Sheet 可开闭 |
| 8 | Drawer + Settings **Reduce Motion** 开 | Drawer/Workbench 少滑或无滑 |
| 9 | `workbench-sources-retrieval-only.json` | Sources「仅检索 · 无文件」 |
| 10 | `hitl-clarification.json` | 澄清选项 + Composer 输入行 |
| 11 | `hitl-tool-approval.json` | 审批展开命令 + 批准/拒绝静态钮 |
| 12 | `streaming-assistant-tail.json` | Replay tail 增长 + Follow-up 队列 |
| 13 | `process-timeline-tools.json` | **Peek 条** 点开 Workbench |
| 14 | `workbench-sources.json` | Passage 半屏 |
| 15 | `workbench-report-markdown.json` | Report Tab → 全屏 Reader |
| 16 | Settings | 主题/字号/Reduce Motion/API URL 假保存 |
| 17 | Settings → MCP / Memory | CRUD + Test/开关 |
| 18 | `long-thread-scroll.json` | 条数头 + 列表滚动 |
| 19 | `connection-offline-error.json` | Pill + Banner + ProblemDetails |

**自动化已覆盖**：十场景整屏 Paparazzi / iOS Snapshot；**#2 44% detent** 另见 `GateAWorkbenchDetentSnapshotTest` / `GateAWorkbenchDetentSnapshotTests`（`workbench-sources.json` + `initialSheetIndex=0`）；不变量 `pnpm validate:gate-a`（含 **静态 UI 回归子集** `#1–#19`）。**#2 键盘联动**与**鸿蒙 44% 手验**仍建议 Preview 实机点按。

**仍待真机**：§8.2 长列表帧率（见各端 `gate-a-runbook.md`）。

**三端签字表**：[native-mobile-gate-a-ui-regression-signoff.md](./native-mobile-gate-a-ui-regression-signoff.md)（19 条 × Android / iOS / 鸿蒙）。
