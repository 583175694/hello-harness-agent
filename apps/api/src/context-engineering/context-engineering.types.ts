import type { ModelMessage, ModelToolCall } from '../model/model-adapter';
import type { McpServerInstructionSnapshot } from '../mcp/mcp.types';
import type { AgentToolDefinition } from '../tools/agent-tool.types';

export type CompactionState = {
  summary: string;
  coveredMessageCount: number;
  /** 已摘要覆盖的 history unit 数量；与 coveredMessageCount 对齐，优先用于切分。 */
  coveredUnitCount?: number;
  coveredThroughItemId: string | null;
  version: number;
  tokenCount: number;
};

/** Prisma 可空字段 → 内存 compaction 状态（避免 null 进入 CE 逻辑）。 */
export function compactionStateFromDb(row: {
  summary: string;
  coveredMessageCount: number;
  coveredUnitCount: number | null;
  coveredThroughItemId: string | null;
  version: number;
  tokenCount: number;
}): CompactionState {
  return {
    summary: row.summary,
    coveredMessageCount: row.coveredMessageCount,
    ...(row.coveredUnitCount != null ? { coveredUnitCount: row.coveredUnitCount } : {}),
    coveredThroughItemId: row.coveredThroughItemId,
    version: row.version,
    tokenCount: row.tokenCount,
  };
}

export type ToolResultCandidate = {
  toolCallId: string;
  toolName: string;
  content: string;
  // 文件工具结果不可由通用裁剪器静默截断。
  truncatable?: boolean;
};

/** Memory 可追溯的原始事实引用；完整内容由后续显式展开流程读取。 */
export type MemorySourceRef = {
  type: 'session' | 'message' | 'run' | 'artifact';
  id: string;
};

/** C6 提供给 K5 的 Skill 候选；当前只冻结数据形状，不参与 Context 选择。 */
export type SkillContextInput = {
  skillId: string;
  version: string;
  content: string;
  priorityHint?: number;
};

/** C6 提供给 K5 的 Memory 候选；sourceRefs 保留记忆的事实追溯能力。 */
export type MemoryContextInput = {
  memoryId: string;
  content: string;
  sourceRefs: ReadonlyArray<MemorySourceRef>;
  priorityHint?: number;
};

export type ContextCompileInput = {
  sessionId: string;
  model: string;
  messages: ModelMessage[];
  tools?: AgentToolDefinition[];
  signal?: AbortSignal;
  compactionState?: CompactionState;
  mcpInstructions?: ReadonlyArray<McpServerInstructionSnapshot>;
  /** C6 候选 Skill；K5-B 前只接收，不改变当前编译结果。 */
  skills?: ReadonlyArray<SkillContextInput>;
  /** C6 候选 Memory；K5-B 前只接收，不改变当前编译结果。 */
  memories?: ReadonlyArray<MemoryContextInput>;
};

export type CompiledContext = {
  messages: ModelMessage[];
  estimatedInputTokens: number;
  promptBudget: number | null;
  compactionTriggered: boolean;
  compactionState?: CompactionState;
};

export type CompactedContext = {
  messages: ModelMessage[];
  estimatedInputTokens: number;
  compactionState: CompactionState;
};

export type ContextToolResult = ToolResultCandidate & {
  originalTokens: number;
  retainedTokens: number;
  truncated: boolean;
  content: string;
};

export type RuntimeToolCall = ModelToolCall;
