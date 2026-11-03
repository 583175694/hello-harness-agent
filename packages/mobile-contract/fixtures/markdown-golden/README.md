# Markdown Golden（M4）

三端 Markdown 语义回归用的 **固定 Agent 正文**。Web `MarkdownContent`（Streamdown）是 **语义与结构基准**。

**CI 门禁（L0）**：`validate:markdown-golden`（payload 与 preview JSON 一致）。  
**像素 / DOM（L2，本地可选，不进 git）**：Android Paparazzi、iOS `GateAMarkdownGoldenSnapshotTests` PNG；Web DOM snapshot 见 `.gitignore`。

## 目录

| 路径 | 用途 |
| --- | --- |
| `manifest.json` | 场景清单、`previewFixture` 与 `payloadFile` 映射 |
| `payloads/*.md` | 与 preview JSON 内 assistant 正文一致的 Markdown 源（Web 测试与人工对照） |
| `web-baselines/` | 可选：Playwright 导出的 Web 截图（见下方脚本） |

## 校验

```bash
pnpm --filter @harness/mobile-contract run validate:markdown-golden
```

## 原生 Snapshot 录制（本地，baseline 不进库）

**Android**

```bash
cd apps/android
./gradlew :app:recordPaparazziPreviewDebug \
  -Pandroid.testInstrumentationRunnerArguments.class=com.harness.agent.snapshot.GateAMarkdownGoldenSnapshotTest
```

**iOS**

```bash
TEST_RUNNER_SNAPSHOT_RECORD=1 xcodebuild test \
  -scheme Harness -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:HarnessTests/GateAMarkdownGoldenSnapshotTests
```

## Web PNG（可选）

```bash
node packages/mobile-contract/scripts/capture-markdown-golden-web.mjs
```

需本机已安装 Playwright 浏览器（`pnpm exec playwright install chromium`，可在 monorepo 根目录执行）。

## 新增场景

1. 在 `payloads/` 写 `.md`
2. 在 `fixtures/preview/` 增加对应 `markdown-golden-*.json`（user + assistant completed text block）
3. 在 `manifest.json` 登记
4. 本地可选重录 Android / iOS snapshot（PNG 在 `.gitignore`）
