# AI PPT HTML（生成可直接转 PPTX 的演示稿）

## 何时使用

用户要「PPT / PPTX / 演示稿 / 汇报材料 / 路演页 / 培训课件」，并且需要可编辑的
成品，而不是一张图片、一段大纲或一份 Markdown。若用户只要文字大纲，不要用本
Skill，直接回答即可。

## 默认流程：一次生成，PPTX 为主产物

PPTX 是主交付物，HTML 是同源的预览稿，不需要用户先确认再导出：

1. **结构化路径（优先）**：调用 `ppt_export`，传 `deckPlan`。工具一次完成渲染、
   预检和导出，返回 `status: "ok"` 的 PPTX，并在 `preview` 字段附上 HTML 预览。
   只调用一次；不要再追加一轮 `ppt_export(htmlFileId=...)`。
2. **手写 HTML 路径**：用户要求自定义 HTML，或已有 16:9 演示 HTML 需要转 PPTX 时，
   用 `create_file`（`contentMode: "html"`）交付 HTML；之后可调用
   `ppt_export(htmlFileId=..., fileName=...)` 转换，或由用户在 Workbench 点「下载 PPTX」。

不要伪造 PPTX：只有 `ppt_export` 返回 `status: "ok"` 才能对用户说“已生成 PPTX”。

## 硬契约（违反会导致导出失败或被降级）

### 画布与结构

- 一页一个根节点：`<section class="slide">`。导出器按 `.slide` 选择页面，
  子元素**不要**再带 `slide` 这个 class（`slide-header` / `slide-body` 可以，
  它们是不同 token）。
- `.slide` 必须显式声明 `width: 1280px; height: 720px; overflow: hidden;
position: relative;`。
- 禁止 `position: fixed`，禁止 `vw` / `vh` 等视口单位。整页是固定画布，不是网页。
- 允许用一个外层 `.deck` 纵向排列所有 `.slide`，仅用于预览滚动；导出只取 `.slide`。

### 字体

- `font-family` 必须显式写，第一个字族用镜像里真实存在的：
  `"Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", sans-serif`。
- 禁止 `-apple-system`、`system-ui`、`BlinkMacSystemFont`、`PingFang SC`。
  导出器会把整份 HTML 的 `font-family` 归一化成上面这条栈，但**不要把可移植性
  寄托在归一化上**：稿子本身必须能在这套字体下不溢出。
- 字号（1280×720 画布）：页面标题 28–44px，小节标题 18–24px，正文 14–18px，
  表格 12–15px，脚注 ≥ 11px。封面主标题可以 48–64px。
- 行高 1.4–1.7。不要用负 `letter-spacing` 压缩文字，导出后字宽会变。
- 文本容器留 10% 余量。浏览器按字体度量折行，PowerPoint 可能多折一行。

### 表格

- 数据必须用原生 `<table>` / `<thead>` / `<tbody>` / `<tr>` / `<th>` / `<td>`。
- 列宽用 `colgroup` 或首行单元格宽度表达，不要用 flex/grid 模拟表格。
- 表头用纯色背景，不要渐变；边框用 `border`，不要 `box-shadow`。

### 议程 / 目录这类“版面型列表”

- **禁止用 `<ul>` / `<ol>` / `<li>` 排版**议程、目录、步骤、时间轴。
  导出器有专门的列表分支，会把整组 `<li>` 合并成**一个文本框**：
  每个 `li` 的 `border-bottom` 分隔线全部丢失，`li` 内部的 flex `gap`
  也会塌掉，表现为“序号贴着标题、行间没有分割线”。
- 每一行写成独立的 `div`，行内用 flex 排编号和文字：
  ```html
  <div class="agenda-row">
    <span class="agenda-num">01</span>
    <span class="agenda-text">核心结论：这个赛道到底有多大</span>
  </div>
  ```
- 行间分割线画在**行元素自己**身上（`border-bottom`），或单独放一个
  `<div class="rule">`；这样导出后会成为独立的形状/边框。
- 编号与标题之间要有明确间距（`gap` 或 `padding-left`），不要依赖空白字符。
- 纯正文项目符号仍可用 `<ul><li>`，但不要给 `li` 加编号样式、边框或背景。
  一旦 `li` 承载视觉版式，就换成 `div` 行。

### 形状、图片与特效

- 纯色块、圆角矩形、圆形可原生导出。
- 仅 `linear-gradient` 可靠；`radial-gradient` / `conic-gradient` 会降级为图片。
- 禁止 `clip-path`、`mask`、`filter`、`backdrop-filter`、`mix-blend-mode`。
- 图标优先内联 SVG。不要用字体图标：会变成截图，且缺字时直接消失。
- 图片用绝对 URL 或随包资源，显式写 `width` / `height`；单图不要超过 4MB。

### 文本切分

数字与单位必须在同一个文本节点里：写 `<span>816 万</span>`，不要拆成
`<span>816</span><span>万</span>`。导出器按文本节点切 run，拆开后单位会掉行。

## 内容与视觉建议

- 先定叙事：一句话结论 → 3–6 个支撑章节 → 结论/行动项。不要一上来堆版式。
- 一页只讲一件事。标题写结论，不写“市场分析”这种分类名。
- 8–12 页是管理层汇报的舒适区；少于 5 页通常讲不清，多于 15 页要拆分。
- 每页留白要够。宁可少一条要点，也不要把正文压到 12px 以下。
- 数据页必须标来源；口径不一致的数字不要并排比较。
- 需要强调时用字重、颜色和留白，不要叠阴影、发光和渐变。

## 交付流程（必须按顺序）

1. 确认受众、页数、语言、是否有品牌色/字体要求。缺省按「中文、8–12 页、
   16:9、面向管理层」处理，不要反复追问。
2. 收集事实与来源；没有来源的数字标注为估算，不要编造。
3. 写 HTML：先搭 `.slide` 骨架和一套 CSS token，再逐页填内容。
4. 自检下面「提交前检查」，发现问题就地改，不要把坏稿交给导出。
5. 结构化路径调用 `ppt_export` 传 `deckPlan`，一次交付 PPTX 与 HTML 预览；
   手写路径用 `create_file`（文件名以 `.html` 结尾，`contentMode: "html"`）交付 HTML。
6. 按 `ppt_export` 结果如实汇报：
   - `status: "ok"`：说明页数、原生表格数、中文覆盖率，提示用户打开 PPTX；可顺带提示 Workbench 可预览 HTML。
   - `status: "degraded"`：说明失败码与原因，交付 HTML，**不要**声称已有 PPTX。

用户已有演示 HTML、明确要求转换时，再调用 `ppt_export(htmlFileId=..., fileName=...)`。

## 提交前检查

逐条确认，任一条不满足就先改：

- [ ] 每页都有且只有一个 `class="slide"` 根节点，页数符合预期。
- [ ] `.slide` 是 1280×720、`overflow: hidden`，没有 `vw` / `vh` / `position: fixed`。
- [ ] 全篇没有黑名单字体，`font-family` 第一条是 `Noto Sans CJK SC`。
- [ ] 没有 `clip-path`、`mask`、`filter`、`backdrop-filter`、`mix-blend-mode`。
- [ ] 表格是原生 `<table>`，没有用 flex/grid 拼。
- [ ] 议程/目录/步骤用 `div` 行，没有用 `<ul>/<ol>` 承载编号、边框或背景。
- [ ] 最长的正文块在 1280×720 里没有贴边、没有溢出。
- [ ] 数字与单位在同一文本节点。
- [ ] 每页有页码或页脚；来源页有来源。

导出器会再跑一遍静态契约检查（`html_contract_violation`）和导出后验收
（页数、画布、字族、中文覆盖率、原生表格）。静态检查失败时不会启动浏览器，
直接把原因返回给你；按原因改 HTML 后重试即可。

## 反面模式

- 把整页做成一张背景图或 SVG：文字不可编辑，中文字体校验也会失真。
- 用 `transform: scale()` 把 1600×900 的稿子压进画布：导出几何会错。
- 在 `.slide` 里再嵌 `.slide`：导出器会把嵌套节点也当页面。
- 用 `<ol>` 做议程页：导出器会把 6 行合成一个文本框，分隔线和编号间距一起消失。
- 用 `radial-gradient` 做封面背景：会降级成图片，文件变大且不可编辑。
- 为了塞下内容把正文字号压到 10px 以下：PPTX 里会糊成一团。
