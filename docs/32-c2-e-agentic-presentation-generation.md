# C2-E Agentic Presentation Generation / Agent 演示文稿生成与编辑方案

> 文档状态：方案评审稿。本文定义 C2-E 从需求理解、内容规划、视觉设计、幻灯片生成、Slides Workbench 编辑、Review 到 PPTX 交付的完整能力，并记录开源候选与 PoC 决策方法；在 PoC 完成前不冻结 GenOffice 为不可替换的最终底座。
>
> 最后更新：2026-09-16。
>
> Agent Runtime 的通用循环、模型适配和会话控制继续沿用现有架构。C2-E 在其上增加 Presentation Project、生成编排、Slides 领域工具、Review 与 Workbench，不另造一套 Agent Runtime。

## 1. 一句话定义

C2-E 让 Agent 能把用户的主题、材料或已有 PPTX 转化为经过规划、设计、生成和 Review 的可编辑演示文稿，用户可以在 Slides Workbench 中与 Agent 共同修改，并最终获得可继续编辑的 PPTX Artifact。

核心链路：

```text
用户需求 / 来源材料 / 已有 PPTX
-> Agent 理解目标并补齐必要约束
-> 规划 Storyline 与 Outline
-> 生成 Design Brief、Theme 与布局策略
-> 按页生成结构化 Slide
-> Slides Workbench 渐进展示
-> 自动 Layout Audit 与视觉 Review
-> 用户和 Agent 继续协同修改
-> 形成不可变版本
-> 导出可编辑 PPTX Artifact
```

实现上采用“重内核、轻界面、Agent 原生”的方案：产品交互、生成编排与 Workbench 集成由 Harness 自己开发，优先复用 GenOffice 的 PPTX Engine、Render 和 Ops 能力，通过稳定 Adapter 与现有系统隔离，不从零重写 PPTX 引擎，也不直接嵌入 GenOffice 完整应用。

这是一项有条件成立的候选决策：

- 产品层必须由 Harness 掌握。
- GenOffice 首先作为候选引擎验证，而不是提前成为不可替换依赖。
- 是否正式采用取决于隔离 PoC 对可拆分性、PPTX 保真、浏览器适配和维护成本的验证结果。
- 如果 GenOffice Canvas 耦合过重，可以只复用 Engine、Render 和 Ops，自行实现 Slide Canvas。
- 如果核心模型也无法稳定拆出，则退回其他候选或自研模型，不为迁就开源项目破坏产品边界。

## 2. 产品目标与范围

### 2.1 产品目标

- 用户可以从一句描述、上传材料或已有 PPTX 开始创建演示文稿。
- Agent 先规划内容和设计方向，再生成页面，不直接无计划堆叠页面。
- 页面生成过程中持续出现在 Slides Workbench，而不是等待黑盒任务全部结束。
- 人工编辑和 Agent 编辑作用于同一个 Presentation Model。
- 用户可以要求修改当前页、指定元素、某一组页面或整个 Deck。
- 每次 Agent 修改可观察、可审查、可整体撤销。
- 生成后自动执行确定性布局检查和视觉 Review。
- 最终交付为可继续编辑的 PPTX，而不是整页图片。
- Presentation Project、版本和导出 Artifact 可以随会话恢复。

### 2.2 首版非目标

- 不复刻完整 PowerPoint。
- 不建设独立于现有 Agent Kernel 的 Presentation Agent Runtime。
- 不支持无限 HTML/CSS 表现力与完全 PPTX 保真同时成立。
- 不在首版实现复杂动画时间轴、宏、OLE、完整母版编辑和实时多人协作。
- 不让 Agent 通过模拟鼠标点击操作编辑器。

## 3. 统一称呼

后续讨论和实现统一使用以下名称：

- **Slides Workbench**：右侧完整幻灯片工作区，包括页面导航、编辑画布、属性面板、Review、修改状态和导出。
- **Slide Canvas**：单页幻灯片的可视化编辑区域。
- **Presentation Model**：人工编辑器和 Agent 共同操作的结构化演示文稿模型。
- **Slides Ops**：对 Presentation Model 执行的结构化、可验证、可回滚编辑操作。
- **PPTX Adapter**：PPTX 导入、导出及往返 Patch 的边界层。
- **Slides Review**：确定性 Layout Linter、截图视觉检查和可回滚修复流程。
- **Presentation Project**：演示文稿的持久化项目，包括模型、主题、素材、来源、版本和导出记录。
- **Presentation Generation Pipeline**：从需求、Outline、Design Brief 到逐页生成和 Review 的领域编排。

## 4. 产品基准与核心判断

C2-E 以 Genspark AI Slides 的右侧工作区为主要产品基准，但不机械复制其界面或假设其内部实现。

目标体验是：

```text
Agent 生成或修改演示文稿
-> Slides Workbench 实时展示结果
-> 用户可直接选择和微调元素
-> Agent 修改过程可见、可审查
-> 系统自动检查布局和视觉问题
-> 用户可撤销、重做或恢复整次 Agent 修改
-> 导出高质量、可继续编辑的 PPTX
```

Genspark 的表面交互很轻，但其底层能力并不轻。要让 Agent 稳定完成局部修改、Review 和回滚，系统至少需要可靠的元素身份、布局模型、结构化操作、事务 History、截图能力和 PPTX 转换能力。

因此 C2-E 不采用“轻量 Slides Engine”。正确方向是：

> 能力重、界面轻；底层完整、前台渐进披露；Agent 优先，但不牺牲人工可编辑性。

## 5. 完整用户链路

### 5.1 从主题创建

```text
用户描述主题、受众和目标
-> Agent 判断是否需要补充页数、风格或材料
-> 创建 Presentation Project
-> 输出 Outline 与 Design Brief 供用户快速确认
-> 逐页生成并实时写入 Presentation Model
-> Workbench 展示页面进度和已完成页面
-> 自动 Review
-> 用户继续对话或手动微调
-> 保存版本并导出 PPTX
```

### 5.2 从材料创建

```text
用户上传 PDF / DOCX / XLSX / 图片 / 网页材料
-> 复用 C1 文件读取和来源定位
-> Agent 提取适合演示的事实、数据和图片
-> 建立 Source References
-> 规划 Storyline 和页面证据分布
-> 进入统一生成链路
```

原始材料始终是不可信输入，不能通过文档内容改变系统指令、工具权限和生成边界。

### 5.3 编辑已有 PPTX

```text
用户上传 PPTX
-> PPTX Adapter 解析为 Presentation Model
-> Workbench 展示可编辑页面
-> Agent 读取页面结构、语义角色和截图
-> 执行结构化 Slides Ops
-> 保留未修改 OOXML 与资源
-> 保存新版本或导出新 PPTX
```

### 5.4 继续迭代

用户可以针对：

- 当前选中元素。
- 当前页。
- 指定页码或页面范围。
- 全局主题和配色。
- 整个 Storyline。

发起后续修改。选择状态通过受控 Workbench Context 提供给 Agent，不能依赖“这个”“右边那个”等未解析指代直接盲改。

## 6. 为什么不是完整自研或完整嵌入

### 6.1 不从零开发全部能力

以下问题是 Slides Workbench 最昂贵、最容易被低估的部分：

- PPTX/OOXML 解析与保存。
- 字体解析、回退和文本排版。
- Shape、连接线、表格、图表及图片裁剪。
- 主题、布局和母版继承。
- PPTX 导入后的往返保真。
- 可验证编辑操作、事务和 Undo/Redo。

这些能力不构成 Harness 的核心产品差异，若已有合适开源实现，不应优先重复建设。

### 6.2 不直接嵌入 GenOffice 完整应用

GenOffice 是完整 Office 产品，不是专门提供给第三方的 Slides SDK。直接嵌入会引入：

- Office/Ribbon 风格界面，与 Genspark 式轻工作台不一致。
- Electron IPC、本地文件系统和 GenOffice 自身状态约定。
- 与现有 WorkbenchShell、Agent Panel 和 History 的职责冲突。
- 产品交互和视觉控制权不足。
- 后续上游同步与本地修改相互缠绕。

因此建议只复用有明确边界的能力，并由 Harness 自己实现产品层。

## 7. 总体架构

```text
现有 Agent Runtime
├── Context Compiler / Model Adapter / Tool Loop
└── Presentation Domain Tools
    ├── 读取来源与演示文稿上下文
    ├── 创建 Outline / Design Brief
    ├── 生成或重做 Slide
    ├── 执行 Slides Ops
    ├── 截图与 Review
    └── 保存版本与导出
                 │
                 ▼
Presentation Generation Pipeline
├── Intent & Constraint Resolution
├── Storyline / Outline Planner
├── Design Brief / Theme Planner
├── Asset Resolver
├── Slide Generator
└── Review Orchestrator
                 │
                 ▼
Presentation Runtime
├── Presentation Model
├── Slides Ops
├── Selection / Layout Engine
├── History / Transactions
├── Theme / Asset Manager
└── Rendering Engine
        │                  │
        ▼                  ▼
Slides Workbench        PPTX Adapter
├── Deck Navigator      ├── PPTX Import
├── Slide Canvas        ├── PPTX Export
├── Inspector           └── Round-trip Patch
├── Agent Activity
└── Review Panel
        │                  │
        └────────┬─────────┘
                 ▼
Presentation Project / C2-D Versions / Artifact Delivery
```

核心约束：

1. Slides Workbench 和 Agent Tools 不得分别维护两套编辑逻辑。
2. 人工操作与 Agent 操作统一进入 Slides Ops。
3. Slide Canvas 只渲染和提交意图，不直接成为业务状态真源。
4. PPTX 解析、保存与导出通过 Adapter 隔离，不向产品层泄漏 OOXML 细节。
5. Agent 的一次逻辑修改必须形成可整体撤销的事务。

## 8. Presentation Generation Pipeline

Presentation Generation Pipeline 是 C2-E 的领域编排，不是第二套通用 Agent Loop。模型负责语义和设计决策，Runtime 与领域服务负责确定性执行、状态、预算、并发和失败恢复。

### 8.1 Intent 与约束

在开始生成前形成最小 Presentation Brief：

- 主题与目标。
- 受众。
- 使用场景。
- 预计页数或篇幅。
- 内容密度。
- 视觉方向与品牌约束。
- 是否需要引用来源或使用上传材料。

只有缺失信息会实质改变结果时才询问用户；否则使用明确默认值继续执行。

### 8.2 Storyline 与 Outline

Outline 不是最终页面内容，而是 Deck 级叙事计划：

- 核心观点和叙事顺序。
- 每页目的、标题、关键内容和证据。
- 页面类型，例如封面、问题、数据、对比、流程、案例和结论。
- 页面之间的承接关系。
- 来源材料在页面中的分布。

Outline 必须持久化到 Presentation Project，后续增删或重排页面时同步更新。

### 8.3 Design Brief 与 Theme

在逐页生成前形成 Deck 级设计约束：

- 配色角色与对比规则。
- 字体与字号层级。
- 网格、边距和间距。
- 图片风格和图标风格。
- 页面布局族。
- 图表、表格和数据强调规则。
- 不允许出现的视觉模式。

Design Brief 转换为结构化 Theme Tokens，供 Slide Generator、Workbench 和 Review 共用，避免每页独立随机设计。

### 8.4 Asset Resolver

素材来源包括：

- 用户上传图片和文件内嵌图片。
- 已授权的网页图片搜索。
- 图片生成能力。
- 图标和 Logo 目录。
- 数据生成的图表和信息图。

每个 Asset 保存来源、版权或生成信息、尺寸、用途和引用页面。Agent 不得用占位图伪装为最终素材。

### 8.5 Slide Generator

Slide Generator 接收：

- 当前 Outline 项。
- Deck Design Brief 与 Theme。
- 相邻页面上下文。
- 可用 Layout、Blocks 和 Assets。
- Presentation Model Schema。

输出结构化 Slide 或一批 Slides Ops，而不是不可控的截图。页面可以并行准备，但写入 Presentation Project 时必须保持确定顺序、稳定身份和独立失败状态。

### 8.6 渐进生成与失败隔离

- 页面完成后立即进入 Workbench。
- 单页失败不丢弃已完成页面。
- 失败页面可以单独重试或降级为基础布局。
- 用户在生成过程中修改已完成页面时，后续写入不能覆盖该修改。
- Deck 级主题变更通过显式事务应用，不在后台静默改写全部页面。

## 9. Agent Runtime 集成

### 9.1 领域工具表面

首版建议提供小而完整的领域工具，而不是把数十个底层字段直接暴露给模型：

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

底层 `setText`、`setTransform`、`alignElements` 等原子操作属于 Slides Ops，可通过 `apply_slide_operations` 的严格 Schema 批量提交。

### 9.2 上下文控制

不把整个 Deck 的完整 JSON 和所有截图默认注入每一轮模型上下文。模型按需获得：

- Presentation 摘要与 Outline。
- 当前页或相关页面的元素清单。
- 当前选择和用户可见上下文。
- 必要的截图。
- Theme Tokens。
- 相关来源片段。

完整页面结构通过 `read_slide` 按需读取，截图通过 `render_slide` 获取。

### 9.3 选择与指代

Slides Workbench 将以下只读事实提供给 Runtime：

- 当前 Presentation ID 和 revision。
- 当前页面。
- 当前选中的元素 ID、类型和语义角色。
- 用户正在编辑的文本或属性状态。

Agent 必须把自然语言指代解析为稳定 ID 后再执行操作。页面排序改变后不能继续使用旧索引盲改。

### 9.4 修改可观察性

Agent 工具执行过程中，Workbench 展示：

- 当前处理的页面。
- 新增、修改或删除的元素。
- 操作批次状态。
- Review 问题与修复状态。
- 是否可以撤销或恢复到运行前版本。

工具输出和 UI 状态都来自同一 canonical 事务结果，前端不根据流式文案推测修改事实。

## 10. Presentation Project、版本与 Artifact

Presentation Project 建议持久化：

- Presentation Model 快照或内容引用。
- Outline。
- Design Brief 与 Theme Tokens。
- Assets 和来源引用。
- 原始 PPTX 引用与 OOXML Anchor 信息。
- 当前 revision。
- Review 结果。
- 版本与导出记录。

C2-E 复用 C2-D 的线性不可变版本能力：

```text
Project 当前版本
-> Agent 或用户完成一批修改
-> 创建新版本
-> 旧版本保持可恢复
-> 从指定版本导出 PPTX Artifact
```

History 与 Version 不是同一概念：

- History 服务于当前编辑会话内的 Undo/Redo。
- Version 是持久化、可恢复、可交付的项目状态。

PPTX 导出结果进入现有 File/Artifact 交付链路，关联 Presentation Project、Version、Session、Run 和导出任务；不把临时本地路径作为用户可见身份。

## 11. Presentation Model

运行时由 Presentation Model 作为人工编辑器与 Agent 的共同操作对象。

```ts
type Presentation = {
  id: string;
  revision: number;
  size: { width: number; height: number };
  theme: Theme;
  slides: Slide[];
  assets: Asset[];
};

type Slide = {
  id: string;
  background: Fill;
  elements: SlideElement[];
  notes?: string;
  review?: ReviewResult;
};

type SlideElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | LineElement
  | TableElement
  | ChartElement
  | GroupElement;
```

每个元素至少需要：

- 稳定且持久的元素 ID。
- 位置、尺寸、旋转和层级。
- 锁定、分组和选择约束。
- 内容、样式与主题引用。
- `title`、`body`、`hero-image` 等语义角色。
- `user | agent | imported` 等来源信息。
- 最近修改 revision 和修改来源。
- 导入 PPTX 时对应的 OOXML Anchor 或原始标识。

语义角色是 Agent 可靠编辑的关键。Agent 应能操作“第二页标题”或“当前页主图”，而不是只操作匿名坐标框。

## 12. Slides Ops 与事务

人工编辑和 Agent 编辑统一转成 Operation：

```ts
type SlideOperation =
  | AddElement
  | UpdateElement
  | DeleteElement
  | MoveElement
  | ResizeElement
  | AlignElements
  | DistributeElements
  | GroupElements
  | ReorderElement
  | AddSlide
  | MoveSlide
  | SetTheme;
```

统一执行入口建议为：

```ts
applyOperations({
  presentationId,
  baseRevision,
  transactionId,
  source: 'user' | 'agent' | 'review',
  operations,
});
```

一次执行必须：

1. 校验参数、目标和权限。
2. 检查 revision 冲突。
3. 原子执行整批操作。
4. 任一步失败时恢复事务前状态。
5. 记录结构化 before/after journal。
6. 形成一个 Undo 节点。
7. 返回受影响的页面、元素和新 revision。

这样 Agent 一次调整多个元素时，用户可以一次撤销整次修改，而不是逐元素撤销。

## 13. Slides Workbench 与 Slide Canvas

Slides Workbench 是完整 Agentic Presentation Generation 的编辑与展示界面，不等于 C2-E 全部能力。

首选实现方向：

- React 19。
- Konva / react-konva 负责场景图和选择交互。
- DOM Overlay 负责富文本输入和复杂文本编辑。
- Presentation Model 驱动渲染。

Konva 负责：

- 图形、图片、表格、图表渲染。
- 选择框、多选、拖拽、缩放和旋转。
- 吸附线、图层、组合和裁剪交互。

DOM Overlay 负责：

- 文本原位编辑。
- 光标、选区和输入法。
- 富文本与复杂字体编辑。

标准元素必须进入 Presentation Model。可以在后续为特殊内容提供 HTML/React 扩展元素，但不能让任意 React 源码成为首版唯一真源，否则 PPTX 导入、结构化修改和可靠导出会失控。

## 14. PPTX 策略

C2-E 采用混合模式：

```text
运行时编辑真源：Presentation Model
导入保真层：原始 PPTX + OOXML Anchors
用户交付格式：PPTX
```

导入现有 PPTX 时：

- 解析为 Presentation Model。
- 元素保留原始 Part、稳定标识和必要继承信息。
- 未修改内容尽可能原样保留。
- 修改过的元素才重新生成或 Patch。

新建演示文稿时：

- 直接从 Presentation Model 生成 PPTX。
- 导出结果必须保持文字、图形、图片、表格和图表的可编辑性。

这一边界兼顾 Agent 易操作、Canvas 易渲染、导入往返保真和新生成文件的可编辑性。

## 15. Slides Review

Review 是 Slides Workbench 的内核能力，不是一次普通 Prompt。

```text
Presentation Model
      │
      ├── Layout Linter
      │   ├── 越界
      │   ├── 非预期重叠
      │   ├── 文本溢出
      │   ├── 间距和对齐异常
      │   └── 对比度问题
      │
      └── Screenshot Reviewer
          ├── 截取 Slide 当前渲染
          ├── 视觉模型结合元素清单 Review
          └── 生成受限修复 Operations
```

修复流程：

```text
Review 前快照
-> Agent 通过受限 Slides Ops 修复
-> 再次执行 Layout Linter
-> 问题减少：保留并展示修改
-> 问题增加或执行失败：自动回滚
```

视觉 Review 不应获得任意代码或文件写入能力。首版只允许读取页面结构、截图和执行布局相关 Slides Ops。

## 16. 与现有 Workbench 的关系

复用现有 WorkbenchShell：

- 左侧 Agent 对话。
- 顶部导航和通用布局。
- 文件与 Artifact 状态。
- 任务执行状态。
- 权限、会话和恢复入口。

Slides Workbench 独立维护：

- Presentation Model。
- Canvas 和 Selection State。
- History 与事务。
- Slides Assets。
- Review 状态。
- PPTX 导入和导出。

建议保留 Workbench 插件边界：

```ts
interface WorkbenchPlugin {
  type: 'slides';
  open(resource: Resource): Promise<void>;
  render(): React.ReactNode;
  getContext(): WorkbenchContext;
  getAgentTools(): AgentTool[];
  save(): Promise<void>;
  export(format: string): Promise<Artifact>;
}
```

## 17. 开源候选排序

排序以“接近 Genspark Slides Workbench、可编辑 PPTX、Agent 可操作、可嵌入和许可证”为主要标准。

### 17.1 第一候选：GenOffice

项目：<https://github.com/genspark-ai/genoffice>

适合复用：

- `pptx-engine`：PPTX 解析、元素模型和保存。
- `pptx-render`：高保真渲染模型。
- `pptx-ops`：可验证、可回滚的编辑操作。
- Slides Review、事务和操作日志的实现思路。

优势：

- React、TypeScript、Konva，与当前前端方向接近。
- 支持原生 PPTX 打开、编辑和保存。
- 人工操作和 Agent 操作已经具有共享操作层。
- 已实现确定性布局检查、截图视觉 Review 和失败回滚。
- 主体采用 Apache-2.0；`ee/` 目录需单独排除和审查。

风险：

- 是完整 Electron Office 应用，不是嵌入式 SDK。
- 部分包标记为 private，可能需要源码级 fork 或 vendor。
- Canvas、字体、文件和 History 可能存在隐式应用耦合。
- 项目公开时间较短，上游接口稳定性仍需观察。

### 17.2 第二候选：Presenton

项目：<https://github.com/presenton/presenton>

优势：

- React + Konva + 结构化 JSON 编辑器。
- 已有 Agent Tools、模板、主题和生成链路。
- Apache-2.0。
- 产品方向接近 AI Slides，而非完整 Office。

不足：

- PPTX 往返和原生编辑能力弱于 GenOffice。
- Next.js/FastAPI 产品代码耦合较多。
- Export Runtime 需要单独核实源码、部署和长期维护方式。

### 17.3 第三候选：PPTist

项目：<https://github.com/pipipi-pikachu/PPTist>

优势：

- 人工编辑功能成熟。
- Presentation Model、缩略图、Canvas、图层、图表、表格和动画完整。
- PPTX 导入导出能力经过较多社区使用。

不足：

- Vue 技术栈与现有 React 项目不同。
- AGPL-3.0；闭源商业使用需要独立商业授权。
- 商业授权不包含 API、SDK 或技术支持。

主要定位是编辑交互和功能设计参考；只有在接受商业授权与技术栈隔离时才考虑作为直接底座。

### 17.4 第四候选：pptx-viewer

项目：<https://github.com/ChristopherVR/pptx-viewer>

优势：

- React 组件和框架无关 Core。
- 声称支持 PPTX 解析、编辑、保存、场景图和 Agent/MCP Tools。
- Apache-2.0。

不足：

- 项目很新，社区验证有限。
- 功能声明范围极大，需要真实 PPTX、构建、测试和 round-trip 验真。

主要定位是 PPTX 兼容层备选，而不是当前首选 Workbench UI。

### 17.5 第五候选：open-slide

项目：<https://github.com/1weiho/open-slide>

open-slide 是 Agent-first 的 React Slides-as-Code 框架：每页是任意 React 组件，运行时负责固定画布、缩放、导航、热更新和演讲模式。

值得借鉴：

- Agent 直接编辑页面源码。
- Inspector 将文字、样式和图片修改通过 Babel AST 写回 JSX。
- 元素级 Comment 写入源码，Agent 执行 `apply-comments` 后清理标记。
- Design Tokens、Assets、演讲者模式、备注、动画和 Morph。
- MIT 协议，React/Vite 技术栈接入友好。

不适合作为首版主底座：

- 没有结构化 Presentation Model。
- Inspector 不是完整拖拽、缩放、旋转、图层和 Shape 编辑器。
- 不能导入并往返编辑现有 PPTX。
- 官方可编辑 PPTX 仍为 Coming Soon；当前官方 PPTX 是整页图片。
- 第三方 `slide-to-pptx` 虽可将 DOM 测量为可编辑形状和文本，但项目很新，不保留母版/主题，也不解决 PPTX 导入和往返编辑。

open-slide 作为主 Workbench 排名靠后，但其 Agent-native Inspector、Comment 和源码反馈闭环是重要产品参考，后续可以作为 Creative Slide Mode 的候选。

### 17.6 不作为核心候选

- ONLYOFFICE / Collabora：适合嵌入完整 Office，部署、授权和深度定制成本高，不符合 Genspark 式轻工作台。
- Slidev / DeckDeckGo：更偏 Slides-as-Code 或已归档，不提供目标级 WYSIWYG 和 PPTX 能力。
- PptxGenJS：适合生成 PPTX，不是 Workbench 或 Presentation Model。
- dom-to-pptx / pptx-automizer：可作为转换或模板辅助组件，不能承担核心编辑器。

## 18. GenOffice 复用策略

推荐边界：

| 模块 | 策略 |
| --- | --- |
| Workbench 整体布局和交互 | Harness 自研 |
| Slide Canvas UI | 先验证 GenOffice 可拆分性，必要时自研 |
| Presentation Model | 复用并增加 Harness 语义字段 |
| PPTX 解析与保存 | 优先复用 `pptx-engine` |
| 渲染能力 | 优先复用 `pptx-render` |
| 编辑操作与事务 | 优先复用 `pptx-ops` |
| Agent Tools | 基于统一 Slides Ops 由 Harness 封装 |
| Review | 借鉴 GenOffice，在 Harness 边界内实现 |
| 生成、模板和设计策略 | Harness 开发，参考 Presenton/open-slide |

建议建立防腐层，Workbench 和 Agent 不直接依赖 GenOffice 内部类型：

```ts
interface SlidesEngine {
  open(input: ArrayBuffer): Promise<PresentationDocument>;
  apply(transaction: SlideTransaction): Promise<TransactionResult>;
  render(slideId: string): RenderTree;
  save(): Promise<ArrayBuffer>;
}
```

建议单独维护上游 fork：

- 尽量保持上游核心代码不变。
- Harness 改动优先留在 Adapter、Model Extension 和自有 UI。
- 所有必要的上游修改形成小而清晰的 Patch。
- 定期记录 fork 差异、同步成本和上游兼容情况。
- 不复制散落源码到业务目录，避免失去来源和升级路径。

## 19. 方案的辩证分析

### 19.1 合理性

- 将投入集中在 Harness 的产品差异，而不是重复实现 OOXML。
- 保留对 UI、Agent Runtime、Review 和用户体验的控制权。
- 通过共享 Slides Ops 让人工编辑和 Agent 编辑保持一致。
- 可在较短路径内获得原生 PPTX 和完整编辑能力。

### 19.2 主要矛盾

#### 开源复用与长期控制

复用可以降低首期成本，但深度 fork 会增加长期同步和维护成本。只有当核心能力可以通过 Adapter 隔离时，收益才持续成立。

#### 设计自由度与 PPTX 保真

```text
设计自由度越高
-> 越难稳定映射为可编辑 PPTX

PPTX 保真要求越高
-> 内部模型越受 PowerPoint 能力约束
```

C2-E 首版优先保证常用设计能力和可编辑 PPTX，不追求无限 HTML/CSS 表现力。特殊 Creative Mode 可以后续独立评估，不与首版标准模型混合。

#### 快速采用与架构污染

直接改造完整 GenOffice App 可以最快看到结果，但会把 Electron、文件系统、状态和 UI 约定带入现有系统。分层复用前期略慢，但更符合长期架构。

### 19.3 可行性判断

| 部分 | 当前判断 |
| --- | --- |
| `pptx-engine` 复用 | 高可行性，优先验证 |
| `pptx-render` 复用 | 中高可行性 |
| `pptx-ops` 复用 | 中高可行性，适合 Agent Tool 底层 |
| Presentation Model 扩展 | 中高可行性 |
| Slide Canvas 直接复用 | 中等，需要验证应用耦合 |
| 完整 Slides App 嵌入 | 低，不建议 |
| 完整自研 PPTX 引擎 | 技术可行但投入不合理，作为最终退路 |

综合判断：方案合理性较高、可行性中高，但必须以“有限 fork、强 Adapter、可替换 Engine”为前提。

## 20. 隔离 PoC

正式选型前先建立最小隔离 PoC，不在现有产品代码中直接展开大规模集成。

### 20.1 验证范围

1. 在浏览器环境打开一批真实 PPTX。
2. 渲染文字、图片、Shape、线条、表格和基础图表。
3. 修改文字、位置、尺寸和样式。
4. 通过 `pptx-ops` 执行多元素原子修改。
5. 验证 Undo/Redo 和事务失败回滚。
6. 保存并重新用 PowerPoint 打开，不能出现修复提示。
7. 把独立 Slide Canvas 放入当前 WorkbenchShell。
8. 去除或适配 Electron IPC、文件系统和 GenOffice Agent Panel。
9. 记录修改的上游文件数量、Patch 规模和隐式依赖。
10. 验证截图、Layout Linter 和最小 Review 修复闭环。

### 20.2 测试材料

测试集至少覆盖：

- 新建的简单演示文稿。
- 用户真实业务 PPTX。
- 中英文和混合字体。
- 图片裁剪与透明度。
- Shape、连接线和分组。
- 表格和基础图表。
- 主题、布局和母版继承。
- 20 至 50 页的中型 Deck。
- 缺失字体、异常媒体和部分损坏文件。

### 20.3 决策结果

#### A：核心和 Canvas 均可独立使用

采用：

```text
GenOffice Engine + Harness Slides Workbench UI
```

#### B：Engine 可用但 Canvas 耦合严重

采用：

```text
GenOffice Engine / Render / Ops
+ Harness 自研 Slide Canvas
```

#### C：核心模型高度耦合或 PPTX 保真不达标

停止深度接入，保留设计参考，转向 Presenton、PPTist 商业方案、pptx-viewer 或自研模型。

PoC 的退出条件不是“功能还不够多”，而是：

- 必须修改大量 GenOffice 核心代码才能运行。
- Adapter 无法形成稳定边界。
- 保存结果频繁触发 PowerPoint 修复。
- 常用元素无法保持可编辑和基本视觉一致。
- 上游同步成本已经明显高于自行维护核心模型。

## 21. 分阶段交付

### 21.1 C2-E0 技术 PoC

- 验证 GenOffice Engine、Render、Ops 和 Canvas 的可拆分性。
- 验证 PPTX round-trip、浏览器运行和 Adapter 边界。
- 不接入正式用户链路，不产生伪完成产品入口。

### 21.2 C2-E1 Workbench 与结构化编辑闭环

- Presentation Project。
- Slides Workbench 基础 UI。
- Presentation Model、Slides Ops 和 History。
- PPTX 导入、编辑、保存和 Artifact 导出。
- 人工编辑与最小 Agent 局部修改共用操作层。

### 21.3 C2-E2 完整生成闭环

- Presentation Brief、Outline 和 Design Brief。
- 素材解析与来源引用。
- 逐页生成、进度和失败隔离。
- Agent 全局与局部修改。
- 版本保存和可编辑 PPTX 交付。

### 21.4 C2-E3 Review 与质量增强

- Layout Linter。
- 截图视觉 Review。
- 自动修复与质量回退保护。
- 模板、Blocks、品牌主题和更完整图表能力。

## 22. 第一阶段功能边界

首版目标是“真正可用的轻量 PowerPoint 编辑器”，不是完整复刻 PowerPoint。

必须支持：

- 页面增删、复制和排序。
- 文本、图片、Shape、线条、表格和基础图表。
- 移动、缩放、旋转和多选。
- 对齐、分布、分组、锁定和图层顺序。
- 文本原位编辑和图片裁剪。
- 主题、字体和基础配色。
- Undo/Redo。
- Agent 修改高亮、Diff 和整次回滚。
- Layout Review。
- 高质量可编辑 PPTX 导出。

后置能力：

- 复杂动画时间轴。
- SmartArt 深度编辑。
- 完整母版编辑器。
- 全部 Office 图表类型。
- 宏、OLE 和复杂嵌入对象。
- 实时多人协作。
- 完整 Office Ribbon。

首版功能可以克制，但 Presentation Model、Slides Ops、History 和 PPTX Adapter 不能采用临时设计。这四层一旦失去稳定边界，后续接入 Agent、Review 和版本能力时将产生结构性重构。

## 23. 建议代码组织

```text
packages/
  slides-model/       Presentation Model 与领域类型
  slides-ops/         统一编辑操作、验证和事务
  slides-renderer/    RenderTree 与 Canvas 节点渲染
  slides-pptx/        导入、导出和 OOXML Patch Adapter
  slides-review/      Layout Linter 与视觉 Review
  slides-agent-tools/ Agent Tool Schema 与领域上下文
  slides-assets/      图片、字体和缩略图
  presentation-gen/   Outline、Design Brief、生成与 Review 编排

apps/web/src/features/
  slides-workbench/   Harness 产品 UI 与 Workbench 插件
```

实际目录是否一次拆成以上包，应根据 PoC 结果和当前 monorepo 约定决定；边界应先成立，物理包可以分阶段拆分。

## 24. 当前结论

1. C2-E 是完整的 Agent 演示文稿生成、编辑、Review、版本和 PPTX 交付能力，Slides Workbench 只是其中的核心交互子系统。
2. 通用 Agent Runtime 继续复用现有 Kernel；C2-E 增加领域工具和生成编排，不另造 Runtime。
3. Slides Workbench 应由 Harness 自己定义和开发产品层。
4. 不应从零重写 PPTX Engine，也不应直接嵌入 GenOffice 完整应用。
5. GenOffice 是当前最值得验证的底层候选，但采用必须经过隔离 PoC。
6. Presenton、PPTist、pptx-viewer 保留为对照和替代候选。
7. open-slide 不作为首版主底座，但其 Agent-native Inspector、Comment 和 Design Token 机制应进入产品设计参考。
8. C2-E 的目标不是“功能很多的 Office 克隆”，而是“Agent 能规划和生成、用户能协同编辑、系统能 Review、最终 PPTX 可继续编辑”的完整产品闭环。
