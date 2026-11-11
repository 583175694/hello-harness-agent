# HarmonyOS Gate A 十场景签字表

与 Android `GateAFullScreenSnapshotTest` / iOS `GateAFullScreenSnapshotTests` **同名 fixture**。DevEco 跑 `./scripts/sync-mobile-contract.sh` 后逐行验收并填日期。双端整屏/组件 Snapshot 可作视觉对照（**不能替代**鸿蒙 DevEco 签字）。

| Fixture | 双端 Snapshot 参考 | Chat 壳 | Drawer | Workbench | Composer/HITL | Reader | 签字日期 |
| --- | --- | --- | --- | --- | --- | --- |
| `empty-landing.json` | FullScreen + Theme dark | ☐ | ☐ | — | ☐ | — | |
| `streaming-assistant-tail.json` | FullScreen + Fixture composer | ☐ | ☐ | ☐ | Follow-up/Replay | — | |
| `long-thread-scroll.json` | FullScreen | ☐ | ☐ | ☐ | ☐ | — | |
| `process-timeline-tools.json` | FullScreen + Peek/Composer | ☐ | ☐ | ☐ | Plan/Peek | — | |
| `hitl-clarification.json` | FullScreen + Fixture composer | ☐ | ☐ | ☐ | 澄清 | — | |
| `hitl-tool-approval.json` | FullScreen + Fixture composer | ☐ | ☐ | ☐ | 审批 | — | |
| `workbench-activity-bash.json` | FullScreen + Fixture sheet | ☐ | ☐ | Activity/Bash | ☐ | — | |
| `workbench-report-markdown.json` | FullScreen + Report/Artifact sheet | ☐ | ☐ | Report | ☐ | Report | |
| `workbench-sources.json` | FullScreen + Fixture sheet + detent 44% | ☐ | ☐ | Sources | ☐ | — | |
| `connection-offline-error.json` | FullScreen + Chrome | ☐ | ☐ | — | Banner/Problem | — | |
| `workbench-sources-retrieval-only.json` | FullScreen + retrieval sheet | ☐ | ☐ | 仅检索 | — | — | |

**演示（非十场景签字行）**：`rich-session-showcase.json` — 空态 **「加载演示 Mock」** 或 Dev Menu 置顶；用于 Chat + Workbench 四 Tab 综合 Mock，签字表仍以 §8.1 上表 11 行为准。

**通过**：十行 Chat 壳无读文件错误；与 [`gate-a-manual-checklist.md`](./gate-a-manual-checklist.md) 检查项一致。
