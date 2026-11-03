# mobile-contract

Native Mobile 三端共用契约：**design tokens**、**Preview fixture**、**JSON Schema**（Phase A 静态 UI；Phase B 增加 domain golden）。

权威任务书：[docs/44-native-mobile-phase-a-static-ui.md](../../docs/44-native-mobile-phase-a-static-ui.md)  
架构：[docs/43-native-mobile-clients-architecture.md](../../docs/43-native-mobile-clients-architecture.md) §16.3

## 目录

| 路径 | 用途 |
| --- | --- |
| `design-tokens.json` | 颜色 / 布局 / 文案 token 数值权威（自 design-tokens `design-tokens.ts` + `ui.constants.ts` 迁移） |
| `schema/` | `ActiveSessionState` 等与 Preview JSON 同结构 |
| `fixtures/preview/` | Gate A **十场景**（文件名固定，三端 Dev Menu 同名加载） |

## Preview 十场景（43 §16.3）

| Fixture 文件 | Web 对照（VIA，非 1:1 文件名） |
| --- | --- |
| `empty-landing.json` | `/preview/agent/empty` |
| `streaming-assistant-tail.json` | 流式 tail（Web 多状态组合；A2 对齐） |
| `long-thread-scroll.json` | `/preview/agent/scroll-stress` |
| `process-timeline-tools.json` | `/preview/agent/tool-running`、`reasoning` |
| `hitl-clarification.json` | `/preview/agent/clarification` |
| `hitl-tool-approval.json` | `/preview/agent/tool-approval`、`/preview/c-hitl` |
| `workbench-activity-bash.json` | Activity + Bash（A6） |
| `workbench-report-markdown.json` | `/preview/agent/final-report` |
| `workbench-sources.json` | `/preview/b-sources`、`/preview/agent/sources` |
| `connection-offline-error.json` | `/preview/agent/service-unavailable` |

**可选（Gate A 十场景外）**：`workbench-sources-retrieval-only.json` — Sources「仅检索、无文件」变体；Dev Menu 若列出全部 `fixtures/preview/*.json` 则可切换。

UI **禁止**直接读 JSON；经各端 `PreviewAgentSessionPort` + 与 schema 对齐的 UI 模型。

### 流式 Replay（Phase A）

`streaming-assistant-tail.json` 含可选 `replay.assistantTail`（`tickMs` / `codepointsPerTick`）。加载后 **ReplayController** 从空 tail 增长 `pendingText`，完成后归约为 completed 文本（**无 SSE**）。

长列表：`pnpm generate:long-thread` 再生 `long-thread-scroll.json`（24 user+assistant 对）。

Run 投影 golden（§5.11）：修改 `fixtures/run-events/s*.json` 后，先构建 TS 包再生成 expected：

```bash
pnpm --filter @harness/agent-conversation build && pnpm --filter @harness/agent-run-state build
pnpm --filter @harness/mobile-contract generate:run-events-expected
```

## 校验（Preview / contract）

在仓库根目录通过 workspace filter 调用（根 `package.json` 无别名）：

```bash
pnpm --filter @harness/mobile-contract validate:gate-a
pnpm --filter @harness/mobile-contract validate              # 仅 schema + fixture 文件名
pnpm --filter @harness/mobile-contract list:gate-a-snapshot-baselines
```

三端编译 / Snapshot 与 CI job `native-mobile-gate-a-*` 一致，例如 Android：

```bash
pnpm --filter @harness/mobile-contract validate:gate-a
bash apps/android/scripts/sync-mobile-contract.sh
cd apps/android && ./gradlew :app:compilePreviewDebugKotlin --no-daemon
```

本地辅助脚本（非根 `pnpm`）：`bash scripts/gate-a-prep-commit.sh`、`bash scripts/gate-a-audit.sh`、`node packages/mobile-contract/scripts/report-gate-a-completion.mjs`。

证据索引：[docs/native-mobile-gate-a-evidence.md](../../docs/native-mobile-gate-a-evidence.md)
