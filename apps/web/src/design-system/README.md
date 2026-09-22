# Harness Web Design System (Tailwind v4)

对齐 DeepSeek Harness（DSH）默认 **14px 正文字号轴**与间距节奏；Tailwind 语义 utility 为消费入口。**主题色**仍以 `--theme-*` 原产品暖灰/深色 palette 为准，`--h-*` 语义色映射到 `--theme-*`，不替换为 DSH bluish-neutral。

## 语义 Typography（优先于 text-sm / text-base）

| Utility | 含义 | 默认 |
|---------|------|------|
| `text-content` | 对话正文、Composer、顶栏标题 | 14px |
| `text-content-secondary` | 工具行、meta、Workbench 列表 | 13px |
| `leading-content` | 正文行高 | 24px + delta |
| `leading-bubble` | 用户气泡 | 22px + delta |
| `leading-secondary` | 次级行高 | 20px + delta |

对话与 Assistant **不要用 `text-base`（16px）** 作为正文。

## 语义颜色

| Utility | Token |
|---------|--------|
| `text-label-primary` | `--h-label-primary` |
| `text-label-secondary` | `--h-label-secondary` |
| `text-label-tertiary` | `--h-label-tertiary` |
| `bg-base` / `bg-surface` | 画布与面板 |

兼容：`text-text-primary` 等仍映射到同一语义色。

## 布局

| Utility | 含义 |
|---------|------|
| `max-w-chat` | 对话列宽（680–920 自适应） |
| `gap-flow` | 消息流间距 16px |
| `rounded-bubble` | 用户气泡 22px |
| `rounded-control` | 控件 8px |
| `shadow-panel` | 浮层 elevation（border-0） |

## @utility 组件

- `bubble-user` — 用户消息胶囊
- `type-tool-row` — 工具链次级文案
- `shadow-panel` / `shadow-prominent` — 菜单、对话框

## 禁止项

- 在 `apps/web/src/features/**` 使用 `text-base` 作对话正文（ESLint warn）
- `font-weight: 520 | 550 | 650 | 680`
- Feature TSX 中字面量 `#hex` 背景/文字
- 浮层同时 `border` + `shadow-panel`（状态色边框除外）

## 字号设置

侧栏 footer：12–17px，写入 `--h-content-font-size`，联动 secondary 与 Markdown 阶梯。

## 文件职责

- [`theme.css`](../theme.css) — `@theme`、`--h-*`、bridge `--theme-*`、dark
- [`styles/markdown.css`](../styles/markdown.css) — Markdown / Streamdown 深选择器
- [`styles.css`](../styles.css) — 壳层 BEM、虚拟列表、keyframes
