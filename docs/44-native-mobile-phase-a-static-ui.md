# Native Mobile Phase A — 静态 UI 全量实施（Android + iOS + HarmonyOS）

> 文档类型：**Phase A 实施任务书（Gate A）**  
> 文档状态：**v1.0 — 可开工**  
> 最后更新：2026-10-27  
> 上级架构：[43-native-mobile-clients-architecture.md](./43-native-mobile-clients-architecture.md)（Phase A/B 总纲）  
> 产品 parity：[36-mobile-agent-frontend.md](./36-mobile-agent-frontend.md) **§4**（能力 ID）；**§5 Pad IA 延至 v1.1**  
> RN 对照（仅 VIA）：[43-native-mobile-clients-architecture.md](./43-native-mobile-clients-architecture.md) **§3.4.5**

---

## 1. 本阶段一句话目标

在 **零后端依赖**（无 Harness HTTP/SSE、不链接 `mobile-core` 运行时）的前提下，三端 Native 把 **Agent 工作台全部用户可见界面、组件、主要 UI 状态与交互** 做到 **可发布级静态体验**；数据一律来自 **`packages/mobile-contract`** 的 Preview fixture 与本地 **ReplayController** 模拟流式。

**Done 定义**：除 **Phase B 联调项**（真 API、Run 归约、鉴权持久化策略等）外，Mobile 产品面上 **该有的屏、该有的态、该点的动效** 均已实现并可回归。

---

## 2. 与架构文档的对应关系

| 43 文档概念 | 本阶段落地 |
| --- | --- |
| **Phase A** | 本文 **全部范围** |
| **Phase B** | **明确不在本文**（见 §7） |
| **Gate A** | 本文 **出口标准**（§8） |
| **Gate B / B′** | 不在本文 |
| **A0～A9** | 本文 **里程碑**（§6） |
| **`AgentSessionPort`** | 唯一数据入口；仅 **`PreviewAgentSessionPort`** |
| **`mobile-contract`** | `design-tokens.json` + `fixtures/preview/` + `schema/` |
| **v1 阻塞** | Gate A **强制 Android + iOS**；鸿蒙 **并行、不挡 v1** |
| **鸿蒙** | 同屏同态同 fixture；Release 节奏 **v1.1**，但 **静态 UI 与本阶段一并做完** |

---

## 3. 「静态」边界（In / Out）

### 3.1 In scope（必须在本阶段完成）

- **工程脚手架**：`apps/android`、`apps/ios`、`apps/harmony` + `packages/mobile-contract`（`mobile-core` 可仅占位目录，**不接入 App**）。
- **Design System**：各端 `core-ui` / `CoreUI` — tokens + §16.2 primitive 清单 + 业务 **pattern 组件**（见 §5）。
- **全部主流程屏幕与导航**（Phone IA，v1 iPhone 竖屏优化）：
  - Chat 主壳（顶栏、Drawer、对话、Composer、Peek、连接态 Pill **假状态**）
  - Workbench（Sheet + 全 Tab UI）
  - Settings（含 MCP、Memory **本地假数据** 子树）
  - Reader（Report / Artifact 全屏阅读）
  - Preview / Dev Menu（切换 fixture 场景）
- **UI 状态矩阵**（§4）：空态、加载态、错误态、禁用态、HITL 静态态、流式中（纯文本 tail）、完成态 Markdown 等。
- **交互与动效**：Drawer 滑入、Workbench 多档 detent、键盘与 Composer 联动、Sheet/附件/Skill overlay、Reduce Motion 分支、按压缩放 vs 背景反馈（对齐 RN `AGENT_UI_*` **规格**，不抄 RN 技术）。
- **流式模拟**：Preview Port 内 **ReplayController**（定时器 / 脚本）推进 tail 字段；**禁止** 真 SSE。
- **本地假持久化**：主题、字号、Settings 表单、Memory/MCP 列表等 **内存或本地 KV 假保存**（用于演示 Settings UI；**不**定义 Phase B 的 API URL 联调契约）。
- **无障碍与触控**：最小 hit target、accessibilityLabel（各端平台惯例）。
- **静态质量门禁（v1 双端必达）**：§8 Gate A；鸿蒙 **同 fixture 可演示 + Snapshot/手工矩阵**。

### 3.2 Out of scope（留给 Phase B 或 v1.1+）

- 任何 **`GET/POST` Harness API**、SSE、`readyz`、上传进度 **真网络**。
- 链接 **`packages/mobile-core`**、`CoreAgentSessionPort`、`HarnessMobileEngine`。
- **`mobile-contract` 的 `run-events` / `expected/domain` golden**（Phase B）。
- OAuth、真鉴权、Token 与服务器 **local user** 联调。
- 推送（FCM/APNs/Push Kit）、Sentry 生产接入、Maestro 真 API E2E。
- **iPad 并排 IA**（36 §5；v1.1）；可保留 **RN 对照认知**，Native v1 不验收 Pad。
- Debug Workbench Tab（与 Web 一致：**不做**）。

### 3.3 产品能力 ID 在本阶段的含义

[36 §4](./36-mobile-agent-frontend.md) 矩阵 **ID 不删**；Phase A 只要求 **每条能力若有 UI，则必须有静态界面 + fixture 覆盖**，并标注实现方式：

| 标注 | 含义 |
| --- | --- |
| **UI+Fixture** | 屏幕/组件已实现；由 preview JSON 或 Dev 菜单进入 |
| **UI+Local** | 界面完整；数据为本地假列表/假保存 |
| **UI+Replay** | 流式/进度由 ReplayController 模拟 |
| **Phase B** | 本阶段仅 placeholder 或禁用态文案（**尽量少**；优先用 fixture 展示「将来联调后长什么样」） |

---

## 4. 屏幕与 UI 状态清单（验收用）

### 4.1 屏幕 / 路由（三端同构，平台导航 idioms 可不同）

| ID | 屏幕 / 表面 | 要点 |
| --- | --- | --- |
| **S-CHAT** | 会话主屏 | Landing、长 thread、吸底滚动 |
| **S-DRAWER** | 会话 Drawer | 列表、搜索 UI、草稿行、置顶、长按菜单、刷新控件（**下拉可只刷新本地 fixture**） |
| **S-WB-SHEET** | Workbench BottomSheet / 等价容器 | 三档 detent；默认最高档；Tab 切换 **不改变 detent** |
| **S-WB-ACT** | Activity Tab | 时间线、Bash **只读**终端、定位高亮态 |
| **S-WB-SRC** | Sources Tab | 来源卡片、Passage 半屏 Modal、「仅检索无文件」变体 |
| **S-WB-RPT** | Report Tab | 大 Markdown、引用跳转 UI |
| **S-WB-ART** | Artifact Tab | 版本链、diff 预览、restore 确认 **静态** |
| **S-WB-CTX** | Context Tab | Model Round JSON 只读展示 |
| **S-COMP** | Composer 栈 | 模型菜单、推理、附件、Skill、Plan 浮卡、Follow-up、Steer 文案态 |
| **S-HITL-CL** | 澄清面板 | 选项 + 自由文本 **静态** |
| **S-HITL-AP** | 工具审批 | 列表 + 展开 detail + 批准/拒绝 **静态** |
| **S-SET** | Settings 根 | 主题、字号、API URL **编辑器 UI**（不要求真连） |
| **S-SET-MCP** | MCP 列表/表单 | CRUD UI + Test 按钮 **本地 Alert 模拟** |
| **S-SET-MEM** | Memory Hub | 开关、列表增删改 **本地** |
| **S-READER** | Reader | Report / Artifact 全屏阅读、返回栈 |
| **S-PREV** | Preview / Dev Menu | **§8.1 十场景** 一键切换 |
| **S-CONN** | 连接态 | offline / reconnecting / error **假状态**（Connection Pill + Banner） |

### 4.2 组件分层（须在 PR 中可识别）

**Primitive（A0 起，43 §16.2）**  
`AppScaffold`、`AppTopBar`、`AppText`、`AppButton`、`AppIcon`、`AppTextField`、`AppSheet`、`ListRow`、`Badge`、`Spinner`、`Divider`。

**Pattern / Feature（A1～A7 逐步）**  
与 RN 对照命名建议（实现语言各端不同）：

| Pattern | 职责 |
| --- | --- |
| `ConnectionPill` / `ServiceBanner` | 连接与服务假状态 |
| `UserMessageBubble` / `AssistantTurnContent` | 对话行 |
| `AssistantProcessTimeline` / `ReasoningBlock` / `ToolActivityInline` | Process / CoT |
| `MarkdownBody`（完成态） | 代码块、链接、公式（v1 可分期） |
| `ComposerStack` + overlays | 附件 Sheet、Skill Picker、Model Menu |
| `PlanFloatingCard` / `ComposerPeekBar` | Plan / Run 摘要 |
| `WorkbenchSegmentedTabs` + 各 Tab View | Workbench 内容 |
| `SessionDrawer`* | 会话列表 |
| `McpServerForm` / `SettingsSwitch` | Settings 控件 |

\* 名称各端可本地化，**职责一致**。

### 4.3 必覆盖 UI 状态（每态至少 1 个 fixture 或 Preview 路由）

- 空 Landing / 无 Session  
- 长列表（20+ turn）滚动  
- Assistant **流式中**（纯文本 tail，无 Markdown 重排）  
- Assistant **完成态**（Markdown / 代码块）  
- Process + tool_activity + reasoning 组合  
- Composer：`new-run` / `steer` / `clarification` / `disabled`  
- HITL：澄清、工具审批（含展开行）  
- Workbench：各 Tab 至少一屏；Activity Bash 只读；Sources 变体  
- 连接错误 / ProblemDetails 展示（假 payload）  
- Settings：Light/Dark；字号阶梯  
- Reduce Motion：Drawer/Sheet **无 slide** 或仅淡入（各端实现）  

---

## 5. 数据与 Port（Phase A 唯一模式）

```text
packages/mobile-contract/fixtures/preview/*.json
        │
        ▼
PreviewAgentSessionPort  (+ optional ReplayController)
        │
        ▼
ViewModel / @Observable  ──►  core-ui + feature UI
```

- UI **禁止** 直接读 JSON 文件；经 **Port + 与 schema 对齐的 UI 模型**。
- Fixture 文件名与 **43 §16.3 十场景** 一致；不足场景在 contract README 补映射表。
- **`design-tokens.json`** 为颜色/间距权威；从 RN `design-tokens.ts` **迁移数值**，不迁 NativeWind。

---

## 6. 里程碑 A0～A9（实施顺序）

与 [43 §9.2](./43-native-mobile-clients-architecture.md) 对齐；**建议 contract → Android/iOS 双端 → 鸿蒙跟进** 同一 fixture 名。

| 编号 | 交付物 | 三端 |
| --- | --- | --- |
| **A0** | Monorepo 子工程、`mobile-contract` 骨架、`design-tokens.json`、首批 primitive、导航壳、Preview 入口 | 三端工程可编译；v1 **双端** 必过 |
| **A1** | S-DRAWER、S-CHAT Landing、Drawer 动效 | 同左 |
| **A2** | 对话流、流式 Replay、列表性能基线 | 同左 |
| **A3** | Markdown 完成态渲染 | 同左 |
| **A4** | Process / timeline / reasoning | 同左 |
| **A5** | Composer 全 UI + HITL 静态 | 同左 |
| **A6** | Workbench 全 Tab + Sheet | 同左 |
| **A7** | Settings / MCP / Memory / Reader | 同左 |
| **A8** | 动效硬化、键盘、错误态、Reduce Motion | 同左 |
| **A9** | Gate A：benchmark + Snapshot + 十场景菜单 | **v1：Android+iOS 必过**；鸿蒙 **十场景可切换** |

---

## 7. Phase B 接口预留（只搭线，不实现）

本阶段 **必须** 预留，避免 Phase B 推倒 UI：

- **`AgentSessionPort`** 接口在三端同语义（见 43 §5.4、§6.3、§7.3、§8.3）。
- ViewModel **只依赖 Port**，不出现 Ktor/URLSession/「真」Repository。
- Android **`preview` / `production` flavor**；iOS **Debug Preview 不链 Core**（43 §16.2）— 可在 A0 建空 flavor，Phase B 再填 Core。

---

## 8. 出口标准（Gate A）

### 8.1 Preview fixture（十场景，名称固定）

见 [43 §16.3](./43-native-mobile-clients-architecture.md)；Dev Menu **同名加载**。

### 8.2 v1 必达（Android + iOS）

1. 十场景均可进入且视觉完整。  
2. **Paparazzi** / **swift-snapshot-testing** 关键屏基线通过（同一 fixture 名）。  
3. 长列表场景 **Macrobenchmark / Instruments**：≥55fps 中位数、严重掉帧 <5%（Runbook 记场景名）。  
4. **无** `mobile-core` 链接、**无** Harness HTTP/SSE。

### 8.3 鸿蒙（本阶段并行目标）

1. 十场景可演示；`core-ui` tokens 与双端一致。  
2. Snapshot 或 **手工回归清单**（可写入 `apps/harmony/docs/`）与双端 fixture 名对齐。  
3. **不阻塞** v1 Gate A 合并，但 **不豁免**「静态全量」目标——与双端同清单，仅门禁节奏不同。

### 8.4 人工回归参考

可复用并改编 [apps/mobile/docs/ui-regression-checklist.md](../apps/mobile/docs/ui-regression-checklist.md)（浮层独立、detent、Plan pill、Settings 持久化等 **交互规格**）；路由改为各端 Preview 入口。

---

## 9. 建议首批仓库增量（A0 第一周）

```text
packages/mobile-contract/
  design-tokens.json
  schema/                    # ActiveSessionState 等（可先最小 JSON Schema）
  fixtures/preview/          # 十场景 JSON（可从 RN 转录）
  README.md

apps/android/                # Compose, preview flavor
apps/ios/                    # SwiftUI, Debug Preview target
apps/harmony/                # ArkTS, entry + core-ui 骨架
```

**不要** 在 A0 引入 `packages/mobile-core` 业务代码（可选空 `settings.gradle.kts` 占位）。

---

## 10. 协作与 PR 约定

- **合并顺序**：`mobile-contract`（tokens + fixture + schema）→ **v1 双端 UI** → 鸿蒙 UI。  
- 单 PR 尽量 **单 milestone 切片**（如 A5 Composer only），带 Snapshot 或截图。  
- RN **仅 VIA 对照**（43 §3.4.5）；PR 描述注明对照的 RN 文件/Preview 路由。  
- 产品语义冲突：**Web + 36 §4** 优先于 RN。

---

## 11. 相关文档索引

| 文档 | 用途 |
| --- | --- |
| [43-native-mobile-clients-architecture.md](./43-native-mobile-clients-architecture.md) | 总架构、Port、Gate |
| [36-mobile-agent-frontend.md](./36-mobile-agent-frontend.md) | Parity ID、IA |
| [18-project-structure.md](./18-project-structure.md) | Monorepo 目录 |
| [apps/mobile/docs/ui-regression-checklist.md](../apps/mobile/docs/ui-regression-checklist.md) | 交互回归条目 |
| [apps/mobile/docs/parity-checklist.md](../apps/mobile/docs/parity-checklist.md) | RN parity 人工对照 |

---

*维护：Phase A 范围变更时同步更新 §3、§4、§8，并在 43 §9.2 保持摘要一致。*
