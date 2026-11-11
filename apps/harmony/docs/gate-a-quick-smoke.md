# HarmonyOS Gate A — 10 分钟快速手验（签字前）

前置：`pnpm gate-a:verify:harmony` 绿 → DevEco Run `entry` → `./scripts/sync-mobile-contract.sh` 已跑。

| 顺序 | Fixture | 30 秒内看什么 | 对应 signoff 列 |
| --- | --- | --- | --- |
| 1 | `empty-landing.json` | ≡ Drawer：搜索、绿点 running、点选关 Drawer、长按菜单 Sheet；可选 **「加载演示 Mock」** → `rich-session-showcase.json` | Chat / Drawer |
| 2 | `streaming-assistant-tail.json` | Replay tail、Follow-up 队列 | Composer |
| 3 | `long-thread-scroll.json` | 条数头、列表滚动 | Chat |
| 4 | `process-timeline-tools.json` | Process 行、Peek → WB、Plan 浮卡 | Composer / Peek |
| 5 | `hitl-clarification.json` | 澄清选项 + 输入行 | Composer/HITL |
| 6 | `hitl-tool-approval.json` | 审批条 + 批准/拒绝 | Composer/HITL |
| 7 | `workbench-activity-bash.json` | Activity + bash 只读 | Workbench |
| 8 | `workbench-report-markdown.json` | Report Tab → 全屏 Reader | Workbench / Reader |
| 9 | `workbench-sources.json` | Sources、Passage 半屏、detent 三档（44% 看 Composer） | Workbench |
| 10 | `connection-offline-error.json` | Pill + Banner + ProblemDetails | Chat 连接态 |
| 11 | `workbench-sources-retrieval-only.json` | 「仅检索 · 无文件」 | Workbench |
| 12 | `rich-session-showcase.json` | 多轮对话 + WB 四 Tab 长列表滚动 | 演示 / 评审用 |

通过后：填 [gate-a-scenario-signoff.md](./gate-a-scenario-signoff.md) 与 [UI 回归签字表](../../../docs/native-mobile-gate-a-ui-regression-signoff.md) **鸿蒙列**。总览：[signoff-checklist](../../../docs/native-mobile-gate-a-signoff-checklist.md)。
