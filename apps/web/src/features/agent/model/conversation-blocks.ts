import type {
  AssistantContentBlock,
  AssistantTextBlock,
  AssistantToolActivityBlock,
  AssistantReasoningBlock,
  ChatStreamEvent,
} from '@harness/agent-protocol';

import type { ToolStreamEvent } from '../../../api/client';

type MessageDeltaEvent = Extract<ChatStreamEvent, { type: 'message.delta' }>;
type ReasoningDeltaEvent = Extract<ChatStreamEvent, { type: 'reasoning.delta' }>;

function compareBlockOrder(left: AssistantContentBlock, right: AssistantContentBlock): number {
  const leftRound = left.roundSequence ?? Number.MAX_SAFE_INTEGER;
  const rightRound = right.roundSequence ?? Number.MAX_SAFE_INTEGER;
  if (leftRound !== rightRound) return leftRound - rightRound;
  const leftBlock = left.blockSequence ?? Number.MAX_SAFE_INTEGER;
  const rightBlock = right.blockSequence ?? Number.MAX_SAFE_INTEGER;
  return leftBlock - rightBlock;
}

// Snapshot、历史消息与 Live Event 最终都经过同一个稳定排序入口。
// JavaScript 的稳定排序保证旧消息缺少 Round 字段时仍保持原数组相对顺序。
export function orderAssistantBlocks(blocks: AssistantContentBlock[]): AssistantContentBlock[] {
  return [...blocks].sort(compareBlockOrder);
}

function insertOrdered(
  blocks: AssistantContentBlock[],
  block: AssistantContentBlock,
): AssistantContentBlock[] {
  // 与服务端 Collector 使用相同排序规则，保证 Live SSE、Tail replay 和历史 Snapshot 同构。
  const roundSequence = block.roundSequence ?? Number.MAX_SAFE_INTEGER;
  const blockSequence = block.blockSequence ?? Number.MAX_SAFE_INTEGER;
  const index = blocks.findIndex((current) => {
    const currentRound = current.roundSequence ?? Number.MAX_SAFE_INTEGER;
    const currentBlock = current.blockSequence ?? Number.MAX_SAFE_INTEGER;
    return (
      currentRound > roundSequence ||
      (currentRound === roundSequence && currentBlock > blockSequence)
    );
  });
  if (index < 0) return [...blocks, block];
  return [...blocks.slice(0, index), block, ...blocks.slice(index)];
}

// 将同一文本块的增量追加到原位置，不存在时按稳定业务顺序插入；禁止按 SSE 到达顺序追加。
export function appendTextDelta(
  blocks: AssistantContentBlock[],
  event: MessageDeltaEvent,
): AssistantContentBlock[] {
  const index = blocks.findIndex((block) => block.id === event.blockId && block.type === 'text');
  if (index < 0) {
    return insertOrdered(blocks, {
      id: event.blockId,
      type: 'text',
      content: event.delta,
      ...(event.roundId ? { roundId: event.roundId } : {}),
      ...(event.roundSequence ? { roundSequence: event.roundSequence } : {}),
      ...(event.blockSequence !== undefined ? { blockSequence: event.blockSequence } : {}),
    });
  }
  return orderAssistantBlocks(
    blocks.map((block, blockIndex) =>
      blockIndex === index
        ? {
            ...block,
            content: `${(block as AssistantTextBlock).content}${event.delta}`,
            ...(event.roundId ? { roundId: event.roundId } : {}),
            ...(event.roundSequence ? { roundSequence: event.roundSequence } : {}),
            ...(event.blockSequence !== undefined ? { blockSequence: event.blockSequence } : {}),
          }
        : block,
    ),
  );
}

export function appendReasoningDelta(
  blocks: AssistantContentBlock[],
  event: ReasoningDeltaEvent,
): AssistantContentBlock[] {
  const index = blocks.findIndex(
    (block) => block.id === event.blockId && block.type === 'reasoning',
  );
  if (index < 0) {
    return insertOrdered(blocks, {
      id: event.blockId,
      type: 'reasoning',
      content: event.delta,
      roundId: event.roundId,
      roundSequence: event.roundSequence,
      blockSequence: event.blockSequence,
    });
  }
  return orderAssistantBlocks(
    blocks.map((block, blockIndex) =>
      blockIndex === index
        ? { ...block, content: `${(block as AssistantReasoningBlock).content}${event.delta}` }
        : block,
    ),
  );
}

// 将工具生命周期事件投影为一个稳定 Activity 块，完成或失败时只原位更新。
// replay 的重复 started 不创建副本，缺少 started 的终态也不猜测插入位置。
export function applyToolActivityEvent(
  blocks: AssistantContentBlock[],
  event: ToolStreamEvent,
): AssistantContentBlock[] {
  const index = blocks.findIndex(
    (block) => block.type === 'tool_activity' && block.toolCallId === event.toolCallId,
  );
  if (event.type === 'tool.started') {
    if (index >= 0)
      return orderAssistantBlocks(
        blocks.map((block, blockIndex) =>
          blockIndex === index
            ? {
                ...block,
                ...(event.roundId ? { roundId: event.roundId } : {}),
                ...(event.roundSequence ? { roundSequence: event.roundSequence } : {}),
                ...(event.blockSequence !== undefined
                  ? { blockSequence: event.blockSequence }
                  : {}),
              }
            : block,
        ),
      );
    return insertOrdered(blocks, {
      id: event.blockId,
      type: 'tool_activity',
      ...(event.roundId ? { roundId: event.roundId } : {}),
      ...(event.roundSequence ? { roundSequence: event.roundSequence } : {}),
      ...(event.blockSequence !== undefined ? { blockSequence: event.blockSequence } : {}),
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      status: 'running',
      title: event.title,
      summary:
        event.toolName === 'web_fetch'
          ? `读取 ${event.input.urls.length} 个网页`
          : event.input.query,
      startedAt: event.startedAt,
    });
  }
  if (index < 0) return blocks;
  return blocks.map((block, blockIndex) => {
    if (blockIndex !== index || block.type !== 'tool_activity') return block;
    if (event.type === 'tool.completed') {
      const succeeded =
        event.toolName === 'web_fetch'
          ? event.result.results.filter((item) => item.status === 'succeeded')
          : [];
      const passageCount = succeeded.reduce((total, item) => total + item.passages.length, 0);
      return {
        ...block,
        status: 'completed',
        summary:
          event.toolName === 'web_fetch'
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
  return orderAssistantBlocks(
    blocks.map(
      (block) =>
        ({ ...block }) as AssistantTextBlock | AssistantReasoningBlock | AssistantToolActivityBlock,
    ),
  );
}
