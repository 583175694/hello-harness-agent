# C6 Skills & User Memory

> 状态：Skills 第一阶段方案已冻结；Web Composer Lexical Mention 实现方案见 §4.7–§4.8；User Memory 仍处于规划阶段，尚未开始实现。
>
> 本文先冻结范围和讨论入口，具体产品语义、数据模型、权限规则和验收标准留待后续讨论。C6 当前包含 Skills 与 User Memory，不包含 `NOTES.md`、`TODO.md` 文件化任务状态，也不包含 Skills Marketplace。

## 1. 目标

C6 计划为 Agent 增加两类可复用 Context 来源：

- **Skills**：可复用的任务流程、输入约束、输出契约和能力说明；
- **User Memory**：有来源、可追溯、可审核、可删除的跨 Session 用户信息。

## 2. 当前边界

- Skill 不得扩大 Sandbox 权限或绕过 `tool_approval`；
- Memory 固定为 user scope，不引入 project / workspace / organization scope；
- Memory 默认以摘要或 MemoryCard 进入 Context，完整历史通过显式 `sourceRefs` 展开；
- 网页事实和一次性调研内容不能自动写入长期 Memory；
- `NOTES.md`、`TODO.md` 和文件化 Goal Reminder 不在当前路线；
- Skill Marketplace、远程安装和热加载属于 C9，暂不纳入 C6。

## 3. 与 K5 的关系

C6 负责生成合法的 `skills` 和 `memories` 候选内容；K5 负责选择、预算、渲染、压缩和调试。C6 不直接拼接最终 `ModelMessage[]`，也不自行决定 Context 中的插入位置。

对应契约见 [K5 Context Engineering](./39-k5-context-engineering.md)。

## 4. Skills 第一阶段定稿

第一阶段采用 DSH 风格的渐进加载模型：会话开始时把可见 Skills 的精简 Catalog 注入 Context，模型需要使用某个 Skill 时再加载完整正文。Catalog 只有元数据，不包含 Skill 正文、脚本或参考资料。

### 4.1 来源和 Registry

C6 维护唯一的 Skill Registry。第一阶段支持以下来源：

- `bundled/system` — 内容包 [`packages/bundled-skills`](../packages/bundled-skills/README.md)（`skills/<name>/skill.json` + `instructions.md`），由 `loadBundledSkills()` 在 Registry 启动时注册；
- `project`；
- `user`；
- `session/runtime`。

远程 Skill Provider、Marketplace 和复杂动态发现暂不实现，但 Registry 保留 Provider 扩展空间。K5 和模型侧查询都读取同一个 Registry，不维护两套 Catalog。

```text
C6 Skill Registry
        ↓
      Catalog
        ├── K5 注入精简 Catalog
        └── skills.list 查询
```

### 4.2 模型侧接口

第一阶段保留两个模型侧 Tool：

```ts
type SkillsListInput = {
  query?: string;
  limit?: number;
};

type SkillsListOutput = {
  skills: Array<{
    name: string;
    description: string;
    version?: string;
    source?: string;
  }>;
};

type SkillsReadInput = {
  name: string;
  version?: string;
};
```

`skills.list` 只查询 Catalog，不返回 Skill 正文。由于初始 Catalog 已经注入，模型通常不需要调用它；它用于搜索、确认和未来的动态 Provider 扩展。

`skills.read` 加载指定 Skill 的完整内容。返回结果使用统一的 Tool Result 结构：

```xml
<skill_content name="pdf-processing" version="1.0.0">
  <skill_resources>...</skill_resources>
  <skill_instructions>...</skill_instructions>
</skill_content>
```

Skill 正文、脚本和资源不得进入初始 Catalog。资源仅按 Skill 指令需要时，通过现有文件、Sandbox 或其他 Tool 读取。

### 4.3 Catalog 注入和生命周期

Catalog 条目只包含 `name`、短 `description`、版本、来源和模型可调用状态。第一阶段采用 DSH 的全量精简 Catalog 策略：当前可见且允许模型调用的 Skills 都进入 Catalog；描述设置单项长度上限，例如 `maxDescriptionChars = 500`。

标准流程如下：

```text
C6 扫描并注册 Skills
  ↓
生成唯一 Registry/Catalog
  ↓
K5 注入 name + description
  ↓
模型调用 skills.read(name)
  ↓
Skill 正文作为 Tool Result 进入下一轮 Context
```

Skill 注册、删除、描述或可见性变化时，Host 可以追加新的完整 Catalog replacement。正文变化不触发 Catalog 更新，后续 `skills.read` 读取最新正文即可。Catalog 只有在内容实际变化时才更新，旧版本由 K5 的 Compaction 机制处理。

`skills.read` 必须在 Host 侧校验 Skill 是否存在、版本是否匹配以及是否允许模型调用；Skill 不得扩大 Sandbox 权限、绕过 Tool Policy 或跳过既有审批流程。

### 4.4 显式选择与隐式发现

Skills 支持三种使用模式。三种模式共享同一个 `SkillRegistry.read()` 加载实现和同一种 `<skill_content>` 内容格式。

#### 用户显式选择

用户可以通过以下方式指定 Skill：

- 在消息中使用 `/skill-name`；
- 通过 UI 的“+”选择 Skill；
- 由 Session 或 Run 配置绑定 Skill。

显式选择表示 Host 已经完成了 Skill 路由，因此该 Run 不需要为了发现已选 Skill 而注入完整 Catalog，也不需要让模型再次调用 `skills.read`。Host 直接通过内部 `SkillRegistry.read()` 加载内容，并将同样的 `<skill_content>` 注入当前 Run/Step。

```text
用户选择 Skill
  ↓
Host 校验和加载
  ↓
注入 <skill_content>
  ↓
模型执行任务
```

显式选择的 Skill 仍然必须经过模型可调用策略、Tool Policy、Sandbox 和既有审批约束。用户选择不能扩大执行权限。

#### 模型隐式发现

如果用户没有指定 Skill，K5 在初始 Context 中注入当前可见 Skills 的精简 Catalog。模型根据名称和描述判断是否需要某个 Skill，然后调用 `skills.read(name)` 加载正文。

```text
没有用户指定 Skill
  ↓
K5 注入 Catalog
  ↓
模型选择 Skill
  ↓
调用 skills.read
```

#### 执行中的延迟发现

如果显式或隐式模式下的 Run 在后续任务中发现需要其他 Skill，模型可以调用 `skills.list(query)` 查询同一个 Registry，再调用 `skills.read(name)` 加载结果。

```text
skills.list(query)
  ↓
skills.read(name)
  ↓
继续执行
```

因此，`skills.list` 是补充发现接口，不是所有 Run 的必经步骤。

模式选择规则如下：

```text
用户显式指定 Skill？
  ├── 是：跳过初始 Catalog，Host 直接注入已选 Skill
  └── 否：注入精简 Catalog，由模型隐式选择

执行过程中需要额外 Skill？
  └── 调用 skills.list，再调用 skills.read
```

### 4.5 第一阶段明确延期

以下能力不属于第一阶段：

- Catalog 总量预算和基于任务的候选筛选；
- 相关性排序、Embedding/向量检索和自动推荐；
- 分层、分页和 Skill 分类目录；
- 远程 Provider、Marketplace 和运行时安装；
- Skill 正文自动压缩或大小限制；
- Skill 依赖解析和跨 Skill 编排。

这些能力只有在真实使用中出现规模或路由问题后再加入，不提前扩大 C6 的实现范围。

### 4.6 方案分析和升级信号

全量精简 Catalog 的优点是实现简单、路由透明，且与 DSH 的基础模型一致。它解决了“正文不应全部进入初始 Context”的问题，但没有彻底解决 Skills 数量过多时的 Catalog 长度和选择困难问题。

该方案依赖以下前提：Skills 数量有限、描述足够准确、来源稳定，模型能够依据名称和描述完成初步路由。`skills.list` 在第一阶段可能是冗余调用，因此 Tool 描述必须说明它是可选查询，不是必经步骤。

当出现以下任一情况时，再进入下一阶段：

- Catalog 经常超过 Context 预算；
- 模型频繁选择错误或无关 Skill；
- `skills.list` 调用率持续升高；
- Skill 正文过大并频繁触发 Compaction；
- 用户需要跨项目或远程 Skill 搜索。

下一阶段再考虑总预算、任务相关性筛选、分层 Catalog、语义检索和正文大小控制。

参考实现：[DSH Skills subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md)、[DSH model-facing skill tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/skill/tool-skill/README.md)、[Codex Skills](https://developers.openai.com/codex/skills)。

### 4.7 Web Composer：Lexical + Skill Mention（实现方案）

> 状态：**Phase 1 已在 `apps/web` 落地**（Lexical、`/` typeahead、`+` 技能面板、`skillNames` 提交、用户气泡 inline 回放）；与后端显式注入路径对齐。下文「目标/分期」保留设计脉络，**以本节「实现快照」为准**。

#### 4.7.0 实现快照（2026-03）

| 项 | 现状 |
|----|------|
| 编辑器 | `SkillPromptEditor`（PlainText + `SkillMentionNode`） |
| 触发 | **仅 `/`**（未实现 `@` 双 trigger） |
| Skill 视觉 | Codex 式 inline mention（主题 `--theme-skill-mention` 字/图标色，无 pill 关闭钮；Backspace 删除） |
| 技能弹框 | 标题「技能」、加宽列表、选中仅背景高亮、无底部快捷键栏 |
| 启用范围 | `composerMode === 'new-run'` 且无 HITL 中断（**Steer / Pending Input 不支持 Skill**，刻意不做） |
| 提交 | `plainText` → `content`；`skillNames[]` → `createRun`；UI 与 `metadata.skillNames` 回放气泡 |
| Host 显式路由 | Runtime 仍从**用户消息 content 前缀** `/slug` 解析（见 §4.7.11）；`skillNames` 在 API 层会拼进 content 以兼容 |
| 双轨 state | 仍保留 `app.prompt` + `selectedSkills` + Lexical 文档（Phase 3 再收敛） |
| 仅 Skill 无正文 | Composer 发送钮可亮，但 `handleSubmit` 与协议 `content.min(1)` **仍要求正文**（见 §4.7.7） |

#### 4.7.1 目标与边界

**目标**

- 用 [Lexical](https://github.com/facebook/lexical) 替换 Composer 中的纯 `textarea`，Skill 以**内联原子 token** 展示（`.skill-mention` inline）。
- 输入 **`/`** 触发 Skill typeahead；「+」面板共用同一套行组件与 `GET /api/skills`。
- 提交时：`plainText` → Run 请求体 `content`；`skillNames` → `skillNames`（与 `createRun(..., skillNames)` 一致）。
- 保留：中文 IME、Enter 发送 / Shift+Enter 换行、粘贴与拖拽附件、HITL 时隐藏主输入等既有 Composer 行为。

**本阶段不做**

- Steer / Pending User Input 路径下插入 Skill（已实现为关闭：`enableSkillComposer` 条件）。
- 将 Lexical 文档 JSON 持久化到服务端。
- `@` trigger、Steer Skill、`skillNames` 复杂去重策略、Composer E2E 集成测（刻意后置）。

#### 4.7.2 架构

```text
Composer (conversation.tsx)
  PromptInput form
    SkillPromptEditor          ← 替换 PromptInputTextarea
      LexicalComposer
        PlainTextPlugin + ContentEditable
        SkillMentionNode
        SkillTypeaheadPlugin     / trigger
        ComposerSubmitPlugin     Enter → form.requestSubmit
        ComposerPastePlugin      文件 paste → 现有附件逻辑
        ComposerControlledPlugin 与 prompt / 清空同步
    composer-quick-panel（可选）  点选 → insertSkillMention，与 typeahead 共用命令
  提交 → app.handleSubmit → createRun(content, skillNames)
```

职责划分：Radix 继续负责模型设置等菜单；Lexical 负责输入区文档模型；C6 Host 仍只消费 `skillNames` 与 `content`，不感知编辑器实现。

#### 4.7.3 依赖

在 `@harness/web` 增加：

```text
lexical
@lexical/react
@lexical/utils
@lexical/text
```

采用 **PlainTextPlugin**（非 RichText），避免引入完整富文本能力。不引入 `lexical-beautiful-mentions`：仅 Skill 一种 mention，自研 `DecoratorNode` + 官方 `LexicalTypeaheadMenuPlugin` 即可。

#### 4.7.4 建议目录

```text
apps/web/src/features/agent/composer/
  skill-mention-node.ts
  skill-editor-theme.ts
  skill-editor-utils.ts          extractPlainText / extractSkillNames
  skill-typeahead-plugin.tsx
  composer-submit-plugin.tsx
  composer-paste-plugin.tsx
  composer-controlled-plugin.tsx
  skill-prompt-editor.tsx
  skill-prompt-editor.test.tsx
```

#### 4.7.5 数据模型

**SkillMentionNode（DecoratorNode）**

```ts
type SkillMentionPayload = {
  name: string;   // API skillNames[]
  label: string;  // UI，来自 listSkills / Registry
};
```

- 内联、`isKeyboardSelectable`，建议 `isIsolated`：caret 不进入 token 内部，Backspace 一次删除整个 Skill。
- DOM：`contenteditable="false"` 的 inline mention（`skill-mention-inline` / `.skill-mention`）。

**导出约定（与显式选择对齐）**

```ts
type ComposerDocumentValue = {
  plainText: string;
  skillNames: string[]; // 文档顺序，提交前可 dedupe 保序
};
```

- `content` = 所有 TextNode 文本拼接，**不包含** Skill 名称字面量（避免与 `skillNames` 双源不一致）。
- Skill 仅通过 `skillNames` 进入 Host 显式注入路径（见 §4.4），与「UI 选 Skill」语义一致。
- 消息正文中手写 `/skill-name` 的解析仍可由 Host 保留；Composer 侧不再把 `/xxx` 当作普通字符串写入 `content`（用户通过 `/` 选中后应变为 mention + `skillNames`）。

**与 React state（Phase 1）**

- 暂保留 `app.tsx` 的 `prompt` + `selectedSkills`。
- `SkillPromptEditor.onChange` 同时更新二者；编辑器为交互期 source of truth，提交后清空文档并 `setSelectedSkills([])`。

#### 4.7.6 Typeahead 与面板

- trigger：**`/`**（`useBasicTypeaheadTriggerMatch`，`minLength: 0`），查询 debounce 后调用 `GET /api/skills?query=`（`listSkills`）。
- 菜单 UI 复用 `composer-quick-panel__row` 样式，Portal 锚定到 typeahead anchor。
- 「+」面板选 Skill：调用统一命令 `INSERT_SKILL_MENTION`，不依赖光标前是否已有 `/`；长期可让「+ → Skills」等价于 focus 后插入 `/` 或打开同一菜单。

#### 4.7.7 与现有 Composer 行为对照

| 现有行为 | Lexical 侧 |
|----------|------------|
| `draftPrompt` / onBlur → `onPromptChange` | `OnChangePlugin` + blur 同步 |
| Enter 发送 | `KEY_ENTER_COMMAND`，排除 Shift 与 IME composing |
| 粘贴附件 | 有 files 时走现有 `handleComposerAttachmentPaste` |
| 发送 | UI：`plainText` 或 `skillNames` 任一非空可点发送；**Run 仍要求 `content` 至少 1 字符**（协议 + `handleSubmit`）；仅 Skill 无正文见 §4.7.11 |
| 底部 `composer-selected-skills` | Phase 1 移除，Skill 仅内联展示 |

#### 4.7.8 实施分期

| 阶段 | 内容 |
|------|------|
| **Phase 1（MVP）** | ✅ 已交付：Node + Editor、`/` typeahead、`listSkills`、Enter/IME/提交/清空、`+` 面板、inline mention、用户气泡回放 |
| **Phase 2** | Steer Skill：**不做**；去重/E2E：**后置**；空列表与错误态：已有基础 UI |
| **Phase 3** | 单一 `composerDraft`；Run 级结构化 `skillNames`（content 仅存正文）；可选 `@` trigger |

#### 4.7.11 产品决策备忘

- **仅 Skill、无正文**：协议 `CreateRun` 的 `content` 为 `min(1)`；优质 Agent 普遍把 Skill **附在一条用户任务上**（Cursor `/skill` 附着单条消息；ChatGPT `@skill` 仍在 prompt 内）。结论：**现阶段要求用户写至少一句任务**合理；若未来支持「空正文 + skillNames」，需改协议并在 Host 用结构化字段注入，而非空 user message。
- **显式 Skill 双源**：创建 Run 时 API 将 `skillNames` 前缀写入 `content`，Runtime `extractSkillNames` 读前缀；`metadata.skillNames` 供 UI。在仅 bundled、单路径部署下**可维持**；多客户端或去掉前缀前需 Run/transcript 结构化。
- **Registry 多来源**：第一阶段仅 `bundled/system` 注册；`user`/`project`/市场在 C6 扩展 + C9 安装后接入同一 `register()`，**非当前阻塞项**。

#### 4.7.9 测试

- 单元：`extractSkillNames` / `extractPlainText`、节点 JSON 往返。
- 组件：选中 Skill 出现 `.composer-skill-mention`；Backspace 删除 token。
- 集成：mock `listSkills`，提交断言 `createRun` body 中 `content` 与 `skillNames` 分离。
- 手动：中文 IME、粘贴图片、拖拽附件。

#### 4.7.10 对外组件 API（草案）

```tsx
type SkillPromptEditorProps = {
  value: string;
  skillNames: string[];
  placeholder: string;
  disabled: boolean;
  enableSkills: boolean;
  onChange: (next: { plainText: string; skillNames: string[] }) => void;
  onPasteFiles?: (files: File[]) => void;
  editorRef?: React.RefObject<LexicalEditor | null>;
};
```

### 4.8 辩证分析：Lexical Mention 与 C6 显式选择

本节对 §4.7 做辩证审视：既说明为何在现阶段成立，也写明内在张力与反转条件，避免把「技术选型」误当成「产品真理」。

#### 4.8.1 正题：结构化 mention 符合 C6 显式路径

**主张**：Lexical + 原子 Skill token，是当前阶段下显式选择与 Web UX 的合理统一。

- **单一事实来源**：显式 Skill 以 `skillNames` 进入 Host（§4.4），Composer 若继续用「纯文本里带 `/name` + 底部 chip 数组」，容易出现 `content` 与 `skillNames` 不一致；mention 强制把 Skill 从正文中剥离，与「Host 已路由、跳过 Catalog」一致。
- **能力边界清晰**：C6 第一阶段不需要 Markdown 编辑器；PlainText + Mention 正好落在「聊天输入 + 少量 token」区间，比 Tiptap/Slate 更贴边界（§4.5 不扩大范围）。
- **与 K5 分工不变**：用户选 Skill 不改变 Context 编译规则，只是触发显式注入；Lexical 是前端呈现层，不触碰 §3「C6 不直接拼接 ModelMessage[]」。

#### 4.8.2 反题：成本、矛盾与隐藏假设

**反对面**：该方案并非无代价，且与文档其他表述存在张力。

| 维度 | 反题要点 |
|------|----------|
| **复杂度** | 引入 Lexical 与 IME/选区/粘贴测试矩阵，维护成本高于「chip + textarea」；团队需承担 editor 类 bug 的长期债务。 |
| **§4.4 表述** | 文档写「在消息中使用 `/skill-name`」；Composer 改为 mention 后，用户可见正文可能**不再包含** `/name`，与「slash 即消息语法」的直觉不完全一致（Host 仍可从纯文本解析 slash，但 Web 主路径分裂为两态）。 |
| **双通道触发 `@` 与 `/`** | 产品语义上 `@` 常暗示「对象/人」，`/` 暗示「命令」；共用一个 Skill 列表简化实现，但可能在用户心智上混淆，除非 UI 明确标注「Skill」。 |
| **plainText 与语义** | Skill 不占 `content` 字符时，历史消息仅看文本无法还原「当时启用了哪些 Skill」，审计与回放依赖 `skillNames` 是否持久化到 Message（当前 Phase 1 不做气泡 mention，矛盾被推迟）。 |
| **与隐式发现的关系** | 显式 mention 降低模型误选 Catalog 的需要，但若用户从不写正文、只堆 Skill，任务描述为空，Host 仍注入 Skill 而缺少用户意图句——发送门槛若仍要求 `plainText.trim()`，则与「Skill 即主要意图载体」冲突。 |
| **bundle 与性能** | 相对 textarea 增加 JS 体积；对 Agent 页可接受，但与移动端（§36）或轻量入口是否共享 Composer 需另议。 |

#### 4.8.3 合题：有条件成立，用规则消化矛盾

**综合**：采用 Lexical Mention 作为 Web 显式选择的主路径，但用产品与协议上的**显式规则**消化反题，而不是假设编辑器能自动解决所有语义问题。

1. **协议层**：Web Composer 提交的 canonical 显式选择 = `skillNames` + 自然语言 `content`；`/skill-name` 作为**纯文本消息**（非 Composer 客户端、API 直写、导入）的兼容语法，与 mention 并行，由 Host 统一解析后进入同一条显式注入路径。
2. **产品层**：typeahead 中 `@` 与 `/` 共用列表时，菜单标题统一为「Skill」，避免伪装成通用 @mention；「+」入口与 slash 触发共享 `insertSkillMention`，避免三套选择 UI 漂移。
3. **实现层**：Phase 1 坚持 PlainText + 单节点类型，拒绝顺势做 RichText；测试预算优先 IME 与提交，其次视觉 polish。
4. **观测层**：若出现「用户只选 Skill 不写正文」的合理场景，再单独决策是否放宽发送条件或自动补默认提示句——不在 Lexical 方案里预置 ambiguous 逻辑。

#### 4.8.4 矛盾的主要方面与次要方面

- **主要矛盾**：**显式 Skill 的机器可读性**（`skillNames`、Host 路由）与**用户表达的自然性**（一句话里混排 Skill 与任务描述）之间的张力。Lexical mention 把主要方面放在「机器可读」，用 inline 高亮补偿自然性；若团队更看重「可复制粘贴的纯文本即完整语义」，则反题占优，应保留 slash-in-text 或导出时嵌入可逆标记（Phase 2+）。
- **次要矛盾**：Composer 富交互 vs 前端简洁性。在 Skills 仅个位数、Phase 1 已上线 panel + chip 的前提下，若 typeahead 数据始终来自 `listSkills` 且交互稳定，**收窄版 chip+textarea** 仍可能满足 80% 需求——选 Lexical 的决策依据是「内联混排 + 原子删除 + 双 trigger」是否为**必要**体验，而非「是否能做」。

#### 4.8.5 何时反转方案（与 §4.6 升级信号呼应）

在以下信号出现时，应重新评估 §4.7，而非继续堆 Lexical 插件：

- Composer  bug 与 IME 问题占用持续高于功能迭代；
- 产品确认不需要句中 inline Skill，仅句首多选即可；
- Message 持久化要求「用户所见 = 存储字符串」，且拒绝存 `skillNames` 元数据；
- 移动端共用同一套输入，Lexical bundle 或 contenteditable 体验不达标。

反转选项按成本从低到高：**混排 chip + textarea** → **textarea + react-mentions 仅高亮** → **维持 Lexical 但导出 reversible plain-text marker**（如 `[skill:name]`）供审计与跨客户端同步。

#### 4.8.6 与 Catalog / 隐式发现的辩证关系

- **互相促进**：显式 mention 用得越多，Catalog 注入压力越小，模型 `skills.read` 的「发现」调用越少，有利于 §4.6 前提（Skill 数量有限、路由清晰）。
- **互相制约**：若用户依赖显式 mention 而从不依赖 Catalog，模型对 Catalog 的训练式使用可能变弱；隐式发现路径仍需在「未选 Skill 的 Run」上保持一等公民，避免产品变成「不会选 Skill 就不会用 Agent」。

## 5. 待讨论问题

- Skill 的来源、版本、启用范围和更新方式；
- Skill 是否支持用户级、Session 级和临时 Run 级；
- Memory 的 active / candidate / rejected / expired 状态；
- Memory 写入触发条件、用户审核和冲突处理；
- `sourceRefs` 支持的事实类型和删除 Session 后的重新评估；
- Skills 与现有 Tool Catalog、MCP、Sandbox 的边界；
- C6 第一版需要哪些 Web 管理界面和审计信息；
- Message 是否持久化 `skillNames` 以供历史回放与审计（§4.8 合题已倾向协议层分离 `content` / `skillNames`，存储形态仍待定）；
- Composer 是否允许「仅 Skill、无正文」发送（§4.7.7）。
