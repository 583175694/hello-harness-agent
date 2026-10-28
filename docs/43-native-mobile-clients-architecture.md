# Native Mobile 客户端架构方案（Android + iOS + HarmonyOS）

> 文档类型：**工程架构与交付方案**（Android / iOS / HarmonyOS 原生客户端）  
> 文档状态：**定稿 v1.7 — 实施依据**  
> 最后更新：2026-10-27  
> 关联：[11-api-protocol.md](./11-api-protocol.md)、[26-connection-durable-agent-loop.md](./26-connection-durable-agent-loop.md)、[19-agent-frontend.md](./19-agent-frontend.md)（产品语义）、[18-project-structure.md](./18-project-structure.md)  
> 范围：**`apps/android`、`apps/ios`、`apps/harmony`、`packages/mobile-core`、`packages/mobile-contract`**；**`apps/mobile`（Expo/RN）冻结**，不再作为 Release 客户端演进。

---

## 1. 背景与决策

### 1.1 背景

- 既有 `apps/mobile`（React Native + Expo）在 **长会话流式、富文本、Process 时间线、Workbench** 等场景下性能与优化上限不足。
- 行业头部 AI 客户端普遍采用 **各平台原生 UI**；跨端共享集中在 **网络 + Run 状态机 + 会话投影**（本方案为 **`mobile-core`**），而非 UI 框架。

### 1.2 核心决策

| 项 | 决策 |
| --- | --- |
| 客户端形态 | **Android、iOS、HarmonyOS 原生应用**；**v1 Gate B：Android + iOS 同时上架**；**HarmonyOS：v1.1**（架构从 Day1 预留，不推翻 Android/iOS 方案） |
| 开发节奏 | 可分工、分先后合入；**契约与 Port 按三端一致设计**；不允许任一端在 UI 层自建 Run 归约 |
| 共享层 | **KMP `packages/mobile-core`**：domain + 网络解析 + Run/会话归约，**无 UI**；含 **android / ios / ohosArm64**（鸿蒙见 §3.5、§4.7） |
| 契约层 | **`packages/mobile-contract`**：golden JSON + 期望状态，**三端共用** |
| UI | **Compose / SwiftUI / ArkUI（ArkTS）** 各一套；各端 **自建 `core-ui`**（见 §3.4）；**鸿蒙不用 CMP 画整 App** |
| 遗留 RN | **`apps/mobile` 冻结**；Native **仅 VIA 对照**（§3.4.5），不参与 Release 构建 |
| **实施顺序** | 与 RN 阶段策略一致：**Phase A 先把 UI/UX、动画、交互与性能打磨到位（无真实后端）**；**Phase B 再接入 `mobile-core`，直连部署中的 Harness 服务器** |

### 1.3 目标与非目标

**目标**

- **Phase A** 结束：**v1 指 Android + iOS**；在无后端条件下用 **Fixture / Preview** 跑通全量 Agent 工作台 **界面与交互**（鸿蒙可并行但不挡 v1 Gate A），长列表与流式 **模拟** 达到性能目标。
- **Phase B 起**：连接既有 Harness API（**直连服务器**，不在 App 内嵌 NestJS/PostgreSQL），提供与 Web `/agent` **语义等价** 的终端能力（见 §9.3）。
- Android / iOS / HarmonyOS 在 **同一 `mobile-core` 版本** 下行为一致；协议升级时 **core + contract 先绿，再发 App**。
- Release 包在长 Run、快速滚动、流式输出场景达到 **可日常使用的帧率与响应**。

**非目标（v1 架构文档不展开实现细节）**

- 在移动端本地运行 NestJS / PostgreSQL。
- 用 KMP/CMP 或 RN 做 **跨端共享 UI（整 App）**。
- 替代 Web 或 Desktop 客户端。

---

## 2. 产品与技术对齐方式

### 2.1 「v1 双端同时上线、鸿蒙 v1.1、分先后开发」的含义

```text
产品 / 发布：  v1 — Android 与 iOS 同一版本号、同一功能开关、同时 Gate B
              v1.1 — HarmonyOS 华为应用市场上架（功能仍对齐 Web §4）
工程实施：    Phase A/B 三端同构；v1 出口仅强制 Android+iOS；鸿蒙 UI 可并行但不挡 v1
```

**禁止（全生命周期）**

- 任一端在 UI 层（Compose / SwiftUI / **ArkTS**）**各自实现一套 Run 归约**（Preview 仅 **Playback 脚本**）。
- Phase B 之后：仅一端更新 `mobile-contract` / `mobile-core` 语义而不跑 golden。

**允许**

- **Phase A** 不依赖 `mobile-core`，不接 HTTP/SSE；用 **Fixture 驱动 UI**（与 RN `/preview`、fixture 菜单同思路）。
- **Phase B** 再引入 `mobile-core`；UI 只换 **Port 实现**，不重写屏幕。
- 平台特性（Widget、Live Activity 等）按端差异迭代，不阻塞另一端的 Phase A/B。

### 2.2 实施分两阶段（与 RN 一致）

| 阶段 | 目标 | 后端 |
| --- | --- | --- |
| **Phase A — UI 先行** | 导航、会话、Composer、Workbench、Settings、Reader 等 **全屏可用**；动画、键盘、Sheet、Drawer、流式 **模拟**；Markdown 原生渲染；**性能优化到极致** | **无**（不调用 API；可选 Dev Menu 切换 fixture） |
| **Phase B — 联调上线** | 接入 **`mobile-core`**；Settings 配置 **服务器 Base URL**；Session / Run / SSE / HITL / Workbench 等与 **线上或指定环境 Harness API** 打通 | **直连服务器**（与 RN 联调相同：用户/API 设置里的 URL，非 Mobile 本地起 API） |

Phase A 的 **出口标准（Gate A，v1）**：**Android + iOS** UI 回归（Snapshot / 手动矩阵）与 **Macrobenchmark / Instruments** 达标；**不**以 `readyz` 为门禁；鸿蒙 Preview **不阻塞** v1。

Phase B 的 **出口标准（Gate B，v1）**：§9.3 **B0～B7** + §11 联调门禁 + **Android / iOS 同时** 提审。  
**HarmonyOS Gate B′（v1.1）**：同一 §9.3 能力 + 华为商店；**不阻塞** v1 双端首发。

### 2.3 行为事实源（Phase B 起生效）

- **服务端 Snapshot + SSE 事件序** 为唯一事实源（与 [26-connection-durable-agent-loop.md](./26-connection-durable-agent-loop.md) 一致）。
- `mobile-core` 负责 **客户端归约**；各端 UI 只订阅 **core 输出的不可变状态快照**（或等价 Flow/AsyncStream / NAPI 推送）。
- Web 现有 TS 包（如 `agent-run-state`）可作为 **语义参考**；Mobile 以 **`mobile-contract` 金标** 为准，不强制与 TS 同仓库同进程，但 **同一输入 JSON 的归约结果必须与 contract 一致**。

---

## 3. 总体架构

### 3.1 逻辑分层

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ apps/android (Compose) │ apps/ios (SwiftUI) │ apps/harmony (ArkTS/ArkUI) │
└────────────┬───────────┴──────────┬─────────┴────────────┬───────────────┘
             │                      │                      │
             └──────────────────────┼──────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────┐
│              packages/mobile-core (KMP)                     │
│  android · ios · ohosArm64 — Domain · Data · no UI          │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│         Harness API (NestJS) · agent-protocol JSON          │
└─────────────────────────────────────────────────────────────┘

        packages/mobile-contract ──► Phase A：Preview 状态 JSON
                                 ──► Phase B：测试 mobile-core + 集成测
```

**Phase A 运行时（无网络层）**

```text
apps/android | apps/ios | apps/harmony
  UI (Compose / SwiftUI / ArkUI)
       │
       ▼
  AgentSessionPort  ◄── PreviewAgentSessionPort（读 mobile-contract/fixtures/preview）
       │
       （Phase B 替换为 CoreAgentSessionPort → mobile-core → Harness API）
       （鸿蒙：ArkTS Port → NAPI / 生成桥 → libkn.so，见 §3.5）
```

### 3.2 依赖规则

| 从 | 到 | 允许 |
| --- | --- | --- |
| `apps/android`、`apps/ios`、`apps/harmony` | `mobile-core` | ✅ 仅通过 **公开 API** + 各端 Port 适配 |
| `apps/*` | `mobile-contract` | ✅ Phase A：**Preview fixture**；Phase B：测试与联调 golden |
| `apps/*` | `mobile-core` | ✅ **仅 Phase B 起**（通过 Port；鸿蒙经 **NAPI**，UI 不 spread 依赖 core 模块） |
| `mobile-core` | `apps/*` | ❌ |
| `mobile-core` | UI 框架 | ❌ |
| `mobile-core` | `agent-protocol`（TS） | ❌ 运行时；协议形状 **人工或生成对齐** Kotlin 模型 |

### 3.3 Monorepo 目录

```text
hello-harness-agent/
  apps/
    android/                    # Gradle 根工程（Compose App）
    ios/                        # Xcode 工程 / workspace
    harmony/                    # DevEco 工程（HarmonyOS NEXT，ArkTS/ArkUI）
    mobile/                     # RN 冻结（deprecated）
    web/
    api/
  packages/
    mobile-core/                # KMP 多模块（见 §4）
    mobile-contract/            # Golden fixtures + 期望输出
    agent-protocol/             # 协议权威（TS）；Mobile DTO 与之对齐
    agent-run-state/            # TS 参考实现 + 可选导出 fixture
    …
  docs/
    43-native-mobile-clients-architecture.md   # 本文
```

**pnpm workspace**：`mobile-core`、`mobile-contract` **不**作为 npm 包发布；仍置于 `packages/` 以便与 `agent-*` 同级发现。构建由 **Gradle（Android + KMP + ohos）**、**Xcode**、**DevEco Studio** 驱动；根 CI 增加对应 job。

### 3.4 Design System（`core-ui`）— 三端 UI 策略

#### 3.4.1 原则：官方栈 + 自有组件层

| 层级 | 做法 | 不做 |
| --- | --- | --- |
| **基础** | Android **Compose + Material 3**；iOS **SwiftUI**；HarmonyOS **ArkTS + ArkUI** | Flutter、RN、**整 App 用 CMP 画鸿蒙 UI** 等跨端 UI 运行时 |
| **其上的封装** | 各端在 app 内维护 **`core-ui` 模块**（源码归仓库所有，随产品迭代） | 第三方「全家桶」UI 库替代设计系统 |
| **类比** | 与 Web **shadcn/ui** 同类意图：**Design Token + 可复用 Primitive**，组件代码 **自己拥有** | 不是再装一个与 Compose/SwiftUI 平行的 UI 框架 |

`mobile-core` **不包含任何 UI**；会话归约与 **视觉/组件** 严格分离。

#### 3.4.2 三套实现、一套视觉

三端 **各写一套** Design System，**不共享 UI 源码**：

```text
apps/android/core-ui/      Kotlin + Compose     ─┐
apps/ios/CoreUI/           Swift + SwiftUI      ├──► 同一套产品设计（同一 App 的三端版）
apps/harmony/core-ui/      ArkTS + ArkUI       ─┘
```

| 维度 | 说明 |
| --- | --- |
| **代码** | Kotlin / Swift / ArkTS **各维护** `core-ui` |
| **展示** | **应对齐**：品牌色、字阶、间距、圆角、组件状态、Composer / Workbench / Tab 信息架构 |
| **对齐手段** | **`packages/mobile-contract/design-tokens.json`** + 同一批 **`fixtures/preview`**；Android/iOS Snapshot；鸿蒙 **v1.1** 起补 UI 对照 |
| **允许差异** | **HIG / Material / 鸿蒙设计规范** 下的导航、动效、系统字体等不必像素一致 |

**业务逻辑**仅在 **`packages/mobile-core` 一份**（Phase B）；**UI 与 Design System 是三份实现**。

#### 3.4.3 模块内分层（三端同构建议）

三端 **职责划分一致**，命名可随平台习惯微调：

```text
core-ui / CoreUI
  tokens/           # 颜色、字号、行高、间距、圆角、阴影（对齐 Web/Harness design tokens）
  primitives/       # AppText、AppButton、AppIcon、AppTextField、AppSheet、AppTopBar、
                    # Badge、Spinner、Divider、ListRow …
  （可选）markdown/  # 富文本渲染入口（流式阶段仍用 primitive Text，见 §10）
feature-*/
  patterns/         # 与业务略绑：ComposerBar、ConnectionPill、MessageBubble…
                    # 可放 feature 模块，避免 design system 膨胀
```

**Phase A（A0）即建立各端 `core-ui`**：先 **tokens + 约 10 个 primitive**，再铺 Chat / Workbench；鸿蒙可与 Android/iOS **并行 A0～A9**，但 **v1 Gate A 仍只强制 Android + iOS**（§16.5）。

**Primitive 与 Feature 边界**

- **Primitive**：不含 Session/Run 语义，只认 props（如 `variant`、`enabled`）。
- **Pattern / Feature**：组合 primitive，可依赖 `AgentSessionPort` 提供的 UI 模型。

#### 3.4.4 与 RN / Web 的关系

- **`apps/web`**：产品 **行为语义** 以 Web `/agent` 为权威（[19-agent-frontend.md](./19-agent-frontend.md)、[36-mobile-agent-frontend.md](./36-mobile-agent-frontend.md) **§4**）；Native **不共用 React 组件**，通过 **token + parity 对照** 保持一致。
- **`apps/mobile`（RN）**：**Deprecated**；Native **只参考「视觉 + 信息架构 + 交互规格」**，**不继承任何 RN 技术栈或实现**（细则见 **§3.4.5**）。

#### 3.4.5 `apps/mobile`（RN）参考范围 — 仅 VIA（Visual / IA / Interaction）

> **VIA** = Visual（视觉）、Information Architecture（信息架构）、Interaction spec（交互规格）。Phase A 各端 `core-ui` / feature 实现时，以 RN 为 **已验证的 Mobile 壳对照**，而非第二套 Release 运行时。

**只参考（产品规格层 — 写入 contract / 各端 Runbook，不抄代码）**

| 类别 | 参考内容 | RN 中的典型来源（只读对照） |
| --- | --- | --- |
| **视觉** | 色板与语义色（canvas / surface / primary / userBubble / HITL / terminal 等）、明暗模式气质、圆角与间距量级、Icon 线宽与 tone | `apps/mobile/src/lib/design-tokens.ts`、`global.css`（数值须收敛到 **`design-tokens.json`**） |
| **信息架构** | Phone 主路径：会话 Drawer、顶栏（标题 + Run 摘要 + 工作台入口）、对话区 vs Workbench（分段 / Sheet）、Settings 入口、Composer 与 overlay 分层 | `chat-screen.tsx`、`session-drawer.tsx`、`chat-workbench-surfaces.tsx`、`workbench-sheet.tsx` |
| **交互规格** | 布局常量（顶栏高度、Sheet detent、默认档位）、文案与 placeholder、滚动贴底阈值、按钮反馈类型（scale CTA vs 仅背景变化） | `ui.constants.ts` 中 `AGENT_UI_LAYOUT`、`AGENT_UI_COPY`、`AGENT_UI_BEHAVIOR`、`AGENT_UI_BUTTON` |

**可迁数据、不迁代码**

| 数据 | 落点 | 说明 |
| --- | --- | --- |
| Preview 场景名与 UI 快照 JSON | `packages/mobile-contract/fixtures/preview/` | Gate A **§16.3 十场景**；RN 冻结后 **contract 为 Native Preview 唯一源** |
| Token 数值与语义名 | `packages/mobile-contract/design-tokens.json` | 三端 `core-ui` 各读；与 Web `check-design-tokens` **逐步对齐** |

**明确不继承（技术层 — Native 各端用平台原生方案重做）**

- **样式与组件运行时**：NativeWind / Tailwind class、RN 组件树、StyleSheet 组合方式。
- **动画与容器**：Reanimated、Gorhom Bottom Sheet、Expo Router 等 **API 与实现**；Native 用 Compose / SwiftUI / ArkUI 等价交互，**数值对齐本节「只参考」表与 `design-tokens.json`** 即可。
- **列表与性能路径**：FlashList、RN 内 Run 同步 / coalescer / store（如 `use-agent-host*`、`agent-run-ui-store`）。
- **Phase B 数据面**：UI **只** 依赖 **`AgentSessionPort`** + **`mobile-core`**；行为金标为 **`mobile-contract` domain golden** 与 **API / Web 语义**，**不是** RN hook 行为。

**冲突时的优先级**

```text
agent-protocol + Web /agent 产品语义  >  mobile-contract golden  >  RN 壳（VIA 对照）
```

- RN 与 Web 在 **布局或文案** 上不一致时：以 **Web + 36 §4** 为准，RN 仅作「Mobile 上曾长什么样」的辅助对照。
- RN 与 Native 在 **HIG / Material / 鸿蒙规范** 上的系统差异：**允许**（见 §3.4.2「允许差异」）。

#### 3.4.6 依赖规则（UI）

| 从 | 到 | 允许 |
| --- | --- | --- |
| `feature-*` | 本端 `core-ui` / `CoreUI` | ✅ |
| `feature-*` | 对端 `core-ui` | ❌ |
| `core-ui` | `mobile-core` | ❌（UI 层不直接依赖 core；经 ViewModel + Port） |
| `core-ui` | Material3 / SwiftUI / ArkUI 系统框架 | ✅ |

### 3.5 HarmonyOS（`apps/harmony`）— 原生扩展（不大改总架构）

在 **Phase A/B、Port、`mobile-contract`、Web §4 parity** 不变的前提下，增加 **第三条原生壳**；参考业界（如 Kimi 鸿蒙版）：**逻辑走 KMP，UI 走 ArkTS**。

#### 3.5.1 已定原则

| 项 | 结论 |
| --- | --- |
| **UI** | **ArkTS + ArkUI 原生**；自建 **`apps/harmony/core-ui`**；**不**用 Compose Multiplatform 绘制整 App |
| **逻辑** | 与 Android/iOS 共用 **`packages/mobile-core`**；增加 **`ohosArm64`** 目标 |
| **Release** | **v1.1** 华为应用市场；**不**与 Android/iOS v1 绑同一 Gate B |
| **功能** | 与 Web **§4 全矩阵** 对齐（与 Android/iOS 相同，不因晚发而砍 ID） |
| **Phase A** | **`AgentSessionPort` + Preview fixture**（与双端相同 JSON）；可无 `libkn.so` |
| **Phase B** | **`CoreAgentSessionPort`** → **NAPI / 生成桥** → `mobile-core` 产出 **`.so` + C API** |

#### 3.5.2 工程与工具链

```text
apps/harmony/
  entry/                    # Ability 入口
  features/                 # chat / workbench / settings …
  core-ui/                  # ArkUI primitives + tokens
  bridge/                   # ArkTS ↔ Kotlin/Native（NAPI，薄层）
```

| 项 | 说明 |
| --- | --- |
| **IDE** | **DevEco Studio**（工程、签名、推包）+ **Android Studio**（KMP `mobile-core` 编译 ohos 目标） |
| **系统** | **HarmonyOS NEXT**，建议 **API 17+**（随 DevEco / 社区 KMP 鸿蒙文档锁定） |
| **KMP 鸿蒙** | 采用 **社区 CPF-KMP-CMP**（或同等 **ohosArm64** 工具链）；**非 JetBrains 官方主线** — 须 **锁定版本**、评估维护方 |
| **包名** | 与 Android 对齐 **`com.harness.agent`**（华为侧 applicationId / bundle 按 DevEco 配置） |

#### 3.5.3 `mobile-core` 在鸿蒙上的集成

```text
mobile-core (ohosArm64)  →  libkn.so + libkn_api.h（或工具链等价物）
        ↑
  bridge/NAPI（apps/harmony，不写 Run 归约）
        ↑
  ArkUI ViewModel → AgentSessionPort
```

- **expect/actual**：鸿蒙 **actual** 实现 KV、文件上传、日志等（与 §4.4 表并列）。
- **Markdown 性能（可选）**：长对话可后续引入 **仓颉等原生解析库 + ArkTS 渲染**（与 Kimi 实践类似），**非 v1.1 阻塞项**。

#### 3.5.4 风险与 fallback（仅 contingency）

| 风险 | 对策 |
| --- | --- |
| 社区 KMP 鸿蒙工具链阻塞 | **短期不得** 在 ArkTS 内重写 Run 归约；可 **延后 HarmonyOS Gate B′**；极端临时方案仅 **延长 Phase A**（fixture UI），**禁止** 三端语义分叉 |
| 双 IDE / 签名复杂 | 文档化 DevEco 签名；CI 单独 **harmony** job |

---

## 4. packages/mobile-core（KMP）

### 4.1 模块划分（建议）

```text
packages/mobile-core/
  settings.gradle.kts
  build.gradle.kts
  core-common/          # 纯 Kotlin：DTO、错误码、工具函数（无 kotlinx-io 平台差异部分）
  core-domain/          # Run 状态机、Session 聚合、Conversation/Workbench 投影
  core-data/            # REST + SSE 客户端、cursor、重连策略
  core-api/             # 对外 Facade：MobileAgentEngine / SessionController 等
  core-test/            # commonTest，依赖 mobile-contract
```

**KMP 目标**：`androidTarget`、`iosArm64`（或 `iosX64`/`iosSimulatorArm64`）、**`ohosArm64`**（鸿蒙，v1.1 联调前至少编译进 CI）。

**对外暴露**：建议仅 **`core-api` + 必要 model 类型** 作为各端依赖面，内部模块 package-private。

### 4.2 core-domain 职责（必须三端一致）

- **Run 生命周期**：create / attach SSE / apply event / merge snapshot / terminal 状态。
- **Cursor 语义**：单调、去重、replay 不重复 UI 项（与 API 文档一致）。
- **Session 隔离**：切换 Session 不串 Run；并行 Session pending 隔离。
- **HITL 门禁**：clarification、tool approval、steer、follow-up 的状态与 Web 语义对齐。
- **投影模型**（UI 无关）：`ConversationItem`、`WorkbenchSnapshot`、`ComposerState`、`ConnectionState` 等 **稳定数据结构**；Compose / SwiftUI / ArkUI 只做映射与动画。

### 4.3 core-data 职责

- **REST**：Session CRUD、Run 控制、Settings、上传等（与 `@harness/agent-client` 能力对齐，Kotlin 重写）。
- **SSE**：长连接、后台断连、回前台 **Snapshot 续订**、指数退避。
- **鉴权 / Base URL**：由 **平台层注入**（Android DataStore、iOS Keychain、鸿蒙 Preferences 等）；core 只接收 `HttpClientConfig` 或接口。

### 4.4 平台 expect/actual（最小集）

| 能力 | Android | iOS | HarmonyOS |
| --- | --- | --- | --- |
| 持久化 KV | DataStore | UserDefaults + Keychain | Preferences / 安全存储 API |
| 文件上传 | 平台 File API | URLSession multipart | 鸿蒙文件 API |
| 日志 / 调试 | Timber 等（app 注入） | os.Logger（app 注入） | hilog 等（app 注入） |
| 推送 token 上报 | FCM（app） | APNs（app） | Push Kit（**v1.1**，可选） |

**原则**：expect/actual **仅 I/O 与系统服务**；业务规则不进 actual。

### 4.5 发布给 iOS 的方式

- **推荐**：Gradle `assembleXCFramework`（或 `syncFramework`）产出 **`MobileCore.xcframework`**，由 `apps/ios` 以 **Xcode Framework 依赖** 或 **Swift Package（binaryTarget / local path）** 引用。
- **版本**：与 App **同 monorepo 同 commit** 构建；Release 流水线 **先编 core，再编 Android / iOS**（鸿蒙 **v1.1** 起纳入同 core 构建 job）。

### 4.6 公开 API 形态（示意）

```kotlin
// core-api：示意，实施时以代码为准
interface HarnessMobileEngine {
    val sessions: StateFlow<SessionListState>
    fun selectSession(sessionId: String)
    val activeSession: StateFlow<ActiveSessionState?>  // conversation + workbench + composer + connection
    suspend fun submitUserMessage(input: UserMessageInput): Result<Unit>
    suspend fun cancelActiveRun()
    // HITL、附件、Settings 等按里程碑扩展
}
```

iOS 侧通过 Kotlin **Flow → AsyncStream / Combine** 适配（可用 KMP-NativeCoroutines 或薄 Swift wrapper）。

### 4.7 发布给 HarmonyOS 的方式（v1.1）

- **KMP 目标**：`ohosArm64()`（工具链见 **§3.5.2**），产出 **`libkn.so`** 及 **C 导出头**（具体名以工具链为准）。
- **集成**：`apps/harmony/bridge` 通过 **NAPI** 加载 `.so`；ArkTS **仅** 调用 **`HarnessMobileEngine` 等价 API**（与 §4.6 同语义），不复制 domain。
- **与 iOS 差异**：iOS 用 XCFramework + Swift；鸿蒙用 **.so + NAPI + ArkTS Port**，**共用同一份 commonMain 归约**。
- **core-test**：**`commonTest` 在 JVM（android 等 target）跑 domain golden**；**`ohosArm64` 至少编译进 CI**，设备或模拟器 golden / 冒烟按工具链文档配置（**勿假设** ohos 与 JVM 同一测试 runner 一次跑全）。

---

## 5. packages/mobile-contract

### 5.1 内容

```text
packages/mobile-contract/
  README.md
  fixtures/
    preview/              # Phase A：ActiveSessionState 等 UI 快照（多场景菜单）
    run-events/           # Phase B：SSE event JSON 序列
    snapshots/            # Phase B：REST snapshot 响应
    session-states/       # 可选：中间状态
  expected/
    domain/               # Phase B：归约后的 UI-agnostic 状态 JSON
  schema/                 # 可选 JSON Schema（Preview + Domain 共用字段定义）
  tools/                  # 可选：校验脚本（Gradle task / Node 只读校验）
```

**Phase A 数据来源**：优先从 `apps/mobile` 已有 preview fixture **迁移或转录** 到 `fixtures/preview/`，保证 Native 与 RN 对照同一产品语义；RN 冻结后 **以 `mobile-contract` 为 Native Preview 唯一源**。

### 5.2 使用方式

- **Phase A**：Android / iOS / HarmonyOS **PreviewAgentSessionPort** 加载 **同一** `fixtures/preview/*.json`；Dev Menu 切换场景。
- **Phase B — mobile-core `core-test`**：`applyEvents(...) == loadExpected(...)`。
- **CI 门禁**：Phase A 触达 contract 跑 **preview schema 校验**；Phase B 起 **全量 domain golden** 必过。
- **Android / iOS 集成测**：Phase B 抽样 1～2 个 fixture 端到端；主门禁在 core。

### 5.3 与 TS 包关系

- 可从 `packages/agent-run-state` 测试 **导出** 或 **复制** 事件序列到 `fixtures/`（一次性或脚本同步），但 **Mobile Release 不依赖 Node 运行时**。
- 协议字段变更：**先改 `agent-protocol` + contract fixture，再改 mobile-core，最后改三端 UI**。

### 5.4 `AgentSessionPort` 与 schema 归属

| 层 | 归属 | 说明 |
| --- | --- | --- |
| **Run / SSE 归约、REST 调用** | `packages/mobile-core`（`HarnessMobileEngine` / `core-api`） | 与 Web `@harness/agent-client` **能力对齐**，Kotlin 实现；**不**进各端 UI 模块 |
| **UI 订阅面** | 各端 **`AgentSessionPort`**（Preview / Core 两种实现） | Phase A：`PreviewAgentSessionPort`；Phase B：`CoreAgentSessionPort` 包装 Engine |
| **Preview / golden 字段** | `packages/mobile-contract`（`schema/` + `fixtures/`） | **`ActiveSessionState` 等与 UI 快照同结构**；Engine 输出投影 **须能通过 schema 校验** |
| **协议源** | `packages/agent-protocol` | TS 为 Web/API 权威；Mobile DTO **手写 Kotlin + golden**，变更顺序：**agent-protocol → contract → mobile-core → Port/UI** |

---

## 6. apps/android

### 6.1 工程结构（建议）

```text
apps/android/
  settings.gradle.kts       # include mobile-core composite build
  build.gradle.kts
  app/                      # applicationId: com.harness.agent
  feature-chat/
  feature-workbench/
  feature-settings/
  feature-auth/             # 若 R1 无 OAuth，可为 API Key / 本地 user 占位
  core-ui/                  # Design System：tokens + primitives（§3.4）；Markdown 渲染入口可选放此
  core-navigation/
```

### 6.2 技术栈

| 类别 | 选型 |
| --- | --- |
| UI | Jetpack Compose、Material 3、Navigation Compose；**`core-ui` 自有组件层**（§3.4） |
| 架构 | MVVM 或 MVI；ViewModel 依赖 **`AgentSessionPort`**（Phase A：Preview；Phase B：Core 适配） |
| 异步 | Kotlin Coroutines；收集 core 的 Flow |
| 本地 | DataStore（偏好）、Room（可选：会话草稿 / cursor 缓存） |
| 网络 | 由 mobile-core 提供；App 不直接写 SSE |
| Markdown | **原生模块**（Compose + 专用解析/布局；流式阶段纯 Text） |
| 测试 | JVM unit（UI 映射）、Instrumented（关键流）、Macrobenchmark（长列表） |

### 6.3 UI 与数据 Port（Phase A / B 切换）

**Phase A**（默认 Debug / Preview 构建）：

```kotlin
// DI：不接 mobile-core
val sessionPort: AgentSessionPort = PreviewAgentSessionPort(
    fixtureLoader = MobileContractPreviewLoader(context),
)
```

**Phase B**（Release / 联调构建）：

```kotlin
val sessionPort: AgentSessionPort = CoreAgentSessionPort(
    engine = HarnessMobileEngineFactory.create(
        config = EngineConfig(
            baseUrl = dataStore.apiBaseUrl,  // 用户 Settings 或默认部署 URL
            authProvider = androidAuthProvider,
            platformServices = AndroidPlatformServices(context),
        ),
    ),
)
```

Compose 树 **只依赖 `AgentSessionPort` + 与 contract schema 对齐的 UI 模型**，禁止 Screen 直接引用 Ktor/SSE。

---

## 7. apps/ios

### 7.1 工程结构（建议）

```text
apps/ios/
  Harness.xcodeproj / Harness.xcworkspace
  Harness/                  # App target，bundleId: com.harness.agent
  Features/
    Chat/
    Workbench/
    Settings/
  CoreUI/                   # Design System：tokens + primitives（§3.4）
  CoreNavigation/
  MobileCoreBridge/         # Swift：Engine 生命周期、Flow 适配
```

### 7.2 技术栈

| 类别 | 选型 |
| --- | --- |
| UI | SwiftUI；必要时 UIViewControllerRepresentable；**`CoreUI` 自有组件层**（§3.4） |
| 架构 | Observation / `@Observable` ViewModel，依赖 **`AgentSessionPort`**（与 Android 同语义） |
| 异步 | Swift Concurrency；AsyncStream 消费 KMP Flow |
| 本地 | SwiftData 或 UserDefaults + Keychain |
| Markdown | TextKit / 自建 Swift 渲染；流式阶段 `Text` |
| 测试 | XCTest；Snapshot 测关键屏 |

### 7.3 UI 与数据 Port（Phase A / B 切换）

- **Phase A**：`PreviewAgentSessionPort` 读 `mobile-contract/fixtures/preview`；**不链接** `MobileCore.xcframework`。
- **Phase B**：`CoreAgentSessionPort` 包装 KMP Engine；Xcode Build Phase 引入 **预构建 XCFramework**。
- **Swift 层禁止**复制 Run 归约逻辑；仅 **Port 适配 + 平台 UX**（键盘、Safe Area、Haptics）。

---

## 8. apps/harmony（HarmonyOS NEXT）

> 架构总览见 **§3.5**；与 Android/iOS 共用 **Phase A/B、Port、`mobile-contract`、Web §4**；**v1.1 Gate B′**，不阻塞 v1 双端。

### 8.1 工程结构（建议）

```text
apps/harmony/
  AppScope/
  entry/                      # EntryAbility
  features/                   # chat / workbench / settings
  core-ui/                    # ArkUI tokens + primitives（§3.4）
  bridge/                     # NAPI → mobile-core (libkn.so)
```

### 8.2 技术栈

| 类别 | 选型 |
| --- | --- |
| UI | **ArkTS + ArkUI**；**`core-ui` 自有组件层** |
| 架构 | MVVM 或等价；ViewModel → **`AgentSessionPort`** |
| 逻辑 | Phase B：**NAPI** 调 **`packages/mobile-core`（ohosArm64）** |
| 工具 | **DevEco Studio**（hap 构建、签名）；KMP 编译在 **Gradle / AS** |
| 测试 | UI 自动化按 DevEco / Hypium 等选型（**v1.1 前写入 Runbook**） |

### 8.3 Port（与 §6.3 / §7.3 同语义）

- **Phase A**：`PreviewAgentSessionPort` 读 `mobile-contract/fixtures/preview`；**不加载** `libkn.so`。
- **Phase B（Gate B′）**：`CoreAgentSessionPort` → **bridge/NAPI** → `HarnessMobileEngine`。

---

## 9. 实施顺序与里程碑

与 **`apps/mobile`（RN）实施节奏对齐**：**先把界面与交互做到可发布级体验，再对接 Harness 服务器**。v1 **同一 B 编号** 以 **Android + iOS** 一起验收；允许个人先合单端 PR，但 **Gate A / Gate B 出口必须双端同时满足**（鸿蒙跟 **Gate B′**，见 §9.3.1）。

### 9.1 总览

```text
Phase A（UI / UX / 性能）  ──►  Phase B（mobile-core + 直连 API）  ──►  v1 Gate B（Android + iOS 同时上架）
     无 HTTP/SSE                    Settings Base URL → 服务器              └──► v1.1 Gate B′（HarmonyOS，不挡 v1）
     Fixture + 流式模拟              SSE / Snapshot / HITL 真联调
```

| 维度 | Phase A | Phase B |
| --- | --- | --- |
| `mobile-core` | 不接入运行时（可并行写骨架，不阻塞 UI） | **必须**接入，为唯一归约层 |
| `mobile-contract` | `fixtures/preview/` 驱动 UI | `run-events` + `expected/domain` 锁行为 |
| 后端 | **无** | **直连 Harness API 服务器**（Settings 配置 URL；与 RN 联调方式一致） |
| 性能门禁 | Macrobenchmark / Instruments / 长 fixture 滚动 | 在真 API 下复测长 Run |

### 9.2 Phase A — UI / UX / 动画 / 交互（无后端）

> **实施任务书**：[44-native-mobile-phase-a-static-ui.md](./44-native-mobile-phase-a-static-ui.md)（静态 UI 全量、屏幕/状态/组件清单、Gate A 出口）。

**目标**：在不依赖网络的情况下，把 Agent 工作台 **所有用户可见路径** 做完整，并把 **滚动、流式模拟、Sheet 动画、键盘** 等优化到 Native 上限。

| 编号 | 交付（Android + iOS 并行） | 参考（RN 路径） |
| --- | --- | --- |
| **A0** | 工程脚手架、**`core-ui` / `CoreUI`（tokens + 首批 primitive）**、导航壳、Dev Preview 入口 | 脚手架 + Preview 路由 |
| **A1** | 会话列表 / Session Drawer、空态 Landing、切换动画 | Session UI fixture |
| **A2** | 对话流：用户气泡、Assistant 文本、**流式模拟**（定时器 / 脚本回放）、FlashList 等等价优化 | 长会话 fixture、滚动压测 |
| **A3** | Markdown / 代码块 / 公式（完成态）；流式阶段纯文本 | `MarkdownView` 对齐 Web |
| **A4** | Process 时间线、tool_activity 内联、Reasoning / CoT 块 | legacy blocks / timeline fixture |
| **A5** | Composer 全 UI：模型菜单、推理、附件区、Skill、Plan 浮卡、HITL/澄清 **静态态** | Composer modes fixture |
| **A6** | Workbench 全 Tab UI（Activity / Sources / Report / Artifact / Context）+ Sheet（**Phone 分段 IA**） | Workbench fixture |
| **A7** | Settings / MCP **表单 UI**（可本地假保存）、Reader / Report 预览 | Settings 静态、Reader |
| **A8** | 动效与交互硬化：BottomSheet、键盘联动、连接态 Pill（假状态）、错误/空态 | 交互 polish |
| **A9** | **性能 sign-off**：长 thread（20+ turn）、大 Markdown、快速开关 Workbench；双端 benchmark 达标 | RN 性能痛点对标 |

**Phase A 技术要点**

- ViewModel **只依赖 `AgentSessionPort`**；Preview 实现可内置 **ReplayController**（按 tick 推进 `fixtures/preview` 中的流式字段）。
- **禁止** Phase A 为赶进度引入真实 HTTP；避免 UI 与 API 形态耦合。
- **`apps/mobile`**：作 **视觉与交互对照**；fixture 迁移到 `mobile-contract/fixtures/preview`。

**Phase A 出口（Gate A）**

1. Preview 菜单（或 Dev Menu）可切换 **§16.3 所列 10 个** fixture 场景。  
2. Android Macrobenchmark + iOS Instruments：长列表基准场景 **≥55fps 中位数、严重掉帧 <5%**（各端 Runbook 记录同一场景名）。  
3. 双端 **截图 / Snapshot 测试** 通过（同一 fixture 名称，双端各一套基线）。  
4. **不要求** API `readyz`、不要求 `mobile-core` 链接。

### 9.3 Phase B — 接入服务器与 `mobile-core`

**目标**：Settings 配置 **服务器 Base URL** 后，与 Web 共用同一 Harness API；Run / SSE / Snapshot / HITL 等 **语义由 mobile-core 归约**，UI **仅替换 Port 实现**。

| 编号 | 交付 | 双端标准 |
| --- | --- | --- |
| **B0** | `mobile-core` 最小可用 + `mobile-contract` domain golden；`CoreAgentSessionPort` 接 UI | contract 单测绿；双端能 **配置 URL** 并通过 **`GET /readyz`（M-SVC-1）**；`/health` 仅作辅助 |
| **B1** | Session CRUD、列表与 Drawer **真数据** | 与服务器状态一致 |
| **B2** | `createRun` + SSE + Snapshot 恢复 + Cancel；对话 text + tool_activity | cursor 单调、replay 不重复 UI 项 |
| **B3** | Composer 全量联调（模型、推理、附件上传、提交队列） | 与 Web 同 Session 对照 Snapshot |
| **B4** | HITL：clarification、tool approval；`controlRun`（steer / follow-up 等按产品开） | contract + 手工矩阵 |
| **B5** | Workbench 真数据：Sources、Report、Artifact 版本链、Activity 定位 | 内联 Tool 点击 **3s 内** 定位 `toolCallId`（常网） |
| **B6** | Settings MCP 真 CRUD + Test；杀进程 / 切后台恢复 | 与 [26-connection-durable-agent-loop.md](./26-connection-durable-agent-loop.md) 一致；**推送（FCM/APNs/Push Kit）v1 不做**，见 §16.1 |
| **B7** | 监控（Sentry 等）、商店包、E2E 矩阵 | **Android + iOS 同时提审、同时上线**（**不含 HarmonyOS**） |

**Phase B 后端约定**

- **只连远程 Harness API**（开发/预发/生产由 Settings 或构建 flavor 决定）；Mobile **不**打包、不启动 NestJS/PostgreSQL。
- 鉴权方式与当前 API 部署一致（local user / token 等）；细节在 Settings Phase B 实现，本文不锁。
- 联调验收：同一 `sessionId` / `runId` 下，Mobile 与 Web 以 **服务端 Snapshot** 为准对照（与 RN [42-mobile-api-integration-plan.md](./42-mobile-api-integration-plan.md) 协作方式相同）。

**Phase B 出口（Gate B / Release）**

1. §9.3 **B0～B7** 完成。  
2. `mobile-core` 全量 golden 绿；双端集成测抽样绿。  
3. §11 联调门禁 + 真机矩阵（长 Run、大附件、弱网恢复）。  
4. **Android / iOS 同一版本号** 上架。

### 9.3.1 HarmonyOS（v1.1 — Gate B′）

在 **v1 Gate B 完成後**，鸿蒙按 **同一 B0～B7 能力** 验收（功能不减），额外满足：

| 项 | 标准 |
| --- | --- |
| **UI** | ArkTS 原生；**§16.3 十场景** Preview + 真 API 联调 |
| **core** | `ohosArm64` 与 android **同一 golden** 绿 |
| **上架** | **华为应用市场**（签名、隐私政策与 Android 同产品表述） |

鸿蒙 **A0～A9 可与 v1 并行**，但不作为 **v1 Gate A** 的阻塞项。

### 9.4 Phase A 与 Phase B 的并行关系

```text
时间线（建议）：

  mobile-core 骨架 + contract schema     ────► 可与 A0～A2 并行，但不阻塞 Preview
  Phase A（A0～A9）                      ────► 主战场：v1 双端 UI 组（鸿蒙可并行）
  Phase B（B0～B7）                      ────► Gate A 通过后启动；UI 改动以 Port 适配为主
  HarmonyOS Gate B′（v1.1）            ────► v1 双端首发后；core 已含 ohosArm64
```

- **UI 组** 在 Phase A 全力做体验；**Core 组** 可在 A 阶段编写 `mobile-core`（含 **ohosArm64 骨架**）与 golden，**默认不接入 App 主路径**，直至 B0。
- **鸿蒙 UI** 可在 v1 周期内并行 **A0～A9**，但 **Gate A / Gate B 以 Android+iOS 为准**。
- Phase B 中 **禁止** 大规模改 Screen 结构；若必须改，须同步更新 preview fixture，避免 Preview 回归失效。

### 9.5 与 RN 里程碑对照（便于迁移思维）

| RN（[36 §13](./36-mobile-agent-frontend.md) 思路） | Native |
| --- | --- |
| 静态 UI / Preview / fixture 回归 | **Phase A（A0～A9）** |
| P1 Settings URL + Session CRUD | **B0～B1** |
| P2 SSE + Snapshot + cancel | **B2** |
| P3 Composer 全量 | **B3** |
| P4 HITL | **B4** |
| P5 Workbench | **B5** |
| P7 MCP Settings | **B6** |
| P8 推送（**v1.1**）、Maestro、硬化 | **B6～B7**（推送不进 v1 B6） |

**RN `apps/mobile`**：不参与 Gate；Preview fixture 可 **迁移** 至 `mobile-contract`。

---

## 10. UI 与性能策略（三端统一原则）

| 原则 | Android | iOS | HarmonyOS（v1.1） |
| --- | --- | --- | --- |
| 流式正文 | 未结束前 **Plain Text**，结束后再 Markdown | 同左 | 同左 |
| 列表 | `LazyColumn` + stable key + 尾部增量更新 | `LazyVStack` / `List` + 等价策略 | `List` / `LazyForEach` + stable key + 尾部增量 |
| 状态订阅 | 仅对话屏订阅 `activeSession`；Workbench 分订阅 | 同左 | 同左 |
| 重渲染 | 避免整页随 token 刷新；tail 字段隔离 | 同左 | 同左 |
| tail 合并 | 约 **~100ms** 批量刷新 tail 字段 | 同左 | 同左 |
| 动画 | 复杂链式动画让位于 SSE 吞吐 | 减少大面积 blur/动画 | 同左 |

具体数值（节流 ms、列表 prefetch）在实现阶段写入各端 **性能 Runbook**，本文不锁死。

---

## 11. 测试与质量门禁

**Phase A**

```text
packages/mobile-contract/fixtures/preview
        │
        ├── apps/android   Snapshot + Macrobenchmark + Preview 场景切换
        ├── apps/ios       Snapshot + Instruments + Preview 场景切换
        └── apps/harmony   Snapshot / 手工矩阵 + Preview 场景切换（**不阻塞 v1 Gate A**）
```

**Phase B**（在 Phase A 门禁之上追加）

```text
packages/mobile-contract  domain golden
        │
        ▼
packages/mobile-core       core-test (commonTest + ohosArm64 编译/设备 golden)  ── 必过
        │
        ├── apps/android    unit + androidTest + 真 API 集成测抽样
        ├── apps/ios        unit + ui test + 真 API 集成测抽样
        └── apps/harmony    Hypium / 手工真 API 矩阵（**v1.1 Gate B′**；Maestro **不适用**）

API：直连 **Settings 配置的 Harness 服务器**（dev/staging/prod）；用例描述三端共用，实现各端各写
```

| 门禁 | Phase | 说明 |
| --- | --- | --- |
| preview fixture schema 校验 | A | PR 触达 `fixtures/preview` 必跑 |
| Snapshot / Benchmark | A | **v1 Gate A**：Android + iOS 必须绿；鸿蒙抽样 |
| `mobile-core` 全量 golden | B | PR 触达 core / domain expected 必跑（含 **ohosArm64** 编译） |
| Android `./gradlew check` | A+B | lint、unit；connected 以 B 为主 |
| iOS `xcodebuild test` | A+B | 同上 |
| HarmonyOS Hypium / 手工 | B′ | **v1.1**；与 §16.4 对齐 |
| 版本对齐 | B / B′ | 同一 Git tag：**core 版本 = 各端依赖版本**（v1 双端同号；鸿蒙 v1.1 可独立 build 号） |
| **Maestro E2E** | B | **仅 Android + iOS**；Release / nightly |

---

## 12. CI / Release（概要）

**Phase A（可选 CI）**

- 仅编 Android / iOS **Preview 构建**（无 XCFramework）；跑 Snapshot + benchmark 抽样。

**Phase B / Release（必须）**

1. **Build mobile-core**（Android artifact + XCFramework）。  
2. **并行** `apps/android` assembleRelease、`apps/ios` archive（**Core 构建变体**）。  
3. **同一版本号**（如 `1.0.0`）提交 Store；功能开关服务端控制（可选）。  
4. **最低 OS**：Android **minSdk 26**；iOS **17.0+**（双端 Release 一致声明）。

应用 ID：**`com.harness.agent`**（与历史 RN 一致，便于 Maestro / 用户覆盖安装策略后续再定）。

---

## 13. 安全与配置

- **API Key / Token**：只存平台安全存储；不进 core 日志。
- **TLS**：生产禁止明文 HTTP；Debug 可允许用户自签（Settings 显式开关）。
- **证书锁定**：视威胁模型 Phase 2 再加。

---

## 14. 与遗留 `apps/mobile` 的关系

| 项 | 说明 |
| --- | --- |
| 状态 | **Deprecated**，不删库，不随 Native 功能演进 |
| 用途 | **仅 VIA 对照**（§3.4.5）：视觉 / IA / 交互规格；parity 人工对照；Preview fixture 迁移源；**不**作 Release 运行时 |
| 文档 | [36-mobile-agent-frontend.md](./36-mobile-agent-frontend.md)、[42-mobile-api-integration-plan.md](./42-mobile-api-integration-plan.md) 中 RN 路径以 **本文** 为 Release 依据；联调细节仍可参考 API 章节 |
| 共享 TS 包 | Web 继续使用；Mobile Release **不依赖** RN 运行时，但 **`agent-protocol` 仍为协议源** |

---

## 15. 并行开发协作建议

| 角色 | Phase A | Phase B |
| --- | --- | --- |
| **UI（Android / iOS / HarmonyOS）** | v1：**Android+iOS** A0～A9；鸿蒙可并行 | v1：双端 Port；**v1.1：鸿蒙 Port + NAPI** |
| **Core** | 可选：schema + `mobile-core` 骨架、domain golden **不接入 App** | 主责 B0～B2；API 变更第一响应 |
| **Contract** | `fixtures/preview` 与 schema | `run-events` + `expected/domain` |
| **QA** | Snapshot、benchmark、Preview 场景表 | 双端 + Web 对照 Snapshot；真机 API 矩阵 |

**Phase A 合并顺序**：`mobile-contract/preview` → **v1 双端 UI**（鸿蒙可选并行）；**不要求** mobile-core。

**Phase B 合并顺序**：contract（domain）→ mobile-core → Port 适配 → UI **同一 PR 或连续 PR**；**禁止** 仅合 UI 不改 contract/core 的 **语义** 变更。

**接口冻结点**：Gate A 前冻结 **Port 与 Preview 模型**；Gate B 前每个 **B 编号** 开始前短冻结 **`HarnessMobileEngine` public API**。

---

## 16. v1 已决事项（功能跟 Web，技术跟业界默认）

> **规则**：功能与 [36-mobile-agent-frontend.md](./36-mobile-agent-frontend.md) **§4 Parity 矩阵** + [19-agent-frontend.md](./19-agent-frontend.md) 语义对齐；技术选型采用常见工程默认，实施中无特殊理由不得偏离。

### 16.1 功能范围（Gate B / Release）

| 类别 | v1 结论 |
| --- | --- |
| **Parity 来源** | **36 §4** 全部 ID：**M-SVC、M-SES、M-RUN、M-CONV、M-CMP、M-FILE、M-ART、M-RPT、M-SET、M-PND** |
| **Workbench Tab** | **Activity / Artifact / Sources / Report / Context**；**不实现 Debug Tab**（Web 生产无 Debug；Context 为正式入口） |
| **Workbench 行为** | 与 Web WorkbenchShell 一致：auto-open、pinned/follow、`FOCUS_WORKBENCH_TARGET`、降级提示 |
| **Bash 终端 UI** | 与 Web **只读展示 + 复制**（`BashTerminalPanel` 语义），**不提供交互式 shell 输入** |
| **MCP Settings** | 全 CRUD + Test（M-SET-3～5） |
| **OAuth / 多租户** | **不做**（Web R1 无账号体系） |
| **Memory / Delegation / Skills UI** | **Web 未落地则不显示** |
| **Mobile 本地 API/DB** | **不做** |
| **Widget / Live Activity / 本地推送** | **v1 不做**（与 Web 无 parity；推送可 v1.1 再议） |
| **iPad** | **v1 不做专属 IA**（不实现 Pad 并排；**仅 iPhone 竖屏** 信息架构与布局优化；iPad 可安装但不单独验收，**v1.1** 再补 Pad 并排） |
| **深链 M-SES-6** | **`harness://agent?session={id}`**（Custom URL Scheme）；Universal Links **v1.1** |
| **v1 Parity 范围** | **[36 §4](./36-mobile-agent-frontend.md) 矩阵全量**（不因 iPad 削减 ID） |
| **Pad / 大屏 IA** | **[36 §5](./36-mobile-agent-frontend.md) Pad 并排等信息架构延至 v1.1**；v1 仅 **iPhone 竖屏** 优化（见下行 iPad 项） |
| **Phase A** | 上述 **所有屏幕与主要状态** 均有 UI + Preview fixture；**无 HTTP**（M-DEV-1） |

### 16.2 技术默认（v1）

| 主题 | 选型 |
| --- | --- |
| **min OS** | Android **minSdk 26**；iOS **17.0+** |
| **Android** | Compose + Material 3；**MVVM** + **StateFlow**；**Hilt** |
| **iOS** | SwiftUI + **`@Observable`** + **NavigationStack**；DI 以 **composition root / 轻量 Factory** 为主 |
| **KMP 网络** | **Ktor Client**（REST + SSE） |
| **iOS 接 KMP** | **XCFramework**；Flow → Swift：**SKIE** 或 **KMP-NativeCoroutines** |
| **协议 DTO** | **手写 Kotlin**，与 `agent-protocol` 对齐；**golden 守门**（v1 不做 codegen） |
| **Preview / Core 模型** | **同一 schema**（`mobile-contract/schema`）；Preview JSON 与 `ActiveSessionState` **同结构** |
| **`AgentSessionPort`** | UI 唯一数据入口；Phase B 内接 `HarnessMobileEngine` |
| **本地持久化** | **DataStore / UserDefaults + Keychain**（URL、偏好）；v1 **可不建 Room/SwiftData**，恢复以 Snapshot 为主 |
| **构建变体** | Android **`preview` / `production` flavor**；iOS **Debug（Preview，不链 Core）/ Release（链 Core）** |
| **Markdown** | 流式 **纯文本**；完成后渲染：Android **Markwon 或 Compose 自研层**；iOS **MarkdownUI 或 TextKit 自研**；Report **v1 不用 WebView** |
| **流式 UI 刷新** | tail 更新约 **100ms** 合并（与 RN 现网同量级） |
| **Design Token** | **`packages/mobile-contract/design-tokens.json`** 为数值权威；**三端**各自读取；与 Web `check-design-tokens` **逐步对齐** |
| **Primitive 首批（A0）** | AppScaffold、AppTopBar、AppText、AppButton、AppIcon、AppTextField、AppSheet、ListRow、Badge、Spinner、Divider |
| **Snapshot 测试** | Android **Paparazzi**；iOS **swift-snapshot-testing** |
| **E2E** | **Maestro**（`com.harness.agent`）；Phase B **3～5 条** 真 API 用例 |
| **监控** | **Sentry** 双端（Crash + 性能）；DSN 见 **§17** |
| **TLS** | 生产 HTTPS；Debug 允许 Settings 填 **HTTP/LAN**；**v1 不做证书锁定** |
| **鉴权** | 与现 API **local user** 一致；Token/Header 注入 `mobile-core`，**无 OAuth UI** |
| **默认 Base URL** | Release **空**（用户必填）；**Debug flavor 内置团队 staging API 基址**（`buildConfig` / xcconfig，**不进入 Release**） |
| **上架策略** | Gate B 后 **TestFlight + Google Play 内部测试** 一轮，再提交 **公开商店**（双端同一版本号） |
| **Maestro CI** | **不阻塞** 日常 PR；**Release 分支 / nightly** 必跑 §16.4 所列 E2E（**仅 Android / iOS**） |

### 16.3 Phase A Preview fixture（Gate A 必含 10 个）

文件名建议置于 `packages/mobile-contract/fixtures/preview/`，**三端** Dev Menu 同名加载。

| 文件名（建议） | 覆盖能力 |
| --- | --- |
| `empty-landing.json` | 空会话、Landing |
| `streaming-assistant-tail.json` | 流式中、纯文本 tail |
| `long-thread-scroll.json` | 长列表压测（20+ turn） |
| `process-timeline-tools.json` | Process / tool_activity / reasoning |
| `hitl-clarification.json` | Composer 澄清静态 |
| `hitl-tool-approval.json` | 工具审批列表 |
| `workbench-activity-bash.json` | Workbench Activity + Bash 只读终端 |
| `workbench-report-markdown.json` | Report / 大 Markdown |
| `workbench-sources.json` | Sources Tab |
| `connection-offline-error.json` | 连接态 / ProblemDetails 展示 |

RN `apps/mobile` preview 可向上述名称 **迁移或映射**（对照表可在实现时补 README）。

### 16.4 CI / 门禁（v1 / v1.1）

| 阶段 | 必跑 |
| --- | --- |
| **Phase A（v1 Gate A）** | preview schema 校验；Paparazzi / snapshot；benchmark **抽样**（Gate A 场景）；**Android + iOS** |
| **Phase B（v1 Gate B）** | `mobile-core` **全量 golden**（JVM commonTest + **ohosArm64 编译**）；`:app:check` + `xcodebuild test`；Release 前 **Maestro 3～5 条** |
| **Gate B′（v1.1 鸿蒙）** | 同上 core golden；**Hypium 或手工**真 API 冒烟；**不用 Maestro** |

Job 命名在 CI 落地时写入仓库 workflow，**不阻塞架构开工**。

### 16.5 HarmonyOS（v1.1）已决

| 项 | 结论 |
| --- | --- |
| **上架节奏** | **v1.1**；**不**与 Android/iOS v1 同一 Gate B |
| **UI 路线** | **ArkTS + ArkUI 原生** + `core-ui`；**不用 CMP 画整 App** |
| **逻辑** | **`mobile-core` + `ohosArm64`**；ArkTS **NAPI 桥**，禁止 ArkTS 内 Run 归约 |
| **功能** | **Web §4 全矩阵**（与 v1 双端相同） |
| **推送** | **Push Kit** 等与 **v1.1** 一并评估（v1 双端 **不做** 推送） |
| **工具链** | **社区 KMP 鸿蒙**（如 CPF-KMP-CMP）；**版本锁定** + §3.5.4 fallback |
| **Gate A（v1）** | **仅强制 Android + iOS**；鸿蒙 Preview **不阻塞** v1 |
| **min API** | **HarmonyOS NEXT API 17+**（随工具链文档微调） |
| **Markdown 增强** | 仓颉等 **可选**（v1.1 后性能迭代） |

---

## 17. 运维与配置（非架构待定）

架构与 v1 产品范围 **已全部闭合**（§16）。实施 Phase B / Release 前需准备：

| 项 | 动作 |
| --- | --- |
| **Staging URL** | 在 Android `buildConfig` / iOS xcconfig 填入团队联调基址（Debug only） |
| **Sentry** | 创建项目，Android / iOS DSN 写入 CI Secrets 或本地未提交配置 |
| **Maestro** | 安装 CLI；nightly / release 流水线配置 §16.4 E2E（Android / iOS） |
| **商店** | Apple / Google 开发者账号、**TestFlight / 内部测试** 轨道 |
| **HarmonyOS（v1.1）** | **华为开发者账号**、DevEco **签名**、应用市场素材；**CPF-KMP-CMP**（或选定工具链）版本 pin |

---

## 18. 摘要

- **三端原生 UI + 一份 KMP `mobile-core` + `mobile-contract`**；Run 归约 **仅在 Phase B 由 core 承担**；UI 为 **Compose / SwiftUI / ArkUI** 上各自 `core-ui`，视觉对齐、**代码不共享**（§3.4）。  
- **HarmonyOS**：**ArkTS 原生 + NAPI 接 core**（§3.5、§8）；**v1.1 Gate B′**，不推翻 Android/iOS 方案。  
- **实施顺序与 RN 一致**：Phase A fixture UI → Phase B 直连服务器；**v1 Gate B = Android + iOS**；**Gate B′ = 鸿蒙**。  
- 目录：**`apps/android`、`apps/ios`、`apps/harmony`、`packages/mobile-core`、`packages/mobile-contract`**。  
- **v1 范围与技术默认**：§16；**鸿蒙**：§16.5；运维：§17；Port：§5.4。

---

*文档维护：Native Mobile 架构变更请更新 §2.2、§3.4（含 §3.4.5 RN/VIA）、§3.5、§8、§9、§16 与 Port 约定（§5.4、§6.3、§7.3、§8.3）。*
