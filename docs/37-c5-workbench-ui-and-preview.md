# C5：Workbench UI 与预览（产品 / 前端契约）

> 文档状态：**C5-1 设计冻结（待实施）**  
> 最后更新：2026-09-28  
> 关联：[19-agent-frontend.md](./19-agent-frontend.md)（对话与跨面板导航）、[20-agent-workbench.md](./20-agent-workbench.md)（历史参考，C5 实施后以本文 Workbench IA 为准）、[31-c2-artifact-and-report-generation.md](./31-c2-artifact-and-report-generation.md)、[implementation-status.md §7.2 C5](./implementation-status.md)  
> 视觉参考：pipishrimp Lovart 稿（1920×1080；工具结果 + 交付物 + Context；底栏工具 Slider）

## 1. 目标与非目标

### 1.1 目标

- 重新定义 **Workbench（工作台）** 信息架构：不再在右侧重复「执行时间线」；过程感知由 **左侧对话区内联 tool_activity** 与 **Composer 上方 Plan** 承担。
- Workbench 聚焦两类用户价值：
  - **工具结果**：单次 tool_call 的可读产物（搜索列表、网页读取摘要、bash 终端输出、MCP 返回等）。
  - **交付物**：模型输出的可带走文件（Markdown 报告、HTML、PDF 等），含 **版本链预览** 与「基于此版本修改」。
- **Context** Tab 保留最后一轮 CE 调试视图（与现网一致，非主营销能力）。
- 桌面端使用 **shadcn/ui Resizable** 调整 **会话区 | 工作台** 宽度；Workbench 底栏使用 **shadcn/ui Slider** 在 **同一 Run 的 tool_call 序列** 间切换查看。

### 1.2 非目标（C5-1）

- Workbench 内 **Activity 时间线 Tab**、独立 **Sources Tab**（调研来源并入「工具结果」中 `web_search` / `web_fetch` 视图）。
- Manus 式虚拟电脑全屏浏览器、Devin 式 IDE 三栏常驻。
- Workbench 底部 **Plan 阶段五步条**（Plan 只在 Composer 上方展示 K4 `PlanSnapshot`）。
- 左侧「本次工具调用」竖列表、交付物 Tab 内「版本」竖栏（改由顶栏 Chip/下拉 + 面包屑，主区全宽）。
- Mobile 端 Resizable（见 §8）；C5-2 HTML iframe 安全策略细则（见 §6，C5-1 可占位预览）。

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
| **工具结果** | 这次 tool 到底搜到了/读到了/跑出了什么？ | `tool_activity` + execution 快照；search/fetch/bash/MCP 结构化结果 | C5-1 |
| **交付物** | 报告/网页/文件在哪，哪一版，能否预览与改？ | C2 Artifact + C2-D 版本链；预览/下载 API | C5-1 列表+预览壳；C5-2 HTML iframe |
| **Context** | 最后一轮模型输入长什么样？ | Run Context Debug 快照 | C5-1 |

**命名（UI 中文）**：Tab 文案固定为 **工具结果**、**交付物**、**Context**（Context 可副标题「调试」）。

---

## 4. 工具结果 Tab

### 4.1 结构（无左侧工具列表）

- **顶栏一行**：`当前: {toolTitle} · {startedAt}`；右侧 **上一项 / 下一项**（与 Slider 同步，disabled 在边界）。
- **主区域全宽**：按 tool 类型渲染 **一种**主视图（同一时刻只展示一个 `toolCallId`）：

| 工具类型 | 主视图 | 说明 |
| --- | --- | --- |
| `web_search` | 结果卡片列表 | 标题、域名、snippet；不称 Sources Tab |
| `web_fetch` | 网页读取 | URL、状态、相关 passage 摘要（可展开）；质量 gate 失败展示可读错误 |
| `bash` / `job_*` | 终端只读块 | ANSI 渲染；结构化 `exitCode`；C5-3 可加强 job 卡片 |
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
  - HTML（C5-2）：**sandbox iframe** + CSP；Host preview URL。
  - 其他：沿用现有 Artifact 预览能力（PDF 等按 C2）。
- **底栏主按钮**：**基于此版本修改** → 触发 C2-D `revise` 流程（与现网语义一致）。

### 5.2 与 Slider 的关系

- **交付物 Tab 激活时**：底栏 Slider **可隐藏**，或 **置灰**并显示「当前为交付物视图，切换工具请点工具结果」——**默认推荐隐藏**，避免与版本切换混淆。
- 从交付物卡片（对话内）进入：直接打开 **交付物 Tab**，不移动 Slider。

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

C5-1 实施时需扩展 `WorkbenchFocusTarget` / reducer（具体字段在 `agent-protocol` 与 19 中同步修改）：

```text
tool_call  → 打开工作台 · 工具结果 Tab · Slider 索引 = 该 toolCallId
artifact   → 打开工作台 · 交付物 Tab · 选中 artifactId + versionId
```

- 废弃或不再暴露：`kind: 'source'` 独立 Tab 跳转（改为 `tool_call` 定位到对应 fetch/search）。
- `activity` 总览：C5-1 **不提供**独立 Activity Tab；若 focus 失败，降级到 **工具结果 Tab 最后一格** 或 **交付物 Tab 最新 Artifact**。

---

## 10. C5 分期与本文关系

| 阶段 | 本文范围 |
| --- | --- |
| **C5-1** | 本文 §2–§9：Resizable、三 Tab、Slider、工具结果视图矩阵、交付物顶栏版本、Context；对接现有 API/投影 |
| **C5-2** | §5 HTML iframe 预览与安全策略；交付物 Tab 内站点预览验收 |
| **C5-3** | §4 bash/job 终端增强；可选 dev server 预览；不新增顶 Tab |

---

## 11. 验收标准（C5-1 Release Gate）

1. 桌面：**Resizable** 拖动会话/工作台宽度，刷新后比例保持；min/max 不破坏布局。
2. **工具结果**：全宽展示 search 列表；点击对话内 tool → 3s 内 Slider 与内容对齐同一 `toolCallId`。
3. **Slider**：仅 business tool_call 计数；拖动与 ◀ ▶ 一致；与 Plan 条独立（Plan 仍在 Composer 上）。
4. **交付物**：无左侧版本栏；版本切换 + 预览 + 下载 +「基于此版本修改」可用。
5. **Context**：Run 结束后仍可看最后一轮快照。
6. **1280px** 宽度下无横向溢出；Mobile 不要求 Resizable。

---

## 12. 实施落点（建议）

```text
apps/web/src/features/agent/
  components/agent-shell.tsx          # ResizablePanelGroup 包裹会话 + Workbench
  components/workbench-views.tsx      # 三 Tab 重构
  components/workbench-tool-slider.tsx  # Slider + 索引状态
  model/workbench-tool-index.ts       # Run 内 toolCallId 有序列表（由 projection 推导）
  hooks/use-workbench-split-persist.ts

apps/web/src/components/ui/
  resizable.tsx                       # shadcn add
  slider.tsx                          # shadcn add
```

---

## 13. 文档维护

- Workbench IA 变更：**先改本文**，再更新 [19-agent-frontend.md](./19-agent-frontend.md) §14/§16 中与 Tab/focus 冲突的段落。
- C5-2 HTML 安全预览：**在本文 §5 增补** 或引用独立安全小节。
- 实施后更新 [implementation-status.md](./implementation-status.md) C5-1 状态与验证记录。

---

## 14. 阅读顺序

1. 本文 §3–§7（IA + Slider + Resizable）  
2. [19-agent-frontend.md](./19-agent-frontend.md) — Composer、Plan、内联 tool、focus  
3. [31-c2-artifact-and-report-generation.md](./31-c2-artifact-and-report-generation.md) — 版本与 revise  
4. Lovart / 设计稿（1920；工具结果帧 + 交付物帧）
