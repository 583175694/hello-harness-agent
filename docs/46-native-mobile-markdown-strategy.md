# 原生端 Markdown 策略（终态）

> **状态**：已决 — Production 对话区不再扩展自研 block 解析器。  
> **Parity 基准**：Web `Streamdown` + `apps/web/src/styles/markdown.css`；回归样本 `packages/mobile-contract/fixtures/preview/chat-markdown-gallery.json`。

## 1. 背景

Phase A 在 `core-ui` / SwiftUI / ArkTS 内实现了 **CommonMark 子集 + 手写 block UI**，用于 Gate A Snapshot 与 token 对齐。该方案 **不是** 行业终态，也不应继续叠功能（如自绘 Table）。

Production Agent 正文会出现 **GFM 表格、删除线、链接、嵌套列表、代码块** 等，与 Web 渲染差距需持续收敛。

## 2. 决策

| 端 | 终态引擎 | 对话入口（不变） | 流式策略（不变） |
| --- | --- | --- | --- |
| **Android** | [Markwon](https://github.com/noties/Markwon) 4.6.x（`core` + `ext-tables` + `ext-strikethrough` + `linkify`） | `ChatMarkdown` | `StreamingChatMarkdown` 节流后再走 Markwon |
| **iOS** | [MarkdownUI](https://github.com/gonzalezreal/MarkdownUI)（底层 swift-cmark / GFM） | `ChatMarkdownView` | 同 Android 语义 |
| **HarmonyOS** | **Phase H1**：接入系统/生态 Markdown 或 **cmark-gfm NAPI**（待 POC）；**禁止** 继续扩展 `ChatMarkdown.ets` 手写 parser | `ChatMarkdown` | 同左 |
| **Report / Reader** | v1 仍 **不用 WebView**；Markwon / MarkdownUI 渲染大篇 Markdown；超长报告可 v1.1 评估只读 WebView |

**明确不做**：三端各维护一套 `parseMarkdownBlocks`；在 Compose 里手画 Table 网格作为长期方案。

**保留**：`design-tokens.json` 驱动颜色/字号；Markwon `TableTheme` / MarkdownUI `Theme` 映射 token。

## 3. 迁移阶段

### M1 — Android Production（本仓库已启动）

- `ChatMarkdown` → Markwon + `TextView`（`AndroidView`）
- 插件：Tables、Strikethrough、Linkify
- ~~自研 `MarkdownBody.kt`~~ **已移除**（Gate A / Reader / 对话统一 **Markwon** / **MarkdownUI**）

### M2 — iOS Production（已完成）

- SPM：**MarkdownUI**（`swift-markdown-ui` ≥ 2.4）
- `MarkdownBodyView` → `Markdown` + `Theme.harnessChat`
- `HarnessMarkdownTheme.swift` 映射 `HarnessColors` / 用户字号

### M3 — HarmonyOS

- POC：`@ohos/` 或 C++ cmark-gfm → NAPI
- 通过后再替换 `ChatMarkdown.ets` 内 line-split 解析

### M4 — 验收（已建立资产）

- 清单：`packages/mobile-contract/fixtures/markdown-golden/manifest.json`（5 场景：gallery + 4 条 agent golden）
- **CI（L0）**：`pnpm --filter @harness/mobile-contract run validate:markdown-golden`
- **本地可选（L2，不进 git）**：Android `GateAMarkdownGoldenSnapshotTest`、iOS `GateAMarkdownGoldenSnapshotTests`、Web Streamdown DOM snapshot — 见根目录 `.gitignore`
- 鸿蒙：见 [47-harmony-markdown-m3-poc.md](./47-harmony-markdown-m3-poc.md)

### Gate A 单轨（工程债已决）

- **Android Preview / Production / Reader** 均走 `ChatMarkdown` → Markwon；删除 `MarkdownBody.kt`
- **iOS** 统一 `MarkdownBodyView`（MarkdownUI）
- Paparazzi / iOS Snapshot：Markwon 切换后需 **重录 baseline**（`recordPaparazzi` / `TEST_RUNNER_SNAPSHOT_RECORD=1`）

## 4. 流式与性能（与 docs/43 §10 一致）

- Run **进行中**：可对 tail 做 `StreamingMarkdown.prepareForParse` 后 **仍以 Markwon 渲染**（接受半截语法暂不解析为 table）；或极端性能场景回退 Plain Text（按 Runbook 开关）。
- **完成后**：完整 Markdown 一次渲染。
- 长列表：Markdown 在 **LazyColumn item 内**，不整页因 token 刷新；Markwon 实例 **remember**  per theme/font bucket。

## 5. 文档与架构索引

- 原默认选型： [43-native-mobile-clients-architecture.md §16.2](./43-native-mobile-clients-architecture.md)（Markwon / MarkdownUI — 现升级为 **强制**）
- Parity： [36-mobile-agent-frontend.md §4](./36-mobile-agent-frontend.md)、[45 §5.11](./45-native-mobile-phase-b-integration.md)
