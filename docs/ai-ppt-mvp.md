# AI PPT P0 MVP（链路快照）

> 分支：`codex/feat/ai-ppt-mvp` · 真相源：`deck-plan.json` · 导出：`dom-to-pptx@2.1.2`

## 链路图

```text
deck-plan.json ──render──► deck.html ──F0/F1──► dom-to-pptx ──► deck.pptx
                              │                              │
                              └──────── unpack / ExportReport ◄┘
F0 失败 → 仅 HTML + export-report.json（failureCode=env_font_missing）
导出/验收失败 → 重试 1 次 → 仍失败 → HTML + 原因
```

## 已实现

| 项 | 位置 |
|---|---|
| Sandbox CJK 字体 + 构建期 F0 | `dev/opensandbox-local/Dockerfile.harness-sandbox-browser`、`scripts/font-probe-f0.sh` |
| 类型 `DeckPlan` / `Layout` / `StyleSpec` / `ExportReport` | `packages/ai-ppt/src/types.ts` |
| 6 版式确定性渲染（1280×720，字族契约） | `packages/ai-ppt/src/render/render-deck.ts` |
| F0 `fc-match` + Playwright 中文探针 | `packages/ai-ppt/src/preflight/f0-env.ts` |
| F1 静态 + 溢出 | `packages/ai-ppt/src/preflight/f1-static.ts`、`f1-overflow.ts` |
| 导出封装 | `packages/ai-ppt/src/export/export-pptx.ts` |
| 编排 + 降级 | `packages/ai-ppt/src/pipeline/build-deck.ts` |
| 10 页中文 fixture | `packages/ai-ppt/fixtures/sample-10-cn/deck-plan.json` |
| 渲染单测 | `packages/ai-ppt/test/render.spec.ts` |
| E2E 脚本 | `scripts/ai-ppt-e2e.mts` |
| 解包验收 | `scripts/ppt-unpack-check.py` |

## 未实现（P0 刻意不做）

- Agent `ppt_*` 工具、Skill `ai-ppt-html`、异步导出队列、在线编辑器、PDF 降级（仅 HTML 降级已做）
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

| 指标 | 本环境（2026-11-11） |
|---|---|
| Docker 镜像构建 + F0 | **未验证**（Docker daemon 未运行） |
| E2E（macOS，无 fontconfig 级 Noto） | `failureCode=env_font_missing`，`pipelineMs≈443`，`degrade=html_only`（**符合 F0 硬门禁**） |
| E2E（推荐） | `./scripts/ai-ppt-e2e-docker.sh`（镜像内 `fonts-noto-cjk` + 探针已通过）— **未验证**（同上） |
| `cjkCoverage` | 本机 E2E 未产出 PPTX → **未验证**；通过时应为 `1.0` |
| 溢出容器（F1） | 本机未进入 F1 导出路径 → **未验证** |
| 人工 soffice→PNG | **未验证** |

容量 `layout.json` 的 `maxChars` 为 P0 保守估计，**未逐版式二分实测**（溢出由 F1 Playwright 兜底）。

## 已知风险

- 无 CJK 字体时 MAE/几何指标可“假绿”；门禁以 F0 + 汉字覆盖率为准（见 `docs/48` §12.0）。
- macOS 默认 `fc-match "Noto Sans SC"` 可能落到西文字体；须安装 Noto 或仅在 Sandbox 镜像内跑导出。
- `dom-to-pptx` 依赖 Puppeteer 自带或系统 Chrome；与 Playwright 系 Chromium 独立。
