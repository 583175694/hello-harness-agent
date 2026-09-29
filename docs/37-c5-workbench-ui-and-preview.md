# C5：Workbench UI 与预览（产品 / 前端契约）

> 文档状态：**C5-A 已落地**；**C5-B 已落地（§15–§16）**；**C5-C 待启动**  
> 最后更新：2026-09-29（C5-B 实施收口）  
> 关联：[19-agent-frontend.md](./19-agent-frontend.md)（对话与跨面板导航）、[20-agent-workbench.md](./20-agent-workbench.md)（历史参考，C5 实施后以本文 Workbench IA 为准）、[31-c2-artifact-and-report-generation.md](./31-c2-artifact-and-report-generation.md)、[implementation-status.md §7.2 C5](./implementation-status.md)  
> 视觉参考：pipishrimp Lovart 稿（1920×1080；工具结果 + 交付物 + Context；底栏工具 Slider）  
> 切片命名：**C5-A** Workbench 升级与交互壳；**C5-B** HTML 预览与安全迭代；**C5-C** Sandbox 在工作台的深化展示（与 C4-A/B/C 命名一致，替代原 C5-1/2/3 编号）

## 1. 目标与非目标

### 1.1 目标

- 重新定义 **Workbench（工作台）** 信息架构：不再在右侧重复「执行时间线」；过程感知由 **左侧对话区内联 tool_activity** 与 **Composer 上方 Plan** 承担。
- Workbench 聚焦两类用户价值：
  - **工具结果**：单次 tool_call 的可读产物（搜索列表、网页读取摘要、bash 终端输出、MCP 返回等）。
  - **交付物**：模型输出的可带走文件（Markdown 报告、HTML、PDF 等），含 **版本链预览** 与「基于此版本修改」。
- **Context** Tab 保留最后一轮 CE 调试视图（与现网一致，非主营销能力）。
- 桌面端使用 **shadcn/ui Resizable** 调整 **会话区 | 工作台** 宽度；Workbench 底栏使用 **shadcn/ui Slider** 在 **同一 Run 的 tool_call 序列** 间切换查看。

### 1.2 非目标（C5-A）

- Workbench 内 **Activity 时间线 Tab**、独立 **Sources Tab**（调研来源并入「工具结果」中 `web_search` / `web_fetch` 视图）。
- Manus 式虚拟电脑全屏浏览器、Devin 式 IDE 三栏常驻。
- Workbench 底部 **Plan 阶段五步条**（Plan 只在 Composer 上方展示 K4 `PlanSnapshot`）。
- 左侧「本次工具调用」竖列表、交付物 Tab 内「版本」竖栏（改由顶栏 Chip/下拉 + 面包屑，主区全宽）。
- Mobile 端 Resizable（见 §8）；**C5-B** HTML iframe 安全策略与 Host preview（见 §5.3–§5.5、§15；C5-A 仅占位 iframe）。
- **视觉精修专项**（间距、动效、与设计稿像素级对齐）：不阻塞 C5-A 收口；需要时单独开一轮样式优化，不占用 C5-B/C 编号。

---

## 2. 布局总览

### 2.1 桌面（推荐设计画布 1920×1080；实现需兼容 ≥1280）

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ 顶栏：pipishrimp · Session · 标题 · Live · 模型 · 设置                      │
├───────────────────────────────┬──────────────────────────────────────────┤
│                               │  工作台  [工具结果|交付物|Context]  Pin × │
│  ResizablePanel：会话区         │  ─────────────────────────────────────  │
│  · 消息 + 内联 tool_activity   │  子标题：当前: web_search · HH:mm:ss  ◀ ▶ │
│  · Plan 条（Composer 上）       │  ┌────────────────────────────────────┐ │
│  · Composer                    │  │  主内容（全宽）                      │ │
│                               │  │  搜索卡片 / 终端 / 预览 / JSON      │ │
│                               │  └────────────────────────────────────┘ │
│                               │  工具调用 2/7  [====●--------]  Slider   │
├───────────────────────────────┴──────────────────────────────────────────┤
│ （可选）全局 Session 侧栏 — 与现网一致，本文不展开                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 会话区 | 工作台：shadcn Resizable

- 使用 **shadcn/ui `ResizablePanelGroup`**（`direction="horizontal"`）：左 Panel 会话，右 Panel 工作台。
- **默认比例**：约 **40% / 60%**（4:6，见 `DEFAULT_AGENT_SPLIT`）。
- **约束**：会话 `minSize` 建议 32%、`maxSize` 55%；工作台 `minSize` 45%。防止工作台不可读或会话不可输入。
- **持久化**：将 `defaultLayout`（或比例）写入 `localStorage`（键如 `pipishrimp.agent.split`），刷新后恢复。
- **手柄**：`ResizableHandle` 带可见 drag 区域与 `aria-label="调整会话与工作台宽度"`；支持键盘微调（若 shadcn 示例含则一并接入）。
- **Workbench 关闭**：若用户关闭工作台，Resizable 退化为会话 **100%**；再次打开时恢复上次比例。

**工程**：在 `apps/web` 通过 shadcn CLI 添加 `resizable` 组件（依赖 `react-resizable-panels`），路径 `@/components/ui/resizable`。

---

## 3. Workbench Tab 定义

| Tab | 用户问题 | 数据来源（服务端投影） | C5 阶段 |
| --- | --- | --- | --- |
| **工具结果** | 这次 tool 到底搜到了/读到了/跑出了什么？ | `tool_activity` + execution 快照；search/fetch/bash/MCP 结构化结果 | C5-A |
| **交付物** | 报告/网页/文件在哪，哪一版，能否预览与改？ | C2 Artifact + C2-D 版本链；预览/下载 API | C5-A 列表+预览壳；C5-B HTML iframe |
| **Context** | 最后一轮模型输入长什么样？ | Run Context Debug 快照 | C5-A |

**命名（UI 中文）**：契约 Tab 语义为 **工具结果**、**交付物**、**Context**。**C5-A 已交付** Web 文案为 **实时跟随**、**文件**、**调试上下文**（`AGENT_UI_COPY.workbenchTabLabels`）；后续若统一文案，属样式/ copy 迭代，不重新打开 C5-A 功能范围。

---

## 4. 工具结果 Tab

### 4.1 结构（无左侧工具列表）

- **顶栏一行**：`当前: {toolTitle} · {startedAt}`；右侧 **上一项 / 下一项**（与 Slider 同步，disabled 在边界）。
- **主区域全宽**：按 tool 类型渲染 **一种**主视图（同一时刻只展示一个 `toolCallId`）：

| 工具类型 | 主视图 | 说明 |
| --- | --- | --- |
| `web_search` | 结果卡片列表 | 标题、域名、snippet；不称 Sources Tab |
| `web_fetch` | 网页读取 | URL、状态、相关 passage 摘要（可展开）；质量 gate 失败展示可读错误 |
| `bash` / `job_*` | 终端只读块 | ANSI 渲染；结构化 `exitCode`；C5-C 可加强 job 卡片 |
| MCP / `external_tool` | 结构化摘要 | 工具名、server、结果摘要；不展示 secret |
| `tool_approval` 等待 | 审批面板 | 展开 `input` 摘要；批准/拒绝（K3.2，与对话区可并存，Workbench 提供大屏） |

- **禁止**：原始 provider JSON、完整 request/response、未脱敏 header。

### 4.2 与对话区的关系

- 对话区内联 **tool_activity** 仍为 **第一入口**；点击后：
  - 打开 Workbench（若已关闭）；
  - 选中 **工具结果** Tab；
  - 将 **Slider 与顶栏** 定位到对应 `toolCallId`。
- Workbench **不**再渲染纵向「执行时间线」列表。

---

## 5. 交付物 Tab

### 5.1 结构（无左侧版本竖栏）

- **顶栏**：面包屑 `交付物 › {fileName} › v{n}`；**版本 Segmented 或 Select**（v1 / v2 / **v3 当前**）；**在新窗口打开**、**下载**。
- **主区域全宽**：
  - Markdown / 报告：`MarkdownContent` 或等价预览。
  - HTML（C5-B）：**sandbox iframe** + CSP；Host preview URL（C5-A 已提供基础 iframe 预览，不含安全策略验收）。
  - 其他：沿用现有 Artifact 预览能力（PDF 等按 C2）。
- **底栏主按钮**：**基于此版本修改** → 触发 C2-D `revise` 流程（与现网语义一致）。

**C5-A 与 C5-B 边界**：列表/详情/版本/revise/restore/下载与 iframe 壳层已在 C5-A 交付；C5-B 补齐 **HTML 预览语义**、**Host CSP**、**iframe sandbox 终态** 与验收（详见 §15）。

### 5.2 与 Slider 的关系

- **交付物 Tab 激活时**：底栏 Slider **可隐藏**，或 **置灰**并显示「当前为交付物视图，切换工具请点工具结果」——**默认推荐隐藏**，避免与版本切换混淆。
- 从交付物卡片（对话内）进入：直接打开 **交付物 Tab**，不移动 Slider。

### 5.3 HTML 预览契约（C5-B）

| 项 | 契约 |
| --- | --- |
| 首期范围 | C2 `create_file` + `.html`（服务端 Markdown → 受控 HTML，见 [31 §5 C2-C HTML](./31-c2-artifact-and-report-generation.md)）；**不**包含 C5-C Sandbox dev server / 可运行站点 |
| Preview 正文 | 返回 **`originalKey` 上的 UTF-8 HTML 文档**（与下载字节一致），`Content-Type: text/html; charset=utf-8`；**不**再对 HTML 走 `normalizedKey` 的 Markdown 纯文本 |
| 非 HTML | 行为不变：文本/Markdown/JSON 等仍 `readNormalizedContent` + `text/plain`；图片仍短期 URL 302 |
| 鉴权 | 沿用 `GET /api/agent/artifacts/:artifactId/preview`：校验 local user + Artifact/File 归属；iframe `src` 同站 cookie 鉴权（与现网 `VITE_API_BASE_URL` 空串同源部署一致） |
| 下载 vs 预览 | **下载**：`Content-Disposition: attachment`；**预览**：inline、`Content-Disposition: inline`（或无 attachment），便于 iframe / 新窗口渲染 |

### 5.4 浏览器隔离（C5-B）

两层防御，**均不需要 Docker / OpenSandbox**（与 C3 terminal 沙箱无关）：

1. **Host 响应头 CSP**（preview 专用，见 §15.4）。
2. **Workbench `<iframe sandbox="…">`**：**`allow-scripts allow-same-origin allow-popups`**。C2 受控 HTML 无脚本；含 **inline 脚本** 的单文件落地页（常见 scroll/reveal）需执行脚本才能与 **download 本地打开** 一致。Host CSP 仅放行 `script-src 'unsafe-inline'`，仍 **`connect-src 'none'`** 禁外连；**Phase 2** 独立 preview 子域时可收紧 same-origin。

### 5.5 交付物 HTML 详情 UI（C5-B 补齐）

在 §5.1 顶栏契约上，对 `fileKind === 'html'`：

- 顶栏 trailing：**在新窗口打开**（`target="_blank"` + `rel="noopener noreferrer"`，URL 同 preview）、**下载**（现有 `downloadArtifact`）。
- 主区：`ArtifactHtmlPreview` 占满可用高度；换版本时 `src` 随 `artifactId` 变化（必要时 `key={artifactId}` 避免缓存旧文档）。
- 可选（不阻塞 C5-B Gate）：面包屑 copy 与 §3 Tab 中文统一。

---

## 6. Context Tab

- 与现网 Workbench Context 调试一致：最后一轮 Run 的 CE 编译结果（messages/tools 预算等），JSON 懒加载/折叠。
- Production 可访问；Mobile 文档要求 parity（见 [36-mobile-agent-frontend.md](./36-mobile-agent-frontend.md)）。

---

## 7. 底栏：工具调用 Slider（shadcn Slider）

### 7.1 语义

- Slider 表示 **当前 Run 内按时间排序的 business tool_call 序列**，用于 **切换 Workbench「工具结果」主区展示**。
- **不是** Plan 阶段条；Plan 仅在 **Composer 上方** 展示（K4）。
- **计入 Slider 刻度**：`web_search`、`web_fetch`、`bash`、`job_*`、MCP 工具、`create_file` / `create_report` 等 **Business Tool** 及需展示的 HITL 相关 tool 结果。
- **不计入**：`update_plan`（Plan 由浮条展示）、纯 assistant 文本 round、无独立 tool_call 的控制类事件。

### 7.2 UI 行为

- 组件：**shadcn/ui `Slider`**（`@/components/ui/slider`）。
- 离散模式：`min=0`，`max=n-1`，`step=1`；`value=[currentIndex]`；轨道上方或下方文案 **「工具调用 {current+1} / {n}」**。
- **Tick**：可选在轨道下标 1…n 小圆点，当前项高亮（与 Lovart 稿一致）；实现可用自定义 marks 或等距刻度。
- **联动**：拖动 Slider ↔ 更新 `currentToolCallId` ↔ 刷新主区视图 ↔ 同步顶栏 ◀ ▶。
- **Auto-follow**：Run 进行中若用户未 pin Workbench 工具索引，新 tool 完成时可 **自动将 Slider 移到最新一格**（与 [19 §14.1](./19-agent-frontend.md) auto-follow 一致；用户手动拖 Slider 后视为 **pinned**，直到新 Run 或用户点「跟随最新」）。

### 7.3 空态

- `n=0`：工具结果 Tab 显示「本 Run 尚无工具调用」；Slider 不渲染或 disabled。
- 仅交付物、无 tool：Slider 隐藏。

**工程**：shadcn CLI 添加 `slider`；样式与 pipishrimp 设计 token 对齐（见 `apps/web/src/design-system`）。

---

## 8. 响应式与 Mobile

| 视口 | 行为 |
| --- | --- |
| ≥1280 | Resizable 会话 \| 工作台；Workbench 三 Tab + Slider（工具结果） |
| &lt;1280 | 不使用 Resizable；**分段控制**「对话 \| 工作台」（与 36 号文档一致） |
| Mobile | 无 Slider 替代：**下拉选择「第 k 次工具调用」** 或 prev/next；交付物全屏预览 |

---

## 9. 跨面板导航（相对 19 的演进）

C5-A 实施时需扩展 `WorkbenchFocusTarget` / reducer（具体字段在 `agent-protocol` 与 19 中同步修改）：

```text
tool_call  → 打开工作台 · 工具结果 Tab · Slider 索引 = 该 toolCallId
artifact   → 打开工作台 · 交付物 Tab · 选中 artifactId + versionId
```

- 废弃或不再暴露：`kind: 'source'` 独立 Tab 跳转（改为 `tool_call` 定位到对应 fetch/search）。
- `activity` 总览：C5-A **不提供**独立 Activity Tab；若 focus 失败，降级到 **工具结果 Tab 最后一格** 或 **交付物 Tab 最新 Artifact**。

---

## 10. C5 分期与本文关系

| 阶段 | 本文范围 | 状态 |
| --- | --- | --- |
| **C5-A** | 本文 §2–§9：**仅 Workbench 升级** — Resizable、三 Tab、Slider、工具结果主视图、交付物列表/详情与版本、Context；对接现有 API/投影 | **已落地**（`feature/c5-workbench-ui`，2026-09-29 收口） |
| **C5-B** | §5.3–§5.5、§15–§16：HTML Host preview + CSP + sandbox iframe；revise 后再预览验收 | **已落地**（2026-09-29） |
| **C5-C** | §4 bash/job 终端增强；可选 dev server 预览；不新增顶 Tab | 未启动 |

---

## 11. 验收标准（C5-A Release Gate）

1. 桌面：**Resizable** 拖动会话/工作台宽度，刷新后比例保持；min/max 不破坏布局。
2. **工具结果**：全宽展示 search 列表；点击对话内 tool → 3s 内 Slider 与内容对齐同一 `toolCallId`。
3. **Slider**：仅 business tool_call 计数；拖动与 ◀ ▶ 一致；与 Plan 条独立（Plan 仍在 Composer 上）。
4. **交付物**：无左侧版本栏；版本切换 + 预览 + 下载 +「基于此版本修改」可用。
5. **Context**：Run 结束后仍可看最后一轮快照。
6. **1280px** 宽度下无横向溢出；Mobile 不要求 Resizable。

**C5-A 收口说明（2026-09-29）**：上述能力已在 Web 主路径交付；单元测试覆盖 split 持久化、Workbench 交付物 revise/restore 等。已知与本文契约的**非阻塞差异**留待后续 copy/样式或 C5-B 一并处理：Tab 中文文案见 §3；`<1280` 仍用 Resizable 直至 720px 分段（§8 理想态）；对话内 artifact focus 当前仍进工具结果 Tab；HTML 为占位 iframe。产品侧认定 **C5-A 功能阶段告一段落**；若要做 Lovart 级视觉精修，单独排期，不占用 C5-B。

---

## 12. 实施落点

**C5-A 实际落点**（`apps/web`）：

```text
apps/web/src/features/agent/
  components/agent-split-layout.tsx     # ResizablePanelGroup 包裹会话 + Workbench
  components/workbench-views.tsx        # 三 Tab、Slider 底栏、工具/交付物/Context 视图
  hooks/use-agent-split-layout.ts       # 比例持久化（pipishrimp.agent.split）

apps/web/src/components/ui/
  resizable.tsx
  slider.tsx
```

**C5-B 计划落点**（§15）：

```text
apps/api/src/files/
  files.service.ts                      # preview：html 读 original + contentType
  generated-file.renderer.ts            # HTML 外壳：<base target="_blank" …>
  artifact-html-preview.constants.ts    #（建议新建）CSP、Referrer-Policy 常量

apps/api/src/artifacts/
  artifacts.controller.ts               # preview 响应头：CSP、inline disposition

apps/web/src/features/agent/components/
  workbench-views.tsx                   # ArtifactHtmlPreview sandbox、顶栏打开/下载、key 换版

apps/api/test/
  unit/files/files-preview-html.spec.ts #（建议新建）
  integration/app.integration.spec.ts   # html preview 断言 doctype 与 CSP
```

---

## 13. 文档维护

- Workbench IA 变更：**先改本文**，再更新 [19-agent-frontend.md](./19-agent-frontend.md) §14/§16 中与 Tab/focus 冲突的段落。
- C5-B HTML 安全预览：以 **§5.3–§5.5、§15–§16** 为准；实施后同步 [11-api-protocol.md](./11-api-protocol.md) §13 与 [implementation-status.md](./implementation-status.md) §7.0。
- 切片状态同步 [implementation-status.md](./implementation-status.md) §7.2 C5。

---

## 14. 阅读顺序

1. 本文 §3–§7（IA + Slider + Resizable）  
2. **C5-B 实施**：本文 §15–§16（含 §15.9 业内对照）  
3. [19-agent-frontend.md](./19-agent-frontend.md) — Composer、Plan、内联 tool、focus  
4. [31-c2-artifact-and-report-generation.md](./31-c2-artifact-and-report-generation.md) — 版本与 revise、HTML 生成约束  
5. Lovart / 设计稿（1920；工具结果帧 + 交付物帧）

---

## 15. C5-B 实施方案

### 15.1 背景与目标

**用户价值**：在 Workbench **交付物** Tab 内，把 Agent 生成的 `.html` 当作 **可读网页** 预览，并沿 C2-D 版本链 **改一版 → revise → 切换版本 → 再预览**，无需 C3 容器或第二套「浏览器 Docker」。

**现状（C5-A）**：

- Web 已对 HTML 使用 iframe + `getArtifactPreviewUrl(artifactId)`。
- API `preview` 对非图片统一返回 **规范化 Markdown 文本**（`text/plain`），iframe 无法呈现排版。
- iframe 使用 `sandbox="allow-scripts allow-same-origin"`，且无 CSP 响应头，**未通过**产品安全验收。

**C5-B 目标**：

1. HTML artifact 的 preview 与 download **字节一致**（受控 HTML 文档）。
2. Host 对 preview 响应施加 **CSP + inline 展示** 策略。
3. Web iframe **sandbox 收紧**，与 C2 生成层（无 script）一致。
4. 版本切换与 revise 闭环 **可自动化验收**。

**非目标**：

- C5-C：Sandbox 内 dev server、job 日志、dist 代理预览。
- 用户上传的 raw `.html` 附件（若未来支持）——本方案仅约束 **`fileKind === 'html'` 且 `origin === 'agent_generated'`** 的 artifact；其他 kind 保持现网 preview 语义。
- 独立 preview 子域（**可选 Phase 2**；首版同源 + CSP + sandbox 即可 Gate）。

### 15.2 架构（与 C3 的关系）

```text
┌─────────────────────────────────────────────────────────────┐
│ 浏览器 · Workbench                                           │
│   <iframe sandbox="allow-same-origin" src=preview URL>       │  ← 浏览器 sandbox 属性
└───────────────────────────┬─────────────────────────────────┘
                            │ GET /api/agent/artifacts/:id/preview
                            │ Cookie 鉴权 · CSP 响应头
┌───────────────────────────▼─────────────────────────────────┐
│ API · FilesService.preview / ArtifactsController              │
│   html → storage.readObject(variant: original)                │
│   非 html → normalized 文本（不变）                           │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ COS · originalKey（C2 renderGeneratedFile 写入的 HTML）        │
└─────────────────────────────────────────────────────────────┘

C3 OpenSandbox / Docker  ── 不参与 C5-B HTML 静态预览 ──
```

### 15.3 API 变更

#### 15.3.1 分支逻辑

在 `FilesService.preview(userId, fileId)`（及 artifact 间接调用）中：

| `file.fileKind` | Preview 行为 |
| --- | --- |
| `image` | 不变（302 或短期 URL） |
| `html` | `readOriginalContent`（或 `storage.readObject` variant `original`）；`contentType: text/html; charset=utf-8` |
| 其他 | 不变：`readNormalizedContent` + `text/plain` |

**不变量**：HTML preview 正文 MUST 与 `download` 的 HTML buffer 一致（同一 `originalKey`），避免「预览一套、下载一套」。

#### 15.3.2 Controller 响应头

`ArtifactsController.preview` 在发送 HTML 时：

- `Content-Type: text/html; charset=utf-8`
- `Content-Security-Policy`: 见 §15.4（常量集中定义，便于单测断言）
- `Content-Disposition: inline`（文件名可选 `filename*=UTF-8''…`）
- **不**设置 `X-Frame-Options: DENY`（Workbench 需 embed）；用 CSP `frame-ancestors 'self'` 限制仅本站嵌套
- `Cache-Control: private, no-store`（避免共享缓存泄漏；版本切换靠新 `artifactId` URL）
- `Referrer-Policy: no-referrer`（或 `strict-origin-when-cross-origin`）：用户从预览页点击外链时，不向第三方泄露带 `artifactId` 的 preview URL path）

#### 15.3.3 回归：集成测试

更新 `app.integration.spec.ts` 多格式生成用例：

- `fileKind === 'html'` 的 preview：`expect(text).toMatch(/^<!doctype html>/iu)`，且 `content-type` 含 `text/html`
- 断言响应含 `Content-Security-Policy` 头（至少包含 `default-src 'none'` 或项目冻结的 baseline 子串）
- 可选：断言 `Referrer-Policy` 与 `connect-src 'none'` 出现在 CSP 中

### 15.4 安全策略（冻结首版）

**生成层（C2，C5-B 小改）**：Markdown → 受控 HTML；拒绝 script/iframe/原始 HTML 等（[31 §5.9、HTML 小节](./31-c2-artifact-and-report-generation.md)）。C5-B **不**在 preview 路径再跑 remark；在 **HTML 文档外壳**（`generated-file.renderer`）增加：

```html
<base target="_blank" rel="noopener noreferrer">
```

使正文中的 `https://` 超链接默认 **新标签** 打开，避免在 Workbench iframe **内**导航到第三方（钓鱼页占满预览框）。与 ChatGPT Canvas 等「预览里点链接需特殊操作」的体验对齐为 **可预期的新 tab 行为**。

**传输/渲染层（C5-B 新增）** — 首版 CSP（Nest 常量 `ARTIFACT_HTML_PREVIEW_CSP`）：

```http
Content-Security-Policy:
  default-src 'none';
  style-src 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'none';
  form-action 'none';
  base-uri 'none';
  frame-ancestors 'self';
  upgrade-insecure-requests
```

说明：

- C2 首版 HTML **无 `<script>`** → `default-src 'none'` + 仅允许 inline style（生成器内嵌 CSS）即可。
- **`connect-src 'none'`**：纵深防御，与 Open WebUI `IFRAME_CSP` 惯例一致；即便 future 误开 script，也禁止 `fetch`/XHR/WebSocket 外连（Claude 托管 Artifact 用 `connect-src 'self'` 因允许 JS；我们无 JS，更严）。
- **不**自动加载远程 img（C2 已禁图片节点）；`img-src` 仅防模板演进遗漏。
- `frame-ancestors 'self'`：仅允许本站 Workbench iframe；新窗口打开 preview URL 仍可用。
- 若将来 HTML 模板引入 Google Fonts 等，再 **显式** 扩 `font-src`/`style-src`，并写回归测试。
- Preview 响应 **`Referrer-Policy: no-referrer`**（§15.3.2）：外链站点不应收到带 internal preview path 的 Referer。

**iframe sandbox（Web 冻结首版）**：

```html
sandbox="allow-same-origin allow-popups"
```

- **不含** `allow-scripts`（与 C2 无脚本一致；即使 original 被污染，iframe 也不执行脚本）。
- **`allow-popups`**：配合 C2 `<base target="_blank">`，允许用户点击外链时打开新标签；**不设** `allow-top-navigation` / `allow-top-navigation-by-user-activation`，降低 iframe 内整页跳转到钓鱼站的风险。
- **`allow-same-origin`**：同源 preview URL 下 CSS 与 DOM 正常。同源 + same-origin 在「有脚本」时会扩大攻击面（Open WebUI 默认关闭 same-origin）；我们无 script，首版可接受。**若未来允许 JS 或用户上传 HTML，必须先拆 preview 独立子域并去掉 `allow-same-origin`**（Phase 2，§15.8）。

**威胁模型（验收用）**：

| 场景 | 期望 |
| --- | --- |
| 模型试图在 Markdown 中注入 `<script>` | C2 生成失败或剥离；preview 无 executable script |
| 篡改 COS original（运维/越权） | CSP 仍限制 script/connect；sandbox 无 allow-scripts |
| 恶意站点嵌套 preview URL | `frame-ancestors 'self'` 拒绝跨站 embed |
| Preview URL 泄露 | 仍需 session 用户 cookie；`no-store` 降低共享终端缓存风险 |
| 正文含钓鱼外链 | 点击后 **新 tab** 打开，iframe 内仍停留在交付物页；Referer 不携带 preview path |
| iframe 内整页导航到外站 | 默认 sandbox 禁止 top navigation；不依赖用户在框内「后退」 |

**不在 C5-B 解决**：多租户 CDN 公网匿名 preview、Signed URL 免 cookie iframe（若未来需要 Mobile WebView，另开方案）。托管侧 **HTML 字节内容审计**（Claude 亦未做 server-side inspect）——可选 cheap 检测（如 original 含 `<script` 则 403）不写入 Gate。

### 15.5 Web 变更

1. **`ArtifactHtmlPreview`**：`sandbox="allow-same-origin allow-popups"`（§15.4）；`key={artifact.artifactId}` 防换版缓存。
2. **交付物详情顶栏**（HTML）：增加「在新窗口打开」「下载」按钮（§5.5）；错误态 copy 与顶栏动作一致。
3. **不改为 srcdoc/blob**：继续 **Host URL**，便于 CSP 与 `Referrer-Policy` 响应头生效；blob 无法附带 API 级 CSP（Open WebUI 用 srcdoc + meta CSP 是另一路径；我们大文件更适合 URL）。
4. **Mobile（§8）**：同一 preview URL；窄屏全宽 iframe；不要求 C5-B 单独做 Resizable。
5. **正文外链**：依赖 C2 模板 `<base target="_blank">`；验收时 HTML fixture 含一条外链，点击应新开标签且 Workbench iframe 不离开当前交付物。

**可选（C5-B 后）**：对话内 artifact focus 直达 **交付物 Tab**（37 §11 已知差异）；不写入 C5-B Release Gate。

### 15.6 版本与 revise 闭环

C5-A 已具备：

- 版本 chip、`onRevise` / restore、API C2-D。

C5-B 验收追加：

1. 对同一 `seriesId` 生成 v2（revise 后新 `artifactId`）。
2. Workbench 切到 v2 后，iframe 展示 **更新后的 HTML 标题/正文**（集成或 e2e 断言 DOM/`innerText` 或 snapshot）。
3. v1 切回仍展示旧内容。

无需新 API；确保 preview 读 **当前 artifact 的 fileId** 即可。

### 15.7 实施顺序与工作量（建议）

| 步骤 | 内容 | 依赖 |
| --- | --- | --- |
| 1 | API：`html` preview 读 original + 单测；C2 HTML 外壳加 `<base target="_blank">` | — |
| 2 | API：CSP（含 `connect-src 'none'`）、`Referrer-Policy`、`Cache-Control` + 集成测试更新 | 1 |
| 3 | Web：`sandbox`（无 scripts + `allow-popups`）+ iframe `key` + HTML 顶栏动作 | 1 |
| 4 | 文档：`11-api-protocol` §13 一句；implementation-status 标 **已完成** | 1–3 |
| 5 | 可选 e2e：`create_file` html → 交付物 iframe 可见 `<h1>` | 3 |

预估：**小中型切片**（ primarily API 分支 + 常量 + 测试；Web 改动面小）。

### 15.8 风险与回滚

- **风险**：误将用户上传 HTML 附件走 original 预览 → 用 `fileKind === 'html' && agent_generated` 分支降低范围；上传类 html 若存在，保持 normalized 文本或 fallback 下载。
- **回滚**：feature flag 不必首版引入；若 CSP 过严导致样式空白，放宽 `style-src` 并补 fixture HTML 单测。
- **与 PDF 预览**：PDF 仍走 download/外链；C5-B 不改动。
- **Phase 2（非 C5-B）**：**独立 preview 源**（如 `*.preview.<product-domain>` 或每 artifact 随机子域，对齐 Claude `*.frame.claudeusercontent.com`）。触发条件：允许 preview 内 **脚本**、用户上传 HTML、或需与主站 **完全 process 隔离**。届时去掉 iframe `allow-same-origin`，preview cookie 与 API 分离或改用短期 signed URL。

### 15.9 业内对照（2026-09，调研摘要）

用于 review C5-B 边界，**非**对外承诺。

| 档位 | 代表 | 做法 | 与 pipishrimp |
| --- | --- | --- | --- |
| **静态 HTML 交付物** | Claude Artifacts（托管页）、Open WebUI Artifacts | iframe + CSP + sandbox；Claude 每 artifact **独立子域** + 允许 JS 但 **`connect-src 'self'`** | **C5-B**：更严（无 JS）；同源 preview 首版可接受 |
| **可运行 UI（JS/React）** | ChatGPT Canvas HTML/React、Claude 交互 Artifact | 预览环境可编译/补依赖；Enterprise 可关网络 | **非 C5-B**；需 C2/CSP/sandbox 整体放宽 |
| **Dev server 预览** | v0 + Vercel Sandbox、Bolt WebContainer、Manus + E2B | 容器内起服务，embed **preview URL** | **C5-C** + C3，非改 `FilesService.preview` |

**采纳的对齐项**：preview 字节与下载一致（避免 Canvas「预览能跑、导出不能跑」）；CSP + sandbox 双层；版本/revise 侧栏迭代。

**首版已知差距（可接受）**：未使用 per-artifact 子域；不允许 preview 内 JS（产品选择，与 C2 一致）。**C5-B 已吸收改进**：`connect-src 'none'`、`Referrer-Policy`、`<base target="_blank">` + `allow-popups`、禁止 iframe 内 top navigation。

---

## 16. 验收标准（C5-B Release Gate）

1. **HTML preview 语义**：ready 的 agent 生成 `.html` artifact，`GET …/preview` 返回 `text/html`，body 以 `<!doctype html>` 开头，且与 download 字节一致。
2. **CSP**：上述响应包含冻结的 `Content-Security-Policy`（含 **`connect-src 'none'`**；单测或 integration 断言）；含 **`Referrer-Policy`**（`no-referrer` 或文档冻结值）。
3. **Workbench**：交付物详情中 HTML 在 iframe 内可见排版（非 Markdown 源码）；sandbox 为 **`allow-same-origin allow-popups`**，**不含** `allow-scripts`。
4. **顶栏**：HTML 详情可「在新窗口打开」与「下载」。
5. **版本**：同一 series 至少两版时，切换 version chip 后 iframe 内容随 artifact 变化。
6. **Revise 闭环**：revise 产生新版本后，默认选中新 current（或用户切到新版本），preview 展示新 HTML（integration 或 e2e 一条）。
7. **非回归**：Markdown/JSON 等 preview 仍为 plain；图片 preview 行为不变。
8. **外链**：C2 生成的 HTML 含 `<base target="_blank">`；fixture 内外链点击在新标签打开，iframe 不导航离开当前交付物（手工或 e2e 一条）。
9. **质量栏**：`pnpm check`、相关 unit/integration 通过；不要求本切片新增 Playwright 除非步骤 15.7-5 已做。

**完成后**：更新本文 §10 状态为 **已落地**；[implementation-status.md](./implementation-status.md) §7.0 C5-B 同步。
