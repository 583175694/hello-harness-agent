import type {
  AssistantContentBlock,
  AssistantTextBlock,
  AssistantToolActivityBlock,
  ChatStreamEvent,
} from '@harness/agent-protocol';

import type { ToolStreamEvent } from '../../../api/client';

type MessageDeltaEvent = Extract<ChatStreamEvent, { type: 'message.delta' }>;

// 将同一文本块的增量追加到原位置，不存在时按当前时序插入新块。
export function appendTextDelta(
  blocks: AssistantContentBlock[],
  event: MessageDeltaEvent,
): AssistantContentBlock[] {
  const index = blocks.findIndex((block) => block.id === event.blockId && block.type === 'text');
  if (index < 0) {
    return [...blocks, { id: event.blockId, type: 'text', content: event.delta }];
  }
  return blocks.map((block, blockIndex) => blockIndex === index
    ? { ...block, content: `${(block as AssistantTextBlock).content}${event.delta}` }
    : block);
}

// 将工具生命周期事件投影为一个稳定 Activity 块，完成或失败时只原位更新。
export function applyToolActivityEvent(
  blocks: AssistantContentBlock[],
  event: ToolStreamEvent,
): AssistantContentBlock[] {
  const index = blocks.findIndex((block) =>
    block.type === 'tool_activity' && block.toolCallId === event.toolCallId);
  if (event.type === 'tool.started') {
    if (index >= 0) return blocks;
    return [...blocks, {
      id: event.blockId,
      type: 'tool_activity',
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      status: 'running',
      title: event.title,
      summary: event.toolName === 'web_fetch'
        ? `读取 ${event.input.urls.length} 个网页`
        : event.input.query,
      startedAt: event.startedAt,
    }];
  }
  if (index < 0) return blocks;
  return blocks.map((block, blockIndex) => {
    if (blockIndex !== index || block.type !== 'tool_activity') return block;
    if (event.type === 'tool.completed') {
      const succeeded = event.toolName === 'web_fetch'
        ? event.result.results.filter((item) => item.status === 'succeeded')
        : [];
      const passageCount = succeeded.reduce((total, item) => total + item.passages.length, 0);
      return {
        ...block,
        status: 'completed',
        summary: event.toolName === 'web_fetch'
          ? `成功 ${succeeded.length} 个，失败 ${event.result.results.length - succeeded.length} 个，提取 ${passageCount} 段原文`
          : `找到 ${event.result.results.length} 个结果`,
        completedAt: event.completedAt,
        durationMs: event.durationMs,
      };
    }
    return event.type === 'tool.cancelled'
      ? {
          ...block,
          status: 'cancelled',
          summary: event.detail,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
        }
      : {
          ...block,
          status: 'failed',
          summary: event.detail,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
        };
  });
}

// 拼接 assistant 的纯文本块，用于复制和下一轮上下文等非 UI 场景。
export function flattenAssistantText(blocks: AssistantContentBlock[]): string {
  return blocks
    .filter((block): block is AssistantTextBlock => block.type === 'text')
    .map((block) => block.content)
    .join('');
}

// 将持久化块复制为前端可安全更新的独立对象。
export function cloneAssistantBlocks(blocks: AssistantContentBlock[]): AssistantContentBlock[] {
  return blocks.map((block) => ({ ...block } as AssistantTextBlock | AssistantToolActivityBlock));
}
