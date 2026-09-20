# C2-E Agentic Presentation Generation

## 最终方案

> 文档状态：首版实施方案
>
> 最后更新：2026-09-18
>
> 首版目标是验证“Agent 生成演示文稿，用户在 Workbench 中确认、生成、编辑并交付”的完整闭环，不以构建完整 PowerPoint 替代品为目标。

## 1. 最终决策

C2-E 首版采用 `presentation-ai` 作为 Slides Workbench 的前端开源底座，并在其源码基础上二次开发。

这里的“采用”是源码级复用，而不是参考交互后重新写一套相似页面：

- 直接复用 `presentation-ai` 的大纲/主题确认前端代码。
- 直接复用其 Slides Workbench 前端代码，包括画布、缩略图、编辑器、主题、生成过程和相关交互。
- 参考其后端接口和事件协议，在 Harness 后端重新实现兼容服务。
- 不使用 `presentation-ai` 内置 Agent，不依赖其后端 Agent、数据库或运行时。
- 继续使用当前项目的 Agent Runtime，通过新增工具、接口、事件协议和适配层扩展能力，不修改 Runtime 核心逻辑。

```text
用户
 │
 ▼
Harness Agent Runtime ───── 左侧对话与流式反馈
 │ Presentation Tools / Events
 ▼
Harness Presentation Backend
 │ Presentation Model / Slides Ops / Revision
 │ presentation-ai compatible API
 ▼
presentation-ai 前端（源码复用与二开）
    大纲主题确认 · Slides Workbench · 生成过程 · 可视化编辑
```

## 2. 产品形态

Slides 不是独立应用，而是 Harness Agent Workbench 中的一类任务形态：

- 左侧：会话和任务导航。
- 中间：Agent 对话、过程反馈和结果说明。
- 右侧：可调整宽度的 Slides Workbench。

右侧 Workbench 支持拖动调整宽度和收起。页面整体继续使用 Harness 的会话、权限、任务和交付体系。

### 2.1 两个产品状态

首版只保留两个用户可感知的页面状态：

```text
[1 结构与风格确认] ───────────────> [2 Slides Workbench]
```

不再把“生成中”做成独立页面或独立路由。生成中属于 Slides Workbench 的内部状态：Workbench 在生成开始时立即打开，用户看到生成进度和已完成页面，完成后自然进入编辑状态。

### 2.2 结构与风格确认

右侧复用 `presentation-ai` 的确认相关前端能力，并接入 Harness 生成的结构化数据：

- Brief 摘要。
- 页面大纲、标题和页面意图。
- 推荐主题及主题预览。
- 补充说明输入框。
- 页面新增、删除、排序和结构调整入口。
- 「确认并生成」按钮。

这个状态不是聊天弹窗。大纲和主题是 Agent 产出的结构化演示资产，应在 Workbench 中审阅和确认。

### 2.3 Slides Workbench

用户确认后直接进入复用的 `presentation-ai` Workbench：

- 生成过程中展示生成进度。
- 逐步出现已完成页面和缩略图。
- 单页失败时显示错误和重试入口。
- 生成完成后进入同一页面的可视化编辑状态。
- 提供当前页编辑、主题、布局、预览、演示和导出能力。

生成和编辑是同一个 Workbench 的两个内部阶段，不需要切换应用或页面。

## 3. 关键交互流程

```text
用户输入主题、目标、受众或上传材料
        ↓
Harness Agent Runtime 理解任务
        ↓
调用 Presentation 规划工具
        ↓
生成 Brief、Outline、Design Brief
        ↓
右侧打开结构与风格确认
        ↓ 用户确认
发送结构化用户事件到现有 Agent Runtime
        ↓
右侧立即进入 Slides Workbench
        ↓
页面级生成、检查、重试和编辑
```

点击「确认并生成」同时完成两件事：

1. 将用户确认内容写入 Harness Presentation Model。
2. 向现有 Runtime 追加一条用户事件，例如：

```text
确认大纲和主题，开始生成演示文稿。
```

补充说明、主题选择和大纲变更作为结构化参数提交，不能只依赖自然语言文本。

左侧对话继续展示 Runtime 流式反馈；右侧 Workbench 消费同一 Run 的结构化状态。生成完成后，用户无需离开 Workbench 即可编辑和导出。

## 4. 前端复用边界

### 4.1 必须直接复用

正式实现不得基于当前轻量原型重新开发一套编辑器。以下能力以 `presentation-ai` 源码抽取出的 UI-only 模块为基础，当前抽取目录为 `apps/web/vendor/presentation-ai-ui`：

- 大纲和主题确认页面。
- Workbench 页面布局。
- 页面缩略图导航。
- Slide 画布、缩放和选择。
- 文本、图片、形状、图表等基础编辑。
- 主题和布局入口。
- 生成过程中的页面状态展示。
- 预览、演示和导出相关流程。
- 编辑器内部选择、撤销、草稿和交互状态。

允许的二开包括：接入 Harness 页面壳层、替换 API Client 和事件订阅、接入权限/会话/路由/错误处理，以及增加 Runtime 反馈、版本和产品入口。

当前 `/agent/preview` 中的 Harness 页面壳仍用于验证产品流程；右侧适配入口已指向 `presentation-ai-ui` 的数据模型和事件边界。下一步是逐个替换其中的 outline、theme、renderer 和 editor 依赖，不得再创建与上游交互相似但独立实现的编辑器。

### 4.2 不复用

以下内容不作为生产依赖：

- `presentation-ai` 内置 Agent。
- 其后端 Agent 编排。
- 其数据库和业务持久化模型。
- 其与模型供应商绑定的运行时逻辑。
- 任何绕过 Harness Runtime 直接写入生产数据的路径。

### 4.3 源码审计结论与复用分层

对当前 `presentation-ai` 源码的审计表明，复用价值主要集中在编辑器和 Workbench，而不是其应用外壳或后端实现。

| 模块 | 处理方式 | 说明 |
| --- | --- | --- |
| Slide 画布、缩略图、缩放、拖拽 | 直接复用并适配 | 是 Workbench 的核心交互 |
| Plate 编辑器、文本/图片/图表/信息图组件 | 直接复用并适配 | 保留其结构化 `PlateSlide` 模型 |
| 主题、布局、预览、演示、导出前端流程 | 直接复用并适配 | 替换数据加载、保存和权限入口 |
| 大纲/主题确认 UI | 直接复用并适配 | 保留可编辑大纲、主题预览和确认流程 |
| 生成过程 UI 和单页编辑 UI | 保留结构并替换数据源 | 需要接入 Harness 事件和生成接口 |
| `presentation-ai` 页面壳、Next.js 路由、Server Actions | 不直接复用 | Harness 当前 Web 是 Vite，需要自己的页面适配 |
| `presentation-ai` Zustand 状态 | 分层复用 | 仅承载 Workbench 本地状态，不替代 Runtime 状态 |
| 内置 Agent、数据库、Prisma、鉴权、模型供应商逻辑 | 不复用 | 仅作为业务和协议实现参考 |

当前源码并非一个可无缝嵌入的独立 React 组件包：它包含 Next.js 路由、Server Actions、React Query 加载、鉴权和后端 action 的直接引用。因此正式集成不是迁移整套 Next.js 应用，而是从源码中抽取 UI 模块，删除应用架构依赖，再通过 Harness 适配接口接入。

建议抽取为独立的 Workbench UI 模块：

```text
packages/presentation-workbench/
├── editor/       # Plate 编辑器和自定义元素
├── renderer/     # Slide 渲染、缩略图、静态预览
├── outline/      # 大纲和主题确认 UI
├── theme/        # 主题和布局 UI
├── state/        # Workbench 本地状态
├── parser/       # XML -> PlateSlide
├── protocol/     # 前端兼容协议类型
└── adapters/     # Harness UI 数据、事件和命令适配
```

## 5. 前端兼容协议与 Adapter

### 5.1 `presentation-ai` 使用的协议形态

源码审计发现，`presentation-ai` 的生成前端主要依赖 AI SDK UI Message Stream，而不是普通 JSON 或原始文本接口：

- 大纲生成通过 `useChat()` 消费 UI Message Stream。
- 消息请求包含 `messages: UIMessage[]`，最新用户消息的 metadata 携带页数、语言、主题和模型参数。
- 流中同时包含 assistant 文本、tool call、tool result、完成和错误状态。
- 前端从约定文本中解析 `<TITLE>`、Markdown 一级标题和可选的 `<THEME>`。
- 完整 Slides 生成通过 `useCompletion()` 消费纯文本 XML 流，并由 `SlideParser` 增量解析 `<SECTION>`。
- 单页生成同样返回单个 `<SECTION>` XML，编辑器在完成后替换目标 Slide。

因此“协议对齐”不仅是复用 URL，还必须兼容请求字段、流式事件时序、文本标记、XML 中间表示、完成/错误语义和重连行为。

### 5.2 Harness 与 `presentation-ai` 的协议差异

Harness 当前 Agent Protocol 使用自己的 SSE 事件模型，例如：

```text
message.delta
tool.started
tool.completed
stream.completed
stream.failed
```

两套协议不应在 Runtime 核心层强行统一。建议由 Presentation Adapter 对外提供 `presentation-ai` 前端所需的兼容接口，内部消费 Harness 的 canonical 事件：

```text
Harness message.delta   -> UI Message text part
Harness tool.started    -> UI Message tool input/call part
Harness tool.completed  -> UI Message tool output/result part
Harness stream.completed -> UI Message finish
Harness stream.failed   -> UI Message error
```

整体链路为：

```text
presentation-ai 前端
        ↓ 兼容请求/兼容流
Presentation Adapter / BFF
        ↓ canonical command/event
Harness Presentation Service
        ↓
当前 Agent Runtime
```

Adapter 只负责协议转换、鉴权上下文、幂等键、断线恢复和错误映射，不承载新的 Agent 编排逻辑。

### 5.3 最小兼容接口

PoC 至少验证以下接口，不要求沿用 `presentation-ai` 后端实现：

```text
POST  /api/presentation/outline
POST  /api/presentation/generate
POST  /api/presentation/generate-slide
GET   /api/presentations/:id
PATCH /api/presentations/:id
POST  /api/presentations/:id/events
```

接口返回和请求应定义独立 schema，并增加协议版本。对外可以兼容 `presentation-ai` 的字段和流格式；进入 Harness 后立即转换为内部 `Presentation Model`、`Slides Ops` 和 Runtime 事件，避免开源项目字段扩散到业务层。

### 5.4 数据与状态边界

`presentation-ai` 的 `PlateSlide` 是编辑器和生成解析的结构化数据，不应被 XML 或前端 Zustand 状态替代：

```text
Runtime State       = Run、工具、事件、取消、重试
Presentation Model  = Brief、Outline、Theme、Slides、Revision
Workbench State     = 当前页、缩放、面板、选区、编辑器焦点
```

XML 只作为生成协议的中间表示；后端持久化解析后的结构化 Slides，并以 Revision 记录用户和 Agent 的修改。

## 6. 后端与协议方案

### 6.1 兼容而非依赖

前端需要的接口和事件协议以 `presentation-ai` 为参考重新实现。目标是让复用的前端连接到 Harness 服务，而不是让 Harness 依赖其后端实现。

PoC 阶段必须梳理：

- 初始化项目和加载 Deck 的接口。
- Outline、Theme、Slide、Element 数据结构。
- 页面生成进度、完成、失败和重试事件。
- 编辑操作和批量操作协议。
- 撤销、保存、版本和导出接口。
- 鉴权、错误和断线恢复行为。

所有外部协议进入 Harness 后都通过 Adapter 转换为内部结构，避免业务层扩散开源项目的数据结构。

### 6.2 Harness 内部真源

```text
Presentation Project
  ├─ Brief
  ├─ Outline
  ├─ Theme
  ├─ Slides
  ├─ Slides Ops
  ├─ Revisions
  └─ Export Jobs
```

`Presentation Model` 是 Agent、Workbench Adapter、Review 和 Export Adapter 共享的结构化真源。前端状态不能成为业务真源，也不能根据模型流式文案推断最终修改结果。

## 7. Agent Runtime 集成原则

### 7.1 不修改 Runtime 核心

继续使用当前 Runtime 的会话和 Run 管理、Model Adapter、Tool Registry、流式事件、取消、超时、重试、权限、审批、事件投影、任务恢复和交付链路。

不新增 Presentation 专用 Runtime，不复制 Agent 调度逻辑，也不让 `presentation-ai` Agent 插入当前 Runtime。

### 7.2 允许的扩展点

- 新增 Presentation Tool。
- 新增工具输入输出 schema。
- 新增 Presentation 事件类型。
- 新增 Workbench Adapter。
- 新增 Presentation API 路由。
- 新增 Presentation Model、Slides Ops、Revision 服务。
- 新增 Artifact 和导出适配。

首版工具集合：

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

工具必须使用稳定的 Project、Slide、Element 和 Revision ID，不能使用页面索引作为持久引用，也不能让模型直接修改任意 JSON、OOXML、文件路径或 React 源码。

### 7.3 左右两侧一致性

- 左侧面向用户解释过程、请求确认、报告异常和给出结果。
- 右侧展示具体页面、生成进度和编辑状态。
- 工具成功或失败以 canonical 事务结果为准。
- 页面生成失败只影响失败页面，不回滚成功页面。
- Runtime 取消后，Workbench 保留已生成内容并展示可恢复状态。

## 8. Presentation Model 与 Slides Ops

首版模型支持文本、图片、形状、基础图表和表格、页面尺寸、主题 Token、受限布局、页面状态、元素稳定 ID、来源信息和版本。

首版不承诺任意 PPTX 导入、高保真 round-trip、完整自由画布、复杂母版、SmartArt、动画时间轴、宏、OLE 或所有 Office 富文本能力。

所有用户或 Agent 修改都转换为可记录、可预览、可撤销的操作：

```text
insert_slide / delete_slide / move_slide
update_text / replace_image / set_style
resize_element / move_element / apply_layout / apply_theme
```

较大修改先生成预览 Diff，用户接受后提交。手工修改过的页面默认不被后台生成静默覆盖。

## 9. 生成、质量与交付

### 9.1 页面级状态

```text
queued -> generating -> rendered -> reviewed -> ready
                         └-> failed -> retrying
```

这些状态在 Workbench 内展示，不拆成额外产品页面。

### 9.2 首版质量检查

首版先做确定性检查：元素越界、文本溢出、非预期重叠、对齐和间距异常、对比度不足、空页面、缺失布局槽位、图片/字体/素材不可用。视觉修复不默认自动提交，系统先解释问题并提供建议。

### 9.3 导出

导出通过独立 Export Adapter 完成，和生成逻辑、Workbench 前端、Agent Tool 解耦。导出结果进入现有 File/Artifact 交付链路，并关联 Project、Version、Session、Run 和 Export Job。

## 10. 首版范围

### 必须完成

- 从需求生成 Brief、Outline 和 Theme 建议。
- 在右侧 Workbench 中确认大纲和主题。
- 点击确认后进入同一个 Slides Workbench。
- Workbench 内展示页面级生成进度。
- 复用 `presentation-ai` 前端完成基础编辑。
- 通过 Harness Runtime 进行 Agent 生成和局部修改。
- 保存 Revision，支持撤销和恢复。
- 导出可打开、可继续编辑的 PPTX。
- 左侧对话和右侧 Workbench 状态一致。

### 暂不完成

- 完整 PowerPoint 替代能力。
- 任意 PPTX 高保真导入和往返编辑。
- 复杂自由画布和高级动画。
- `presentation-ai` 内置 Agent 的生产接入。
- 为 C2-E 另建一套 Agent Runtime。

## 11. 实施阶段

### Phase 1：开源底座接入 PoC

- 拉取并固定 `presentation-ai` 版本（PoC 当前审计基线为仓库提交 `43fe74a`；其许可证为 MIT，正式引入仍需保留版权和许可证声明）。
- 运行其原始前端和最小后端依赖。
- 建立源码复用清单，标记直接复用、保留结构改造和明确不复用的文件边界。
- 梳理 `UIMessage`、文本 XML、`PlateSlide`、保存和错误协议。
- 在 Harness Web 中加载真实 Workbench，先用静态 `PlateSlide[]` 验证画布、缩略图、主题、编辑和导出。
- 用 Mock Harness API 替代其 Agent 后端，验证大纲/主题确认 UI。
- 接入兼容 Outline Stream，验证标题、大纲、主题和工具活动解析。
- 接入兼容 Slides XML Stream，验证增量解析、页面级进度、失败和重试。
- 验证确认事件能进入当前 Runtime，并由 Adapter 驱动 Workbench。
- 验证关闭页面后重新加载 Presentation Model、Revision 和生成状态。

PoC 交付物：依赖清单、源码复用矩阵、协议映射表、事件时序图、最小 Adapter、前端集成边界、风险清单和继续投入结论。

PoC 通过标准：

1. 真实 `presentation-ai` Workbench 在 Harness 页面壳中可加载并完成基础编辑。
2. 不接入 `presentation-ai` Agent，Outline Stream 能驱动大纲和主题确认 UI。
3. Slides XML Stream 能驱动真实编辑器增量展示页面，而不是仅显示 Mock 卡片。
4. 断线、失败、重试和刷新恢复不会丢失已确认的大纲或已完成页面。
5. Harness Runtime 核心无需修改，只通过工具、事件和 Adapter 完成闭环。

若第 1 项失败，暂停大规模搬迁并重新评估前端集成形式；若第 2 或第 3 项失败，优先调整 Adapter 和协议边界，不继续堆叠产品功能。

### Phase 2：Adapter 与 Presentation Model

- 建立 `presentation-ai Adapter`。
- 建立 Presentation Model、Slides Ops 和 Revision。
- 实现兼容前端所需的项目、页面、事件和编辑接口。
- 将用户确认事件接入现有 Runtime。
- 完成 Workbench 与 Harness 会话、权限和 Artifact 链路集成。

### Phase 3：Agent 工具与生成闭环

- 接入 Brief、Outline、Theme、Generate 和 Review 工具。
- 实现页面级生成、失败重试和恢复。
- 打通左侧流式反馈与右侧结构化 Workbench 状态。
- 完成导出和版本交付。

### Phase 4：质量和范围扩展

- 增加 Layout Linter。
- 增加 AI 修改预览和批量操作。
- 根据真实使用数据扩展布局、图表和导入能力。
- 评估更高保真 PPTX Engine 或其他 Renderer，但不改变 Model、Ops 和 Runtime 边界。

## 12. 验收标准

### 产品验收

- 用户能从一句需求进入大纲和主题确认。
- 用户能在 Workbench 内确认，不依赖模态对话框。
- 点击确认后右侧立即进入 Workbench，并展示真实生成进度。
- 左侧能看到同一次 Runtime 执行的反馈。
- 页面完成后无需切换应用即可编辑和导出。

### 技术验收

- 正式 Workbench 使用 `presentation-ai` 前端源码，不是自研仿制页面。
- 源码复用边界、保留的上游版本和本地二开差异有清单可追踪。
- Presentation Adapter 能处理 UI Message Stream、XML Stream、错误、重试、幂等和断线恢复。
- `presentation-ai` 内置 Agent 未接入生产。
- Agent Runtime 核心逻辑无修改。
- 工具、事件、接口和协议有 schema 和版本管理。
- 用户操作和 Agent 操作都可转换成 Slides Ops 并生成 Revision。
- 单页失败不会丢失已完成页面。
- 断线、取消、重试和恢复状态可解释。

### 质量验收

- 生成的 PPTX 可以打开并继续编辑。
- 常见页面不存在明显溢出、越界和重叠。
- 用户手工修改不会被 Agent 静默覆盖。
- 导出、版本和会话之间可以追溯。

## 13. 风险与决策门

### presentation-ai 前后端耦合过深

如果前端强依赖其后端内部数据或 Agent 状态，必须在 PoC 阶段通过 Adapter 隔离。若无法在不引入其运行时的情况下复用核心前端，暂停大规模二开，重新评估底座。

### 源码复用成本高于预期

接受拆分、重命名和接口替换成本，但不以“重新写一套相似编辑器”作为捷径。是否继续投入由 PoC 的模块可复用率、接口耦合度和基础编辑链路稳定性决定。

### Next.js 到 Vite 的迁移耦合

`presentation-ai` 前端包含 Next.js 路由、Server Actions、鉴权和服务端加载假设。若直接复制应用目录，会把后端依赖带入 Harness Web。正式路径是优先抽取组件、状态、解析器和样式，删除页面壳及服务端 action，再通过适配接口提供数据和命令；不得把 Next.js Server Action 作为生产依赖。 当前 UI-only 抽取目录中的 `@/` 引用只作为上游源码迁移痕迹，接入 Harness 前必须替换为相对引用或明确的 UI Adapter 接口。

### AI SDK UI Stream 与 Harness SSE 不一致

大纲生成依赖 UI Message parts，Slides 生成依赖纯文本 XML stream。若只映射最终结果而不保持增量事件和完成语义，Workbench 的实时生成、工具活动和恢复能力会失效。该问题必须在 Phase 1 通过真实前端流式运行验证。

### Runtime 事件与 Workbench 状态不一致

所有页面状态必须来自结构化事件和 canonical 事务结果，不能依赖对话文案推断。必要时为 Presentation 事件增加独立投影，但不改变 Runtime 核心调度模型。

### 生成与用户编辑冲突

生成中限制深度编辑；已生成页面和用户修改必须有明确锁定、版本和冲突提示。任何后台写入都必须可追踪、可撤销。

## 14. 最终确认

1. `presentation-ai` 是 Slides Workbench 的前端源码底座。
2. 大纲/主题确认和 Workbench 都直接复用其前端代码，不重新仿制。
3. `presentation-ai` 后端协议作为兼容参考，由 Harness 重新实现。
4. Agent Runtime 使用当前项目实现，只通过工具、协议、事件和 Adapter 扩展。
5. 生成中不单独做页面状态，生成过程属于 Slides Workbench 内部状态。
6. 「确认并生成」位于右侧 Workbench，确认后向 Runtime 发送结构化用户事件。
7. 左侧对话和右侧 Workbench 展示同一次 Runtime 执行的不同视图。
8. `/agent/preview` 仅用于验证交互流程，正式实现必须替换为源码级复用的 `presentation-ai` 前端。
9. 第一阶段先做开源底座接入 PoC，再决定是否进入完整集成。
