# C2-E Agentic Presentation Generation / Agent 演示文稿生成与编辑方案

> 文档状态：方案评审稿。本文定义 C2-E 首版从需求理解、内容规划、结构化生成、有限协同修改到可编辑 PPTX 导出的能力边界，并记录后续演进方向。
>
> 最后更新：2026-09-17。
>
> 首版不以构建完整 PowerPoint 编辑器为目标，也不将 GenOffice 作为运行时底座。产品层、Presentation Model、Slides Ops、Revision 和 Export Adapter 由 Harness 自主掌握；高保真 PPTX 导入、往返编辑和完整画布能力按真实需求逐步增加。

## 1. 一句话定义

C2-E 首版让 Agent 将用户的主题或材料转化为结构清晰、视觉可接受、结构化可编辑的演示文稿；用户可以对生成结果进行有限但可靠的修改，并导出可继续编辑的 PPTX。

核心链路：

```text
用户需求 / 来源材料
-> Agent 理解目标并补齐必要约束
-> 规划 Brief 与 Outline
-> 为每页选择受限布局并生成内容
-> 写入 Presentation Model
-> SVG/DOM Workbench 渐进展示
-> 执行确定性 Layout Linter
-> 用户或 Agent 进行有限修改
-> 保存版本
-> 通过 Export Adapter 导出可编辑 PPTX
```

首版要验证的不是“能否做一个 PowerPoint”，而是：

1. Agent 能否生成有用的叙事和页面。
2. 用户能否快速完成常见局部修改。
3. 导出的 PPTX 是否可打开、可继续编辑。
4. 用户修改是否不会被 Agent 后台覆盖。
5. 内部模型和导出边界是否足以支撑后续升级。

## 2. 首版目标与非目标

### 2.1 首版目标

- 从一句描述或上传材料创建演示文稿。
- 先生成 Brief、Outline 和页面布局计划，再生成页面。
- 使用有限布局族和结构化页面元素，保证生成结果可控。
- 在 Workbench 中渐进展示生成中的页面。
- 支持用户和 Agent 修改同一个 Presentation Model。
- 支持标题、正文、图片、样式、位置、尺寸和页面顺序等常见修改。
- 每批 Agent 修改可观察、可整体撤销，并进行 revision 冲突检查。
- 执行确定性布局检查，给出可解释的问题和建议。
- 导出文字、图片、形状、基础表格和基础图表仍可编辑的 PPTX。
- 保存 Presentation Project、版本、来源和导出记录，并支持会话恢复。

### 2.2 首版明确不做

- 不复刻完整 PowerPoint 或完整自由画布编辑器。
- 不承诺任意已有 PPTX 的完整导入、编辑和原样往返。
- 不实现复杂母版、SmartArt、动画时间轴、宏、OLE 和复杂嵌入对象。
- 不支持无限 HTML/CSS 表现力与 PPTX 可编辑性同时成立。
- 不在首版实现实时多人协作。
- 不让 Agent 通过模拟鼠标点击操作编辑器。
- 不把自动视觉修复作为默认闭环；首版先检测、解释并提出建议。
- 不把 GenOffice 作为首版运行时底座或不可替换依赖。

## 3. 产品定位与取舍

目标体验参考 Genspark 式 Agent Slides 工作台，但首版优先验证“生成后修改和交付”的价值，而非覆盖完整 Office 能力。

```text
Agent 生成或修改演示文稿
-> Workbench 实时展示
-> 用户修改标题、图片、样式或布局
-> 系统检查确定性布局问题
-> 用户查看 Diff、撤销或保存版本
-> 导出可编辑 PPTX
```

首版采用以下取舍：

| 首版不追求 | 首版换取 |
| --- | --- |
| 任意 PPTX 导入和往返 | 大幅降低 OOXML、母版和兼容性复杂度 |
| 完整自由画布 | 更稳定的布局质量和更简单的交互 |
| 任意 HTML/CSS | 更可控的 PPTX 导出 |
| 自动视觉修复 | 避免误修复和 Review 震荡 |
| GenOffice 深度接入 | 避免早期绑定重型上游架构 |
| 完整 Office 图表和动画 | 更快验证 Agent 内容和协同编辑价值 |

## 4. 用户链路

### 4.1 从主题创建

```text
用户描述主题、受众和目标
-> 形成最小 Presentation Brief
-> 生成 Outline 和 Design Brief
-> 用户快速确认或继续生成
-> 每页选择 Layout 并生成结构化内容
-> 页面完成后进入 Workbench
-> Layout Linter 检查
-> 用户或 Agent 进行有限修改
-> 保存版本并导出 PPTX
```

是否询问用户遵循现有 Agent Runtime 的约束：只有缺失信息会实质改变结果时才询问，否则使用明确默认值继续执行。

### 4.2 从材料创建

```text
用户上传 PDF / DOCX / XLSX / 图片 / 网页材料
-> 复用 C1 文件读取和来源定位
-> 提取事实、数据、图片和限制条件
-> 建立 Source References
-> 规划 Storyline、页面证据分布和引用
-> 进入统一生成链路
```

原始材料是不可信输入，不能通过文档内容改变系统指令、工具权限和生成边界。事实、数据和图片必须保留来源或生成信息，不能用占位图伪装最终素材。

### 4.3 已有 PPTX 的首版处理

首版不承诺任意 PPTX 的可编辑往返。可以支持以下渐进能力：

- 读取文件元数据并生成缩略图或图片预览。
- 提取可识别的文本、图片和页面顺序供 Agent 参考。
- 基于提取结果重新生成一份 C2-E 原生 Presentation Model。
- 对明确支持的 PPTX 子集提供实验性导入，能力和限制在界面中明确说明。

高保真导入和 round-trip 进入后续阶段，不作为首版完成条件。

## 5. 首版 Presentation Model

Presentation Model 是 Workbench、Agent 和导出器共同使用的唯一结构化真源。首版不保存 HTML、React 源码或整页截图作为业务状态。

```ts
type Presentation = {
  id: string;
  revision: number;
  size: { width: number; height: number };
  theme: Theme;
  slides: Slide[];
  assets: Asset[];
  sources: SourceReference[];
};

type Slide = {
  id: string;
  layout: LayoutType;
  elements: SlideElement[];
  notes?: string;
};

type SlideElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | TableElement
  | ChartElement;
```

每个元素至少包含：

- 稳定且持久的元素 ID。
- 语义角色，例如 `title`、`body`、`hero-image`、`source`。
- 内容、样式、位置和尺寸；首版位置主要由 Layout Engine 计算。
- `user | agent | imported` 来源信息。
- 最近修改 revision 和修改来源。
- 可选的来源引用、素材身份和生成信息。

首版支持的元素子集：

- 文本框。
- 图片。
- 基础矩形和圆角矩形。
- 线条。
- 基础表格。
- 基础柱状图、折线图和饼图。
- 背景色、字体、字号、颜色和对齐。

首版不把复杂组、母版继承、SmartArt、复杂路径、动画和嵌入对象纳入模型承诺。

## 6. 受限布局与生成策略

首版不让模型直接决定每个元素的任意坐标。模型先选择布局，再填充布局槽位；确定性 Layout Engine 负责网格、边距、字号、换行、间距和溢出检测。

首版布局族建议包括：

```text
title
 title-content
two-column
image-text
full-image
quote
comparison
timeline
data-highlight
closing
```

每种布局定义有限区域，例如：

```text
title-content:
- title
- subtitle?
- body
- optional source

image-text:
- title
- image
- body
- optional caption
```

生成路径：

```text
Presentation Brief
-> Outline
-> 每页选择 Layout
-> 生成页面语义内容和素材引用
-> Layout Engine 计算坐标
-> Presentation Model
-> Render
-> Layout Linter
-> Export
```

模型负责主题理解、叙事结构、页面类型、文案、图片选择和图表数据；确定性代码负责几何布局、排版约束、溢出检查和 PPTX 输出。这样可以减少页面随机性，并为后续增加布局族和高保真渲染保留空间。

## 7. Slides Ops、Revision 与事务

人工编辑和 Agent 编辑必须使用同一组结构化操作。首版操作种类可以有限，但入口和语义不能临时化。

```ts
applyOperations({
  presentationId,
  baseRevision,
  transactionId,
  source: 'user' | 'agent' | 'review',
  operations,
});
```

首版建议支持：

```text
updateText
replaceImage
updateStyle
moveElement
resizeElement
deleteElement
addElement
moveSlide
applyTheme
```

一次操作批次必须：

1. 校验参数、目标和权限。
2. 检查 `baseRevision` 是否仍然有效。
3. 原子执行整批操作。
4. 任一步失败时恢复事务前状态。
5. 记录结构化 before/after journal。
6. 形成一个可整体撤销的 Undo 节点。
7. 返回受影响的页面、元素和新 revision。

生成过程中如果用户修改了已完成页面，后续 Agent 写入必须通过 revision 检查；不能静默覆盖用户修改。发生冲突时返回明确状态，由 Agent 重新读取上下文后重试或请求用户选择。

History 服务于当前编辑会话内的 Undo/Redo，Version 是持久化、可恢复和可交付的项目状态，两者不能混为一谈。

## 8. Workbench 与首版渲染

Slides Workbench 复用现有 WorkbenchShell、Agent 对话、任务状态、权限、会话恢复和 Artifact 交付链路；首版只增加必要的 Slides 视图。

推荐首版使用 SVG/DOM Renderer：

- SVG 或 DOM 渲染文本、图片、形状、表格和图表。
- CSS 和绝对定位表达页面布局。
- 普通 DOM 负责文本原位编辑和输入法。
- 选择框、操作手柄和属性面板使用 React/DOM。
- 页面缩放使用容器变换，不让渲染器成为业务状态真源。

SVG/DOM 对首版的页面数量和元素数量已经足够，且文本编辑、可访问性、截图、浏览器调试和自动化测试更简单。后续如果自由编辑、性能或复杂交互成为真实瓶颈，可以在不改变 Presentation Model 和 Slides Ops 的前提下替换为 Konva 或其他场景图 Renderer。

首版 Workbench 只承诺有限编辑能力：

- 修改标题和正文。
- 替换图片。
- 修改颜色、字号和基础样式。
- 移动和调整尺寸。
- 删除或新增简单元素。
- 页面增删、复制和排序。
- 应用主题或布局变体。
- 查看 Agent 修改 Diff 并整体撤销。

不承诺完整自由画布、复杂富文本、任意旋转、复杂组合、复杂吸附、完整属性面板和所有 Office 编辑能力。

## 9. Agent Runtime 集成

C2-E 继续复用现有 Agent Runtime、Model Adapter、Tool Registry、取消、超时、会话和事件投影能力，不另造 Presentation Agent Runtime。

首版领域工具保持小而完整：

```text
create_presentation_project
read_presentation_context
update_presentation_outline
set_presentation_theme
generate_slides
read_slide
apply_slide_operations
render_slide
review_slides
save_presentation_version
export_presentation
```

模型不直接接触任意文件路径、OOXML、React 源码或底层数据库字段。完整 Deck、完整截图和所有元素 JSON 不默认注入上下文，按当前页面、相关页面、Theme Tokens、来源片段和受控 Workbench Context 按需读取。

选择状态必须解析为稳定 ID；页面排序改变后不能继续使用旧索引盲改。工具输出和 UI 状态来自同一 canonical 事务结果，前端不能根据流式文案推测修改事实。

页面可以并行准备，但写入 Presentation Project 时必须保持确定顺序、稳定身份和独立失败状态。单页失败不能丢弃已完成页面；失败页可以单独重试或降级为基础布局。

## 10. Review：首版先检测和建议

Review 首版分为确定性检查和模型建议，不默认自动提交模型修复。

### 10.1 Layout Linter

确定性检查至少包括：

- 元素越界。
- 文本溢出。
- 非预期重叠。
- 边距、间距和对齐异常。
- 对比度不足。
- 空页面或缺失必需布局槽位。
- 未解析素材或字体缺失风险。

### 10.2 模型建议

视觉模型可以读取页面结构和截图，提出以下建议：

- 信息密度过高。
- 页面层次不清。
- 标题表达不准确。
- 图片与文字关系不合理。
- 页面之间重复或缺乏承接。

首版流程为：

```text
自动检测
-> 展示问题和依据
-> Agent 生成受限修复方案
-> 用户确认或一键应用
-> 以普通 Slides Ops 提交
```

首版不把“问题数量减少”作为自动提交条件，也不允许 Review 无限触发 Review。自动批量修复、评分函数和回滚保护进入后续阶段。

## 11. PPTX 策略

首版采用单向 Export Adapter：

```text
Presentation Model
        ↓
PPTX Export Adapter
        ↓
PptxGenJS 或同类轻量生成器
        ↓
可编辑 PPTX
```

首版交付目标是：自己生成的演示文稿能够在 PowerPoint 中打开，文字、图片、形状、基础表格和基础图表保持可编辑；不以任意 PPTX 的原样往返为目标。

导出器必须独立于生成逻辑、Workbench 和 Agent Tool：

```ts
interface PresentationExporter {
  export(input: Presentation): Promise<Uint8Array>;
}
```

首版必须验证：

- PowerPoint 打开不出现修复提示。
- 页面尺寸、文字、图片和基础形状视觉一致。
- 导出元素在 PowerPoint 中仍可选择和编辑。
- 中英文混排、缺失字体和图片裁剪有明确降级行为。
- 导出失败不产生伪成功 Artifact。

首版不支持或不保证：复杂母版、主题继承、SmartArt、动画、宏、OLE、复杂嵌入对象、复杂路径、任意 OOXML 保留、未修改 Part 原样保留和复杂组往返。

后续如确有需求，再增加：

```text
PPTX Import Adapter
Round-trip Patch Layer
GenOffice Engine / Render / Ops Adapter
```

这些能力必须位于产品层和 Presentation Model 之外，不改变 Agent、Slides Ops 和版本边界。

## 12. Presentation Project、版本与 Artifact

Presentation Project 持久化：

- Presentation Model 或内容引用。
- Brief、Outline、Design Brief 和 Theme Tokens。
- Assets、来源引用和版权/生成信息。
- 当前 revision。
- Layout Linter 和 Review 建议。
- 版本和导出记录。
- 原始输入材料引用。

版本沿用 C2-D 的线性不可变能力：

```text
Project 当前版本
-> Agent 或用户完成一批修改
-> 创建新版本
-> 旧版本保持可恢复
-> 从指定版本导出 PPTX Artifact
```

PPTX 导出结果进入现有 File/Artifact 交付链路，关联 Presentation Project、Version、Session、Run 和导出任务；不把临时本地路径作为用户可见身份。

## 13. GenOffice 与其他候选的定位

GenOffice 不作为首版运行时底座。它的定位是：

- 后续高保真 PPTX 引擎候选。
- PPTX 兼容性和 round-trip 测试参考。
- 在产品模型和 Export Adapter 稳定后评估的 Engine/Render/Ops 实现。
- 如果真实需求证明完整导入和复杂编辑有足够价值，再通过 Adapter 接入的备选方案。

首版不应先 fork 或 vendor GenOffice 的完整应用。只有隔离 PoC 证明其核心能力可在浏览器、无 Electron 依赖和稳定 Adapter 下运行时，才考虑复用其中的 Engine、Render 或 Ops。

Presenton、pptx-viewer、PPTist、open-slide 等继续作为研究和对照对象，不在首版形成运行时依赖。其产品交互、Inspector、Design Tokens 和 Agent-native 反馈闭环可以借鉴，但必须以首版边界和许可证审查为前提。

## 14. 分阶段交付

### C2-E0：生成模型和导出验证

目标：证明 Agent 能生成结构化、可编辑的演示文稿。

包括：

- Presentation Brief、Outline 和 Design Brief。
- 5 至 10 种受限布局。
- Theme Tokens 和素材引用。
- Presentation Model。
- SVG/DOM Renderer。
- 基本 Layout Linter。
- PPTX Export Adapter。
- 20 至 30 个真实测试 Deck。

退出条件：

- 生成结果在结构和布局上可重复。
- 代表性 Deck 在 PowerPoint 中打开无修复提示。
- 文字、图片、形状和基础图表可继续编辑。
- 关键布局问题可以被确定性检测。
- 失败不会生成伪成功 Artifact。

不包括在线自由编辑、任意 PPTX 导入、自动视觉修复和 GenOffice 集成。

### C2-E1：有限协同编辑

目标：证明用户和 Agent 可以共同修改同一个演示文稿。

包括：

- 标题、正文、图片、颜色、字体和基础样式修改。
- 元素移动、尺寸调整、删除和新增。
- 页面增删、复制和排序。
- Agent 修改高亮、Diff 和整批撤销。
- revision 冲突检测。
- 版本保存和会话恢复。

验收重点是用户修改不会被后台生成覆盖，且一次 Agent 修改可以可靠撤销。

### C2-E2：来源、Review 与成熟度增强

目标：提升可信度、质量和复用能力。

包括：

- Source References、引用和素材版权/生成信息。
- 更完整的 Layout Linter。
- 截图视觉 Review 建议。
- 用户确认后的受限批量修复。
- 品牌主题和模板。
- 主题级重排。
- PDF、图片等其他导出格式。
- 明确限定范围的基础 PPTX 导入。

### C2-E3：高保真编辑和引擎升级

只有真实用户需求和数据证明必要时才进入：

- 复杂 PPTX 导入和 round-trip。
- 母版与主题继承。
- 更完整的图表、组和富文本。
- 高保真字体和排版。
- 更强的 Canvas Renderer。
- GenOffice Engine/Render/Ops Adapter。
- 自动视觉修复和质量回退保护。
- 实时多人协作。

## 15. 质量指标与测试集

首版不能只用“功能已实现”验收，应同时建立质量指标：

- 生成成功率和单页失败率。
- 生成耗时和用户等待时间。
- 文本溢出、越界、非预期重叠比例。
- PowerPoint 修复提示率。
- 导出后可编辑元素覆盖率。
- 用户首次修改成功率和撤销成功率。
- Agent 修改覆盖用户修改的次数。
- 来源缺失和素材版权信息缺失率。

测试集至少覆盖：

- 新建的简单演示文稿。
- 中英文和混合字体。
- 图片裁剪、透明度和缺失素材。
- 文本密集和数据密集页面。
- 基础表格和基础图表。
- 20 至 50 页中型 Deck 的渐进生成。
- 网络、模型、导出和单页生成失败。
- 生成过程中用户修改已完成页面。
- PowerPoint、LibreOffice 或其他目标查看器的打开和编辑结果。

## 16. 建议代码组织

首版建议先建立逻辑边界，物理包可随实现规模逐步拆分：

```text
packages/
  slides-model/       Presentation Model、Theme、Layout 和来源类型
  slides-ops/         统一编辑操作、验证、revision 和事务
  slides-renderer/    SVG/DOM RenderTree 和页面预览
  slides-pptx/        PPTX Export Adapter
  slides-review/      Layout Linter 与 Review 建议
  slides-agent-tools/ Agent Tool Schema 与领域上下文
  slides-assets/      图片、字体、缩略图和来源信息
  presentation-gen/   Brief、Outline、布局选择和生成编排

apps/web/src/features/
  slides-workbench/   Harness 产品 UI 与 Workbench 插件
```

不要在首版一开始拆出大量独立服务或完整 Engine 包。先保持模块边界清晰，再根据 PoC、性能和真实用户需求决定是否物理拆包。

## 17. 当前结论

1. C2-E 首版采用 Agent-first 的受限 Presentation Model，不以完整 PowerPoint 编辑能力为目标。
2. 首版支持从主题和材料生成结构化演示文稿、有限协同修改、确定性布局检查和可编辑 PPTX 导出。
3. 首版暂不承诺任意 PPTX 导入和 round-trip，也不把 GenOffice 作为运行时底座。
4. 产品层、Presentation Model、Slides Ops、Revision、Version 和 Export Adapter 由 Harness 自主掌握。
5. 首版优先使用 SVG/DOM Renderer 和轻量 PPTX Export Adapter；复杂 Canvas 和高保真引擎后置。
6. Review 首版以检测和建议为主，自动视觉修复必须在后续有可靠评分、回滚和人工确认机制后引入。
7. GenOffice、Presenton、PPTist、pptx-viewer 和 open-slide 作为后续候选或设计参考，不提前形成不可替换依赖。
8. 后续所有增强都必须保持 Agent、Workbench、Presentation Model、Slides Ops 和导出边界稳定，避免为了首版速度牺牲升级路径。
