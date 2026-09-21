import type {
  AssistantContentBlock,
  AssistantTextBlock,
  AssistantToolActivityBlock,
  AssistantArtifactBlock,
  ArtifactRef,
  AssistantUserInterventionBlock,
  AssistantReasoningBlock,
} from '@harness/agent-protocol';

function textPhaseFromModel(
  phase?: 'pending' | 'commentary' | 'final_answer' | null,
): AssistantTextBlock['phase'] | undefined {
  if (phase === 'pending') return 'pending';
  if (phase === 'commentary') return 'process';
  if (phase === 'final_answer') return 'final';
  return undefined;
}

function completedTextPhase(phase: 'commentary' | 'final_answer'): 'process' | 'final' {
  if (phase === 'commentary') return 'process';
  return 'final';
}

// 将实时文本和工具生命周期折叠为可持久化的 assistant 有序内容块。
// 事实顺序由 roundSequence + blockSequence 决定，禁止按事件到达顺序直接 push。
export class ConversationBlockCollector {
  private readonly blocks: AssistantContentBlock[] = [];
  private textBlockCount = 0;

  constructor(private readonly messageId: string) {}

  appendReasoning(input: { delta: string; roundId: string; roundSequence: number; blockSequence: number }): string {
    const existing = this.blocks.find((b): b is AssistantReasoningBlock => b.type === 'reasoning' && b.roundId === input.roundId && b.blockSequence === input.blockSequence);
    if (existing) { existing.content += input.delta; return existing.id; }
    const block: AssistantReasoningBlock = { id: `${this.messageId}-reasoning-${input.roundSequence}-${input.blockSequence}`, type: 'reasoning', roundId: input.roundId, roundSequence: input.roundSequence, blockSequence: input.blockSequence, content: input.delta, startedAt: new Date().toISOString() };
    this.insert(block); return block.id;
  }

  completeReasoning(roundSequence: number, durationMs: number): void {
    const completedAt = new Date().toISOString();
    for (const block of this.blocks) if (block.type === 'reasoning' && block.roundSequence === roundSequence) {
      block.completedAt = completedAt; block.durationMs = durationMs;
    }
  }

  // 按 Round 内稳定位置合并文本增量；重放同一位置时只更新原 Block。
  appendText(input: {
    delta: string;
    roundId: string;
    roundSequence: number;
    blockSequence: number;
    phase?: 'pending' | 'commentary' | 'final_answer' | null;
  }): string {
    const existing = this.blocks.find(
      (block) =>
        block.type === 'text' &&
        block.roundId === input.roundId &&
        block.blockSequence === input.blockSequence,
    );
    if (existing?.type === 'text') {
      existing.content += input.delta;
      if (input.phase === 'pending') existing.phase = 'pending';
      if (input.phase === 'commentary') existing.phase = 'process';
      if (input.phase === 'final_answer') existing.phase = 'final';
      return existing.id;
    }
    this.textBlockCount += 1;
    const phase = textPhaseFromModel(input.phase);
    const block: AssistantTextBlock = {
      id: `${this.messageId}-text-${this.textBlockCount}`,
      type: 'text',
      roundId: input.roundId,
      roundSequence: input.roundSequence,
      blockSequence: input.blockSequence,
      content: input.delta,
      ...(phase ? { phase } : {}),
    };
    this.insert(block);
    return block.id;
  }

  completeTextPhase(input: {
    roundId: string;
    blockSequence: number;
    phase: 'commentary' | 'final_answer';
  }): string | undefined {
    const block = this.blocks.find(
      (item): item is AssistantTextBlock =>
        item.type === 'text' &&
        item.roundId === input.roundId &&
        item.blockSequence === input.blockSequence,
    );
    if (!block) return undefined;
    block.phase = completedTextPhase(input.phase);
    return block.id;
  }

  discardText(input: { roundId: string; blockSequence: number }): string | undefined {
    const index = this.blocks.findIndex(
      (item) =>
        item.type === 'text' &&
        item.roundId === input.roundId &&
        item.blockSequence === input.blockSequence,
    );
    if (index < 0) return undefined;
    const [block] = this.blocks.splice(index, 1);
    return block?.id;
  }

  appendUserIntervention(input: {
    inputId: string;
    content: string;
    roundId: string;
    roundSequence: number;
    blockSequence: number;
  }): AssistantUserInterventionBlock {
    const existing = this.blocks.find(
      (block): block is AssistantUserInterventionBlock =>
        block.type === 'user_intervention' && block.inputId === input.inputId,
    );
    if (existing) return { ...existing };
    const block: AssistantUserInterventionBlock = {
      ...input,
      id: `${this.messageId}-intervention-${input.inputId}`,
      type: 'user_intervention',
    };
    this.insert(block);
    return { ...block };
  }

  // 在模型声明的位置插入稳定的运行中工具活动块；重复 started 不会创建副本。
  startTool(input: {
    toolCallId: string;
    toolName: string;
    summary: string;
    startedAt: string;
    roundId: string;
    roundSequence: number;
    blockSequence: number;
  }): AssistantToolActivityBlock {
    const existing = this.findTool(input.toolCallId);
    if (existing) return { ...existing };
    const block: AssistantToolActivityBlock = {
      id: `${this.messageId}-tool-${input.toolCallId}`,
      type: 'tool_activity',
      roundId: input.roundId,
      roundSequence: input.roundSequence,
      blockSequence: input.blockSequence,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      status: 'running',
      title: this.toolTitle(input.toolName),
      summary: input.summary || undefined,
      startedAt: input.startedAt,
    };
    this.insert(block);
    return { ...block };
  }

  // 按 toolCallId 原位完成工具活动，保持它在文本时间线中的位置。
  completeTool(input: {
    toolCallId: string;
    completedAt: string;
    durationMs: number;
    summary: string;
  }): string {
    const block = this.requireTool(input.toolCallId);
    block.status = 'completed';
    block.summary = input.summary;
    block.completedAt = input.completedAt;
    block.durationMs = input.durationMs;
    return block.id;
  }

  appendArtifact(input: {
    artifact: ArtifactRef;
    roundId: string;
    roundSequence: number;
    blockSequence: number;
  }): AssistantArtifactBlock {
    const existing = this.blocks.find(
      (block): block is AssistantArtifactBlock =>
        block.type === 'artifact' && block.artifactId === input.artifact.artifactId,
    );
    if (existing) return { ...existing };
    const block: AssistantArtifactBlock = {
      ...input.artifact,
      id: `${this.messageId}-artifact-${input.artifact.artifactId}`,
      type: 'artifact',
      roundId: input.roundId,
      roundSequence: input.roundSequence,
      blockSequence: input.blockSequence,
    };
    this.insert(block);
    return { ...block };
  }

  // 按 toolCallId 原位标记工具失败，并保存安全的用户可见摘要。
  failTool(input: {
    toolCallId: string;
    completedAt: string;
    durationMs: number;
    detail: string;
  }): string {
    const block = this.requireTool(input.toolCallId);
    block.status = 'failed';
    block.summary = input.detail;
    block.completedAt = input.completedAt;
    block.durationMs = input.durationMs;
    return block.id;
  }

  // 按 toolCallId 原位标记工具取消，区别于供应商或执行失败。
  cancelTool(input: {
    toolCallId: string;
    completedAt: string;
    durationMs: number;
    detail: string;
  }): string {
    const block = this.requireTool(input.toolCallId);
    block.status = 'cancelled';
    block.summary = input.detail;
    block.completedAt = input.completedAt;
    block.durationMs = input.durationMs;
    return block.id;
  }

  // 返回深拷贝快照，避免持久化层修改正在构建的时间线。
  snapshot(): AssistantContentBlock[] {
    return this.blocks.map((block) => ({ ...block }));
  }

  // 拼接所有文本块，作为下一轮模型上下文和兼容消息正文。
  text(): string {
    return this.blocks
      .filter((block): block is AssistantTextBlock => block.type === 'text')
      .map((block) => block.content)
      .join('');
  }

  // 查找已经插入的工具活动块。
  private findTool(toolCallId: string): AssistantToolActivityBlock | undefined {
    return this.blocks.find(
      (block): block is AssistantToolActivityBlock =>
        block.type === 'tool_activity' && block.toolCallId === toolCallId,
    );
  }

  // 要求工具开始事件已经出现，避免完成事件被静默追加到错误位置。
  private requireTool(toolCallId: string): AssistantToolActivityBlock {
    const block = this.findTool(toolCallId);
    if (!block) throw new Error(`找不到工具活动块：${toolCallId}`);
    return block;
  }

  // 将 canonical 工具名转换为简洁的用户可见动作标题。
  private toolTitle(toolName: string): string {
    if (toolName === 'web_search') return '搜索网页';
    if (toolName === 'web_fetch') return '读取网页';
    if (toolName === 'search_file') return '搜索文件';
    if (toolName === 'read_file_lines') return '读取文件';
    if (toolName === 'create_file') return '生成文件';
    if (toolName === 'execute_command') return '执行命令';
    return `运行工具 ${toolName}`;
  }

  private insert(block: AssistantContentBlock): void {
    // 旧历史消息可能没有 Round 字段，统一放在有序 Round 之后并保持原数组相对顺序。
    const roundSequence = block.roundSequence ?? Number.MAX_SAFE_INTEGER;
    const blockSequence = block.blockSequence ?? Number.MAX_SAFE_INTEGER;
    const index = this.blocks.findIndex((current) => {
      const currentRound = current.roundSequence ?? Number.MAX_SAFE_INTEGER;
      const currentBlock = current.blockSequence ?? Number.MAX_SAFE_INTEGER;
      return (
        currentRound > roundSequence ||
        (currentRound === roundSequence && currentBlock > blockSequence)
      );
    });
    if (index < 0) this.blocks.push(block);
    else this.blocks.splice(index, 0, block);
  }
}
