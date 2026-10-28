# HarmonyOS Gate A 手工回归清单

与 [44-native-mobile-phase-a-static-ui.md](../../../docs/44-native-mobile-phase-a-static-ui.md) §8.3 对齐；**不阻塞 v1 双端 Gate A**，但与 Android/iOS **同 fixture 名**。交互 19 条见 [native-mobile-gate-a-ui-regression.md](../../../docs/native-mobile-gate-a-ui-regression.md)（路由改为本 Dev Menu）。

## 准备

1. `cd apps/harmony && ./scripts/sync-mobile-contract.sh`
2. DevEco Run `entry` → Preview Menu（顶栏 **设置** 可进 Settings，不必先进 Chat Drawer）

## 十场景 + 可选

| Fixture | 检查项 |
| --- | --- |
| `empty-landing.json` | Landing 文案 |
| `streaming-assistant-tail.json` | 有会话摘要 |
| `long-thread-scroll.json` | 列表条数提示 |
| `process-timeline-tools.json` | Process 行、**ComposerPeekBar**、Plan 浮卡、模型/附件 chips |
| `hitl-clarification.json` | 可读 fixture 标题 |
| `hitl-tool-approval.json` | 同上 |
| `workbench-*` | 标题与 fixture 名一致 |
| `connection-offline-error.json` | 离线 Pill 文案、Service Banner、ProblemDetails |
| `workbench-sources-retrieval-only.json` | Sources Tab「仅检索无文件」 |
| `hitl-clarification.json` | Composer 澄清选项 UI |
| `hitl-tool-approval.json` | 工具审批条 + 批准/拒绝 |
| `workbench-report-markdown.json` | Workbench Report Tab + **全屏阅读** |
| `workbench-*`（artifact） | Artifact diff + **全屏 Reader** |

## 通过标准（本阶段）

- Dev Menu 可进入上述 JSON **同名**场景且无读文件错误。
- 顶栏 **≡** 打开 Drawer（**Reduce Motion** 时无滑入动画；detent 切换同样无动画）；**搜索框**过滤会话、**刷新列表**、**置顶/最近**分组、会话 **长按菜单**（重命名 / 置顶 / 删除，Preview 假确认）；Drawer **设置** 进入 Settings（主题/**正文字号**/Reduce Motion/API URL；**MCP** / **Memory** 子页 CRUD）；`empty-landing.json` 含多行 sessionDrawer 数据。返回 Chat 后字号与主题即时生效。
- **Reader**：Report 走 **PreviewMarkdownText**；Artifact 为 monospace diff。
- `streaming-assistant-tail.json`：Composer **Follow-up 队列**；assistant **ReplayController** 逐字增长 tail。
- `workbench-activity-bash.json`：Activity 时间线高亮 + **bashSnippet** 只读终端。
- Workbench 入口（WB 角标或自动展开）含五 Tab；Report/Artifact 可进 Reader。
- `connection-offline-error` 展示连接/错误假状态。

- Composer **模型 / 附件 / Skill** Sheet 可打开并关闭（`AppSheet`）。
- Composer **`+` / TextArea / 发送** 输入行（`disabled` / HITL 时不可编辑）。
- **Peek 条**（`process-timeline-tools`）点击打开 Workbench。

- `workbench-report-markdown.json` / 含 `#` 或代码块的 assistant：**PreviewMarkdownText** 轻量渲染。

- Workbench **三档 detent**：点 Sheet 顶部横条循环 44% / 72% / 98%；`initialSheetIndex` 来自 fixture。
- **UI 回归 #2**：`workbench-sources.json` 打开 Workbench → 切到 **44%** 低档，Composer 输入行仍可见可点（双端 Paparazzi/Snapshot 基线见 `GateAWorkbenchDetentSnapshot*`）。
- Plan 浮卡、工具审批行支持 **展开/收起**。

Replay 流式、完整 Markdown 与双端整屏快照 parity 仍在追平（双端已有 Paparazzi / Snapshot 整屏基线；鸿蒙无自动化 Snapshot）。
