# Mobile §4 Parity 验收台账

对照 [docs/36 §4](../../../docs/36-mobile-agent-frontend.md#4-全功能-parity-矩阵验收清单)。  
图例：**代码** = 生产路径已接线；**单测** = 自动化；**真机** = §14 Release Gate 仍须签字。

| ID | 状态 | 证据 |
| --- | --- | --- |
| M-SVC-1…5 | 代码 | `use-public-config` / `use-service-state` / `ServiceBanner` / `ProblemDetails`；Settings **当前生效 API URL**（M-SVC-3） |
| M-SES-1…7 | 代码 | `AgentHostProvider`、Drawer CRUD、`use-session-deep-link`、按 session Run 隔离 |
| M-RUN-1…7 | 代码+单测 | `observeRun` + AppState 断 SSE / 回前台续订 + **后台 30s Snapshot 轮询**（§7.3）；`agent-run-state` 单测 |
| M-CONV-1…5 | 代码+单测 | `map-conversation-to-mobile`、`MarkdownView` `[Sx]`→Workbench 来源 |
| M-CONV-6 | 代码 | FlashList + `stickToBottomThresholdPx`；**流式生成中不吸底**（Web 仍吸底） |
| M-CONV-7…8 | 代码 | Workbench focus、`MessageCopyButton` |
| M-CMP-1…11 | 代码 | `ComposerStack`、HITL、`FollowUpQueuePanel`/`PlanFloatingCard`、附件/粘贴/steer |
| M-SET-1…5 | 代码 | `app/settings/*`、MCP CRUD/test、Memory API |
| M-PND-1 | 部分 | promote / send / cancel 已接线；**`resumePendingQueue` 与 Web 均未暴露 UI** |
| M-CMP-12 | 代码 | `MODEL_TRANSCRIPT_INCOMPATIBLE` / integrity → `ComposerBlockBanner` + 禁发 + 新建会话 |
| M-CMP-13 | 代码 | `beginArtifactRevision` + `artifactVersionContext` |
| M-FILE-* | 代码 | 上传/轮询/retry/delete（`use-composer-attachments`） |
| M-ART-* | 代码 | Workbench 预览/下载/restore/revise |
| M-RPT-1 | 代码 | `useWorkbenchReport`、`getReportForArtifact` |
| M-RPT-2 | N/A | Web 未暴露 delete Report UI |
| Workbench Tab/Focus | 代码 | `workbench-*`、`mobileWorkbenchViewFromFocus` |
| §7.4 推送 | 代码 | `expo-notifications` + Settings 开关；后台 Run 终态 / HITL |
| P8 Maestro | 语法✅ E2E open | 六条 flow（§12.2）+ `test:maestro:syntax`；E2E 前 `test:maestro:preflight` |
| §14 全量 | 真机 | 双端 Snapshot 对照、3s 定位、杀 App 恢复 — **未完成** |

最后更新：2026-10-21 — `pnpm check`/`test` 绿；`expo-dev-client` + EAS `simulator` profile；Maestro **六条** syntax ✅；E2E `pnpm test:maestro:e2e`（需 `com.harness.agent`）；§14 真机/Maestro 跑通 open。
