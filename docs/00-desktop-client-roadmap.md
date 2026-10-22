# Desktop Agent Client Roadmap / 总指挥文档

> 文档状态：**权威路线图**（Desktop 客户端产品范围、优先级与多端分工）。实际完成状态以 [implementation-status.md](./implementation-status.md) 为准。  
> Agent Kernel、Host 能力与 R1 边界以 [00-agent-core-roadmap.md](./00-agent-core-roadmap.md) 为准；Web 行为语义以 [19-agent-frontend.md](./19-agent-frontend.md) 为准。  
> 最后更新：2026-10-21（P1 增补 Browser/Computer Use、MCP stdio、本机 Skills；Subagent 移出本文）  
> 关联：[36-mobile-agent-frontend.md](./36-mobile-agent-frontend.md)（Mobile parity）、[42-mobile-api-integration-plan.md](./42-mobile-api-integration-plan.md)、[implementation-status.md](./implementation-status.md) § L6 / C8  

本文定义 **Harness 桌面 Agent 客户端** 的产品方向、标配能力、差异化分档与落地顺序；不替代 Web 契约，不定义实现技术栈。Mobile 并列分轨见 doc 36。

---

## 1. 规划原则

### 1.1 客户端在体系中的角色

```text
Host（NestJS + Run/SSE/HITL/Tool）
        ^
        | 同一 API、同一 Snapshot/SSE 语义
        |
  Web / Mobile / Desktop  —— 并列客户端，不另造 Agent 大脑
```

- **Web**：已落地的全功能 Agent 工作台（`/agent`）。
- **Mobile**：Native 壳 + 与 Web **语义 parity**（见 doc 36）；适合通知、外出、审批与简版 Workbench。
- **Desktop**：在 parity 之上，承担 **本机工作区、Browser/Computer Use、本地 MCP（stdio）、本机 Skills 目录、常驻与通知、跨端执行端** 等 Web 难以单独完成的能力。

### 1.2 两类优先级（勿混淆）

| 类型 | 含义 |
| --- | --- |
| **工程优先级** | 先把 **壳** 做出来：可安装、可启动、可连接 Host、可加载与 Web 等价的 Agent UI。 |
| **功能优先级** | 壳稳定后：**先做行业标配**，再按档位集成竞品 **差异化** 能力；不是「竞品有什么就做什么」。 |

本文只定义 **功能优先级**；实现形态（例如 Native 壳托管现有 Web UI）由后续工程文档描述。

### 1.3 用户与边界（轻量）

- 主要考虑 **非技术用户** 能否交办任务、看懂过程、拿到文件、该点同意时点同意。
- 不在本阶段锁定垂直行业；垂直能力优先通过 **Skill / MCP / 模板** 扩展，而非客户端 Kernel 分叉。
- **R1 边界**与 Web 一致：local user、无 OAuth/多租户；团队与审计见 L7，不纳入客户端首版必做。

### 1.4 与现有 Host 能力的关系

| Host 已有（摘要） | 客户端产品侧动作 |
| --- | --- |
| Connection-Durable Run、HITL、Steer、Follow-up、Plan（K3/K4） | **Parity 体验**，不重定义语义 |
| C1 附件、C2 交付物与版本链、C5 Workbench | **Parity +** 本机「打开所在位置」 |
| C3 Sandbox bash / C3-D 沙箱内 browser | Host/Sandbox 路径保留；**本机 Browser/Computer** 由 Desktop 标配（D-STD-10/11），与 C8 能力规格对齐 |
| C4 MCP（当前 Web：**HTTP only**，见 doc 35） | Settings parity + Desktop **stdio 本地 MCP**（D-STD-12） |
| C6 Skills（当前 Host：**Registry/DB 等**，见 doc 40） | Composer/Catalog parity + Desktop **本机 Skills 目录**（D-STD-13） |
| C7 Memory | Settings parity |
| L3 定时任务、C9/C10 市场、L7 多用户 | 客户端 **P2/P4 或后置**，依赖 Host 能力就绪 |
| **Subagent / 并行 Worker / Swarm** | **不属于本文**；属 Harness Agent Kernel（Host/Web 同一能力），见 [00-agent-core-roadmap.md](./00-agent-core-roadmap.md) 与 implementation-status **L4 Delegation** |

### 1.5 本文不覆盖的 Agent 能力

下列能力由 **Host + 全端客户端共用**，不在 Desktop 分轨里单独排期：

- **Subagent、多 Worker 并行、Swarm 式 fan-out**（竞品「几百 Agent 并行」属此类）。
- 实现与里程碑在 Agent Capability / Delegation 路线中规划，Web 与 Desktop **同一 Run 语义**，不因 Desktop 另立一套。

---

## 2. 市面 Agent 客户端：Web 多什么（共识摘要）

Web 典型边界：**浏览器内对话 + 看进度 + 上传/下载**；Agent 逻辑在服务端，**默认碰不到用户本机环境**。

桌面客户端相对 Web 的共性增量：

1. **本机工作区**：绑定文件夹，读写与整理，成果写回磁盘。  
2. **本机环境**：大文件、内网路径、本地命令与工具链（在授权范围内）。  
3. **Browser Use / Computer Use**：已登录站点、交互式网页、受控桌面操作（标配，且强依赖审批与范围）。  
4. **本地扩展**：stdio MCP、本机 Skills/配置目录（Web -only HTTP MCP / 服务端 Catalog 往往不够）。  
5. **常驻与跨端**：后台跑任务、系统通知、定时；手机看进度/审批，**桌面当执行端**。

**共性仍是：同一大脑，客户端多「在本机把事情做完」的手。** 竞品里的 **大规模 Agent 并行（Swarm）** 属于 **Subagent/编排**，应落在 Harness Agent 本身，而非「Desktop 特有功能」（见 §1.5）。

---

## 3. 功能 P1：行业标配（壳之后的第一功能优先级）

下列能力为 **Agent 桌面客户端标配**。与 Web 重叠部分目标是 **体验对齐**；**客户端第一性增量** 包括：工作区、Browser/Computer Use、stdio MCP、本机 Skills、常驻/通知。

| ID | 能力 | 说明 | 与 Web |
| --- | --- | --- | --- |
| D-STD-1 | 首次引导 | 连接 Host、选模型、说明「长任务、可能要你点同意」 | 对齐 |
| D-STD-2 | Session 与 Composer | 新建/历史/重命名/置顶/删除；提交、附件、推理强度、模型 | Parity |
| D-STD-3 | Run 全生命周期 | 运行、澄清、审批、取消、Steer、Follow-up、Snapshot 恢复 | Parity |
| D-STD-4 | 过程可见 | 对话内 tool activity；Workbench（跟随/文件/来源或报告） | Parity；简单视图可隐藏 Debug |
| D-STD-5 | HITL | 敏感操作前明确同意/拒绝；Browser/Computer 默认更严 | Parity + 本机加强 |
| D-STD-6 | 交付物 | 预览、下载、版本链、基于版本修改 | Parity |
| D-STD-7 | Settings（基础） | 记忆、服务地址、HTTP MCP 等 | Parity |
| D-STD-8 | **工作区（文件夹）** | 绑定根目录；Agent 仅在授权范围内读写；交付物默认写入约定位置 | **客户端增量** |
| D-STD-9 | **常驻与通知** | 后台仍视为在线策略（产品定义）；Run 终态、待审批系统通知 | **客户端增量** |
| D-STD-10 | **Browser Use（本机）** | 受控浏览器自动化：登录态站点、交互式页面、下载进工作区；步骤可观察 | **客户端增量**（Web 为 Sandbox browser 或 Fetch，不等价） |
| D-STD-11 | **Computer Use（本机，受限）** | 工作区 + 授权范围内的 CLI/桌面操作；**非**无边界全盘控制 | **客户端增量**；与 D-STD-5 绑定 |
| D-STD-12 | **MCP stdio** | 注册并运行 **本地子进程 MCP**（command/args/cwd/env）；与现有 **HTTP MCP**（C4）并存 | **客户端增量**（Web C4-A/B **仅 HTTP**，见 doc 35） |
| D-STD-13 | **本机 Skills 目录** | 用户可配置 Skills 根目录（如工作区内或用户目录）；发现/加载 **文件型 Skill**，与 Host Registry 合并展示 | **客户端增量**（Web 当前以 Host/DB 与 bundled 为主，见 doc 40） |

**D-STD-12 / D-STD-13 产品约定（摘要）**：

- Desktop 负责 **本机进程与本机文件**（spawn stdio MCP、监视 Skills 目录）；Run 内工具调用仍经 **Host Tool 边界与 HITL**，不绕过 Kernel。
- Web 可继续使用 HTTP MCP 与既有 Skills 来源；**不要求** Web 支持 stdio 或本机目录，除非未来 Host 统一抽象后主动升档。

### 3.1 P1 验收（产品）

非技术用户 **无需 Debug Tab** 即可完成：

```text
绑定工作区 → 交办（可用本机 Browser/Computer、本地 MCP 或本机 Skill）
→ 必要时点同意 → 在工作区或 Workbench 拿到文件/报告
```

**扩展验收（Desktop 相对 Web）**：

- 至少一个 **stdio MCP** 与一个 **本机 Skill 文件** 可被 Settings 发现并参与 Run（在 Host 能力就绪前提下）。
- 至少一条 **Browser Use** 或 **Computer Use** 任务在授权范围内完成，且审批点可见。

---

## 4. 差异化能力：辩证分析与分档

竞品特有功能 **不全量集成**。按 **用户价值、与 Harness 底座契合度、隐私与合规风险** 分档。

### 4.1 P2：建议跟进（标配完成后）

| ID | 能力 | 竞品参考 | 纳入理由 | 注意 |
| --- | --- | --- | --- | --- |
| D-P2-1 | 权限档位 | Kimi Work、Manus | 非技术用户信任：仅本次 / 本会话 / 本工作区 | 与 K3 HITL 语义一致 |
| D-P2-2 | Reveal 交付物 | 桌面通用 | 打开文件夹、系统默认应用打开文件；感知强、实现轻 | 依赖工作区 |
| D-P2-3 | 任务模板 / 预置 Skill | WorkBuddy、Kimi | 降门槛（周报、汇总表、汇报稿）；C6 已有机制 | 先 3～5 条预置，非商店 |
| D-P2-4 | Goal 式长任务（包装） | Kimi Goal、ChatGPT Work | Run + 多轮 + 验收标准；主要是 **进度与文案** | 不替代 Host Run 模型 |
| D-P2-5 | 跨端遥控 | Manus、WorkBuddy | Mobile 看/批/Steer；**本机工具仅 Desktop 在线执行** | 与 doc 36/42 协同 |
| D-P2-6 | 定时 / 周期任务（UI） | 各家 Automations | 列表、创建、暂停、完成通知 | 依赖 Host L3 |
| D-P2-7 | 简单 / 专家视图 | 通用 | 简单：弱化 tool 名与 Json；专家：完整 Workbench | Mobile 已类似策略 |

### 4.2 P3：可选增强

| ID | 能力 | 竞品参考 | 纳入理由 | 不优先或慎用的理由 |
| --- | --- | --- | --- | --- |
| D-P3-1 | 内置垂直数据库 | Kimi 金融/学术 | 一键取数 | 通用客户端用 MCP 替代 |
| D-P3-2 | 执行步骤可复核（增强） | Manus | 完整截图链/回放 | D-STD-10/11 已含基本可观察性 |
| D-P3-3 | 深度 IM 集成 | WorkBuddy 企微/微信 | 国内办公入口 | 渠道与合规单独立项 |

### 4.3 P4：暂不作为客户端必做

| 项 | 说明 |
| --- | --- |
| MCP / Skill **市场**（C9/C10） | 机制在 Host；客户端只做 curated 入口时可从 P2 升档 |
| 多用户、团队、SSO、审计（L7） | 与 R1 单用户边界冲突 |
| 无审批的全盘 Computer Use | 产品与安全不接受 |
| 仅聊天、无 Workbench 的轻客户端 | 与 Harness 定位不符 |
| 替代 Web 或另建 Agent Kernel | 违反多端同一协议原则 |

---

## 5. 多端功能分工（产品）

| 能力 | Web | Desktop | Mobile |
| --- | --- | --- | --- |
| 交办任务、看对话与 Progress | ● | ● | ● |
| Workbench 深度预览 | ● 最佳 | ● | ○ Sheet 简版 |
| 工作区读写 | ○ | ● | ○ |
| 本机 Browser / Computer | ○（Sandbox/Fetch） | ●（P1） | ○ 仅审批/查看 |
| MCP stdio / 本机 Skills 目录 | ○（HTTP MCP / Host Skills） | ●（P1） | ○ 仅消费已同步配置 |
| 定时任务 | △ | ●（P2，依赖 L3） | ○ 通知 + 查看 |
| Debug / Context | ● Dev | ○ 默认隐藏 | ✕ |
| 作为「本机执行端」 | ✕ | ● | ✕ |

**规则（D-P2-5）**：需要 **本机工作区或本机 Browser/Computer** 的任务，在 Desktop **离线或未启动** 时，Mobile/Web 应明确提示，而非静默失败。

---

## 6. 推荐功能落地顺序（仅产品阶段）

```text
工程：壳（安装 / 启动 / 连接 Host / 承载 Agent UI）
  ↓
P1 标配：D-STD-1 … D-STD-13
        （Parity + 工作区 + Browser/Computer + stdio MCP + 本机 Skills + 通知）
  ↓
P2：D-P2-1 … D-P2-7（权限档位、Reveal、遥控、定时、模板…）
  ↓
P3：D-P3-*（垂直数据、IM、步骤回放增强…）
  ↓
P4：生态 / 团队 / 重渠道（单独立项）
```

**C8（Browser/Computer Use）** 与 **C4 stdio 扩展**、**C6 本机 Skill 来源**：产品优先级以 **本文 P1（D-STD-10～13）** 为准；Host 专题文档（doc 34/35/40）随 Desktop 总指挥同步修订，避免 Web 阶段「不做 stdio」与 Desktop 标配长期冲突。

---

## 7. 非目标（本文不承诺）

- 具体技术栈（Electron/Tauri、Bridge API 形状、进程模型）。  
- Desktop 与 Web 的组件级复用方案（见后续工程文档与 `packages/*` 约定）。  
- Parity 逐条 ID 矩阵（可另建 `apps/desktop/docs/parity-checklist.md`，对齐 doc 36 §4 结构）。  
- OAuth、计费、企业合规认证。  
- **Subagent / Swarm / 多 Worker 并行**（见 §1.5，由 Agent Kernel 路线负责）。

---

## 8. 文档维护

- Web 行为变更以 [19-agent-frontend.md](./19-agent-frontend.md) 为准；Desktop 若仅布局/本机交互差异，在本文件或后续 Desktop 工程文档补充。  
- Mobile 跨端规则与 D-P2-5 冲突时，以 **服务端 Snapshot 为事实源** 为准（同 doc 42）。  
- Host 范围或里程碑变化时，先核对 [00-agent-core-roadmap.md](./00-agent-core-roadmap.md)，再更新本文与 [implementation-status.md](./implementation-status.md) § L6。  
- Desktop 客户端范围或优先级变化时，**先更新本文**，再同步工程文档与 parity 清单；不得悄悄扩大 Agent Kernel 承诺。
