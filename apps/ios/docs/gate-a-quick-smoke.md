# iOS Gate A — 10 分钟快速手验（签字前）

前置：`pnpm gate-a:verify:ios` 绿 → Xcode Run **Harness**（Simulator **iPhone 17**）。Snapshot 已覆盖整屏/组件基线；下表补 **Snapshot 外的点按交互**。

| 顺序 | Fixture | 30 秒内看什么 | UI 回归 / 备注 |
| --- | --- | --- | --- |
| 1 | `empty-landing.json` | ☰ Drawer：搜索、关闭清空、长按菜单；可选点 **「加载演示 Mock」** 跳到 #12 | #3 |
| 2 | `streaming-assistant-tail.json` | Replay tail、Follow-up | #12 |
| 3 | `long-thread-scroll.json` | 条数头、滚动（§8.2 Instruments 另填 runbook） | #18 |
| 4 | `process-timeline-tools.json` | Process、Peek→WB、Plan、overlays 与 WB 独立 | #1/#6/#7/#13 |
| 5 | `hitl-clarification.json` | 澄清 + 输入 | #10 |
| 6 | `hitl-tool-approval.json` | 审批 + 批准/拒绝 | #11 |
| 7 | `workbench-activity-bash.json` | Activity + bash 只读 | WB Tab |
| 8 | `workbench-report-markdown.json` | Report → Reader | #15 |
| 9 | `workbench-sources.json` | Tab 不切 detent；44% Composer（#2 键盘手验） | #2/#4/#14 |
| 10 | `connection-offline-error.json` | Pill、Banner、ProblemDetails | #19 |
| 11 | `workbench-sources-retrieval-only.json` | 仅检索无文件 | #9 |
| 12 | `rich-session-showcase.json` | 多轮 Chat + WB 四 Tab；内容区上下滑；detent 三档 | 演示 / 评审用 |

通过后：填 [UI 回归签字表](../../../docs/native-mobile-gate-a-ui-regression-signoff.md) **iOS 列**（§8.2 runbook 已填 2026-10-28）。总览：[signoff-checklist](../../../docs/native-mobile-gate-a-signoff-checklist.md)。
