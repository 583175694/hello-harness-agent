# Native Mobile Gate A — 十场景验收矩阵

权威 fixture 名见 [43 §16.3](./43-native-mobile-clients-architecture.md)；出口标准见 [44 §8](./44-native-mobile-phase-a-static-ui.md)。

| Fixture | Android Paparazzi | iOS Snapshot | Harmony 手工 |
| --- | --- | --- | --- |
| `empty-landing.json` | `emptyLanding` | `testEmptyLanding` | Dev Menu + Landing |
| `streaming-assistant-tail.json` | `streamingAssistantTail_*` | composer + turn | Replay + Follow-up |
| `long-thread-scroll.json` | `longThreadScroll_sampleTurns` | `testLongThreadSampleTurns` | 列表滚动 |
| `process-timeline-tools.json` | composer + **assistant turn** | composer + **assistant turn** | Process + Plan + Peek |
| `hitl-clarification.json` | composer | composer | Composer 澄清 |
| `hitl-tool-approval.json` | composer | composer | 工具审批 |
| `workbench-activity-bash.json` | sheet | sheet | Activity + bash |
| `workbench-report-markdown.json` | sheet | sheet | Report + Reader |
| `workbench-sources.json` | sheet | sheet | Sources 卡片 |
| `connection-offline-error.json` | chrome stack | chrome stack | Banner + Problem |
| `workbench-sources-retrieval-only.json`（可选） | sheet | sheet | 仅检索空态 |
| `rich-session-showcase.json`（**演示**，非 §8.1 十场景） | `richSessionShowcase_*` + 整屏 | 整屏 + WB Artifact | 空态 **「加载演示 Mock」** 或 Dev Menu 置顶 |

**Composer Overlay（打开态）**：Android `GateAChromeSnapshotTest.composerOverlay_*`；iOS `GateASnapshotTests.testComposer*SheetOpen`；鸿蒙 `AppSheet`（模型/附件/Skill，见 `PreviewChatPage`）。

**整屏 Chat 壳（十场景 + retrieval-only + 演示）**：Android `GateAFullScreenSnapshotTest`（12 fixtures，含 `rich-session-showcase`）；iOS `GateAFullScreenSnapshotTests.testFullShellFixtures`（390×844，`suppressAutoWorkbench`）。

**主题 / 字号（§4.3）**：Android `GateAThemeSnapshotTest.darkTheme_emptyLanding_fullShell`；iOS `GateAThemeSnapshotTests.testDarkThemeEmptyLandingFullShell`。

**未覆盖（Phase A 仍待补）**：Macrobenchmark 真机数值、鸿蒙自动化 Snapshot；键盘–Composer 已接 Android `imePadding`、iOS `safeAreaInset`（需真机手验）。
