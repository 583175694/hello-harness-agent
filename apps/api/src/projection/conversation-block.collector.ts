import type {
  AssistantContentBlock,
  AssistantTextBlock,
  AssistantToolActivityBlock,
} from '@harness/agent-protocol';

// 将实时文本和工具生命周期折叠为可持久化的 assistant 有序内容块。
// 事实顺序由 roundSequence + blockSequence 决定，禁止按事件到达顺序直接 push。
export class ConversationBlockCollector {
  private readonly blocks: AssistantContentBlock[] = [];
  private textBlockCount = 0;

  constructor(private readonly messageId: string) {}

  // 按 Round 内稳定位置合并文本增量；重放同一位置时只更新原 Block。
  appendText(input: {
    delta: string;
    roundId: string;
    roundSequence: number;
    blockSequence: number;
  }): string {
    const existing = this.blocks.find(
      (block) =>
        block.type === 'text' &&
        block.roundId === input.roundId &&
        block.blockSequence === input.blockSequence,
    );
    if (existing?.type === 'text') {
      existing.content += input.delta;
      return existing.id;
    }
    this.textBlockCount += 1;
    const block: AssistantTextBlock = {
      id: `${this.messageId}-text-${this.textBlockCount}`,
      type: 'text',
      roundId: input.roundId,
      roundSequence: input.roundSequence,
      blockSequence: input.blockSequence,
      content: input.delta,
    };
    this.insert(block);
    return block.id;
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
