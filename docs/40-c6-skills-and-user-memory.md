# C6 Skills & User Memory

> 状态：Skills 第一阶段方案已冻结；User Memory 仍处于规划阶段，尚未开始实现。
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

- `bundled/system`；
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

## 5. 待讨论问题

- Skill 的来源、版本、启用范围和更新方式；
- Skill 是否支持用户级、Session 级和临时 Run 级；
- Memory 的 active / candidate / rejected / expired 状态；
- Memory 写入触发条件、用户审核和冲突处理；
- `sourceRefs` 支持的事实类型和删除 Session 后的重新评估；
- Skills 与现有 Tool Catalog、MCP、Sandbox 的边界；
- C6 第一版需要哪些 Web 管理界面和审计信息。
