# AI PPT P0 MVP（链路快照）

> 分支：`codex/feat/ai-ppt-mvp` · 真相源：`deck-plan.json` · 导出：`dom-to-pptx@2.1.2`

## 链路图

```text
deck-plan.json ──render──► deck.html ──F0/F1──► dom-to-pptx ──► deck.pptx
                              │                              │
                              └──────── unpack / ExportReport ◄┘
已有 16:9 演示 HTML ──ppt_export(htmlFileId)──► 同一导出链 ──► deck.pptx
F0 失败 → 仅 HTML + export-report.json（failureCode=env_font_missing）
导出/验收失败 → 重试 1 次 → 仍失败 → HTML + 原因
```

`ppt_export` 有两种输入，但都走同一条“渲染 HTML → F0/F1 → 导出/验收”链路：

- `deckPlan`：一次调用完成确定性渲染与导出，成功时同时交付 PPTX 主产物和
  同源 HTML 预览（`preview`）；不再等待用户确认或进行第二轮导出。
- `htmlFileId`：复用会话内已有的 16:9 演示 HTML 直接导出 PPTX，内容和版式
  不重生成；也适合避开大 deck plan 超出模型输出预算的场景。

HTML 预览用于在 Workbench 中核对版式，不构成单独的交付阶段；用户在预览上
点击“下载 PPTX”仍是同一条导出链的便捷入口。

## 已实现

| 项                                                        | 位置                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Sandbox CJK 字体 + 构建期 F0                              | `dev/opensandbox-local/Dockerfile.harness-sandbox-browser`、`scripts/font-probe-f0.sh` |
| 类型 `DeckPlan` / `Layout` / `StyleSpec` / `ExportReport` | `packages/ai-ppt/src/types.ts`                                                         |
| 6 版式确定性渲染（1280×720，字族契约）                    | `packages/ai-ppt/src/render/render-deck.ts`                                            |
| F0 `fc-match` + Playwright 中文探针                       | `packages/ai-ppt/src/preflight/f0-env.ts`                                              |
| F1 静态 + 溢出                                            | `packages/ai-ppt/src/preflight/f1-static.ts`、`f1-overflow.ts`                         |
| 导出封装                                                  | `packages/ai-ppt/src/export/export-pptx.ts`                                            |
| HTML 直转 PPTX                                            | `packages/ai-ppt/src/pipeline/export-html-file.ts`                                     |
| HTML 生成侧契约 lint                                      | `packages/ai-ppt/src/preflight/lint-html.ts`                                           |
| Skill `ai-ppt-html`                                       | `packages/bundled-skills/skills/ai-ppt-html/`                                          |
| Web 端 HTML → PPTX 下载                                   | `apps/web/.../workbench-views.tsx`、`POST /api/agent/artifacts/:id/export-pptx`        |
| 编排 + 降级                                               | `packages/ai-ppt/src/pipeline/build-deck.ts`                                           |
| 10 页中文 fixture                                         | `packages/ai-ppt/fixtures/sample-10-cn/deck-plan.json`                                 |
| 渲染单测                                                  | `packages/ai-ppt/test/render.spec.ts`                                                  |
| E2E 脚本                                                  | `scripts/ai-ppt-e2e.mts`                                                               |
| 解包验收                                                  | `scripts/ppt-unpack-check.py`                                                          |
| Agent 工具 `ppt_export`                                   | `apps/api/src/tools/ppt-export.tool.ts`、`packages/agent-protocol/src/presentation/`   |
| 工具单测                                                  | `apps/api/test/unit/tools/ppt-export.tool.spec.ts`                                     |

## 导出前的两处转换器修正

`dom-to-pptx@2.1.2` 在这两类 HTML 上会产出错误的 PPTX，导出前统一修正：

| 现象                                                                                            | 修正                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `::before { content: counter(p) }` 被写成字面量 `counter(p)`，并与 `<ol>` 的自动编号叠成 `I. 1` | `src/export/pseudo-counters.ts` 把计数器伪元素展开成真实徽章元素，列表项换成普通行                                                                                                                             |
| 短标签、数值（如“已商品化”“7,358”“8,791 +19.5%”）在 PPTX 里折成两行                             | `src/export/text-fit-fixes.ts` 对浏览器内单行的短文本（含行内 `<span>` 子元素）补 `white-space: nowrap`（导出为 `wrap="none"`）；不改宽度（会把表格列宽撑出画布），不改 `display`（会破坏 badge 的 flex 居中） |
| `<ul>`/`<ol>` 排的议程页在 PPTX 里丢分隔线、序号贴住标题                                        | 生成侧由 `ai-ppt-html` Skill 约定改用 `div` 行；`src/preflight/lint-html.ts` 的 `html_layout_list` 在导出前拦截（普通项目符号列表不受影响）                                                                    |

两处都只处理命中的元素，其他版式不动；导出仍走同一套 unpack 校验。

## HTML 直转路径的生成侧门禁

`exportHtmlFileToPptx` 在启动浏览器前先跑 `lintPresentationHtml`，把
docs/48 §14 中可静态判定的约束变成硬检查：`.slide` 根节点数量、1280×720
画布、字体黑名单、`vw`/`vh`、导出器无法复现的 CSS，以及“版面型列表”。
失败直接返回
`failureCode=html_contract_violation`，不再白等一轮导出。

“版面型列表”指用 `<ul>` / `<ol>` 承载议程、目录、步骤等版式：`li` 自带
边框/背景，或列表项里带加粗编号。`dom-to-pptx` 的 `<ul>/<ol>` 分支会把
所有 `li` 合并成**一个文本框**，`li` 的 `border-bottom` 不会输出、flex
`gap` 也会塌陷（表现：分隔线消失、序号贴住标题）。lint 要求这类版式改用
`div` 行，分隔线画在行元素上；普通正文项目符号列表仍然允许。

字体归一化在 lint 之前执行：历史稿常用 `PingFang SC`，导出器本来会改写为
镜像字族，放在 lint 之后会误杀能导出的稿子。

## 未实现（P0 刻意不做）

- 异步导出队列、在线编辑器、PDF 降级（仅 HTML 降级已做）
- P1 回渲染 MAE、元素级编辑

## dom-to-pptx API 说明

文档 §13.7 与 **2.1.2 实际导出** 一致：`exportHtmlToPptx(path, { selector, injectBundle, browserWidth, browserHeight, pptxOptions })`；`pptxOptions.width/height` 单位为英寸（13.333×7.5）。

## 验收命令

```bash
pnpm --filter @harness/api test
pnpm --filter @harness/ai-ppt test
pnpm exec tsx scripts/ai-ppt-e2e.mts --out qa
python3 scripts/ppt-unpack-check.py qa/ai-ppt-e2e-run/deck.pptx \
  --html qa/ai-ppt-e2e-run/deck.html --json qa/export-report.json --strict
```

**前提**：主机或沙箱镜像已安装 `fonts-noto-cjk`（或 macOS `font-noto-sans-cjk`），且 `python3`、`playwright` 浏览器可用。`pnpm exec playwright install chromium` 若首次导出失败可先执行。

人工可读性（不提交 PNG）：

```bash
soffice --headless --convert-to pdf --outdir /tmp/ai-ppt out/deck.pptx
pdftoppm -r 96 -png /tmp/ai-ppt/deck.pdf /tmp/ai-ppt/page
```

## 实测数据

| 指标                                        | 本环境（2026-11-11）                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| 本机 E2E（macOS + Chrome）                  | `ok=true`，10 页，2 个原生表格，`cjkCoverage=1`，`overflowContainers=0` |
| Agent 工具 E2E（真实 `buildDeck`）          | `status=ok`，4 页，1 个表格，`typefaces: Noto Sans CJK SC`              |
| 容器 E2E（`harness-sandbox-browser:fixed`） | 通过；Debian 字体族为 `Noto Sans CJK SC`                                |
| unpack strict 反向用例                      | 注入黑名单字族后正确失败并降级                                          |
| 字体缺失降级                                | `degrade=html_only`、退出码 1、仅 HTML 无 PPTX                          |
| unpack 脚本缺失降级                         | 工具 `status=degraded`，交付 HTML，`failureCode=validation_failed`      |
| 人工 soffice→PNG                            | 通过（须用 LibreOffice 自带 fontconfig，否则中文可能显示方框）          |

容量 `layout.json` 的 `maxChars` 为 P0 保守估计，**未逐版式二分实测**（溢出由 F1 Playwright 兜底）。

## 交付契约

- 成功：`deckPlan` 或 `htmlFileId` 返回 `status=ok`，`artifact/file` 为 PPTX 主产物，
  `preview.artifact/file` 为同一渲染源的 HTML 预览。
- 降级：F0/F1/导出/unpack 任一失败返回 `status=degraded`，`artifact/file` 为 HTML，
  并附 `report.failureCode/failureReason`；工具本身仍算成功，方便模型向用户如实说明。
- 工具异常（缺少 runId、产物落盘失败）才返回 `status=failed`。
- SSE、运行快照和历史只保存 `fileName/title/slideCount/audience/language` 摘要，不携带整份 deck plan。

## 已知风险

- 无 CJK 字体时 MAE/几何指标可“假绿”；门禁以 F0 + 汉字覆盖率为准（见 `docs/48` §12.0）。
- macOS 默认 `fc-match "Noto Sans SC"` 可能落到西文字体；须安装 Noto 或仅在 Sandbox 镜像内跑导出。
- `dom-to-pptx` 依赖 Puppeteer 自带或系统 Chrome；与 Playwright 系 Chromium 独立。
