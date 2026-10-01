# K5 Context Engineering

> 状态：接口与实施边界冻结中，全面优化尚未开始。
>
> K5 的目标是让不同 Context 来源经过统一的选择、预算、渲染、压缩和调试流程，再进入模型请求。K5 不负责产生 Skill 或 Memory 业务事实；这些事实由 C6 提供。

## 1. 当前基础

现有 `ContextCompileInput` 已统一接收：

- `messages`
- `tools`
- `mcpInstructions`
- `compactionState`
- `model` / `sessionId`
- `signal`

Context 编译已经支持模型输入 token 估算、Tool Result 裁剪、封闭历史前缀压缩、压缩状态持久化、最终预算保护和 Context 调试快照。

## 2. C6 接入的最小接口

在现有 `ContextCompileInput` 上增加两个明确的候选来源字段：

```ts
type ContextCompileInput = {
  sessionId: string;
  model: string;
  messages: ModelMessage[];
  tools?: AgentToolDefinition[];
  signal?: AbortSignal;
  compactionState?: CompactionState;
  mcpInstructions?: ReadonlyArray<McpServerInstructionSnapshot>;
  skills?: ReadonlyArray<SkillContextInput>;
  memories?: ReadonlyArray<MemoryContextInput>;
};
```

第一版类型保持分离，不引入通用 Plugin、Provider、Fragment 或 Attention Engine：

```ts
type SkillContextInput = {
  skillId: string;
  version: string;
  content: string;
  priorityHint?: number;
};

type MemoryContextInput = {
  memoryId: string;
  content: string;
  sourceRefs: MemorySourceRef[];
  priorityHint?: number;
};
```

这些字段表示“候选 Context 来源”，不表示一定注入。C6 负责提供合法、可追溯的候选内容；K5 负责决定是否选择、放置、裁剪和压缩。

Skill 和 Memory 的来源语义保持不同：

- Skill 使用 `skillId` 与 `version` 表示能力身份和版本；
- Memory 使用 `memoryId` 与 `sourceRefs` 表示记忆身份和可追溯事实；
- Skill 内容可以作为任务说明，Memory 内容只能作为参考信息，不能绕过 System Prompt 或 Tool Policy。

该接口先作为 API 内部类型放在 `apps/api/src/context-engineering/`，不立即提升到 `packages/agent-protocol`，避免过早冻结公共协议。

## 3. K5 的职责

K5 后续负责：

1. 为 Skills、Memory、MCP、文件、历史消息和 Tool Result 统一估算预算；
2. 根据任务相关性、来源类型和优先级选择候选内容；
3. 将 Skill 与 Memory 渲染到稳定、可识别的 Context 区块；
4. 处理来源之间的保留、裁剪、摘要和显式展开；
5. 记录 selected / dropped / truncated 的 Context trace；
6. 优化大 catalog Tool Exposure 和按需 hydrate；
7. 在真实多来源 Context 形成后，再评估 Goal Reminder / Attention Refresh。

## 4. 明确不做

当前不在 K5 接口中加入：

- 任意来源直接返回 `ModelMessage[]`；
- 来源自行指定 `system/user/assistant` 角色或插入位置；
- 通用插件热加载和 Marketplace；
- 把 Memory 全文默认注入每一轮；
- 用 `priorityHint` 代替权限和数据归属校验；
- 在没有真实数据前冻结复杂的通用相关性引擎。

## 5. 实施顺序

```text
K5-A  冻结 skills / memories 候选字段，并保持当前编译结果兼容
  -> C6 提供真实 Skill 与 Memory 候选
K5-B  统一选择、渲染和预算
K5-C  Tool Exposure、压缩、Context trace 与 Attention Refresh
```

K5-A 不改变当前模型行为；只有 K5-B 完成后，Skills 和 Memory 才进入正式模型 Context。

