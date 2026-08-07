import type {
  AssistantContentBlock,
  AssistantTextBlock,
  AssistantToolActivityBlock,
} from '@harness/agent-protocol';

// 将实时文本和工具生命周期折叠为可持久化的 assistant 有序内容块。
export class ConversationBlockCollector {
  private readonly blocks: AssistantContentBlock[] = [];
  private textBlockCount = 0;

  constructor(private readonly messageId: string) {}

  // 合并连续文本增量；被工具活动打断后创建新的文本块。
  appendText(delta: string): string {
    const last = this.blocks.at(-1);
    if (last?.type === 'text') {
      last.content += delta;
      return last.id;
    }
    this.textBlockCount += 1;
    const block: AssistantTextBlock = {
      id: `${this.messageId}-text-${this.textBlockCount}`,
      type: 'text',
      content: delta,
    };
    this.blocks.push(block);
    return block.id;
  }

  // 在当前时间位置插入一个稳定的运行中工具活动块。
  startTool(input: {
    toolCallId: string;
    toolName: string;
    query: string;
    startedAt: string;
  }): AssistantToolActivityBlock {
    const existing = this.findTool(input.toolCallId);
    if (existing) return { ...existing };
    const block: AssistantToolActivityBlock = {
      id: `${this.messageId}-tool-${input.toolCallId}`,
      type: 'tool_activity',
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      status: 'running',
      title: this.toolTitle(input.toolName),
      summary: input.query || undefined,
      startedAt: input.startedAt,
    };
    this.blocks.push(block);
    return { ...block };
  }

  // 按 toolCallId 原位完成工具活动，保持它在文本时间线中的位置。
  completeTool(input: {
    toolCallId: string;
    completedAt: string;
    durationMs: number;
    resultCount: number;
  }): string {
    const block = this.requireTool(input.toolCallId);
    block.status = 'completed';
    block.summary = `找到 ${input.resultCount} 个结果`;
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
    return toolName === 'web_search' ? '搜索网页' : `运行工具 ${toolName}`;
  }
}
