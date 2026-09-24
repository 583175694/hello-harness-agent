import type {
  AssistantContentBlock,
  AssistantTextBlock,
  AssistantUserInterventionBlock,
  BashBackgroundResult,
  BashPublicToolResult,
  ChatStreamEvent,
} from '@harness/agent-protocol';

import type { ToolStreamEvent } from '@harness/agent-client';
import { toolInputSummary, toolTitle } from './tool-copy';

type MessageDeltaEvent = Extract<ChatStreamEvent, { type: 'message.delta' }>;
type MessagePhaseCompletedEvent = Extract<ChatStreamEvent, { type: 'message.phase.completed' }>;
type MessageDiscardedEvent = Extract<ChatStreamEvent, { type: 'message.discarded' }>;

function conversationTextPhase(
  phase?: 'pending' | 'commentary' | 'final_answer' | null,
): AssistantTextBlock['phase'] | undefined {
  if (phase === 'pending') return 'pending';
  if (phase === 'commentary') return 'process';
  if (phase === 'final_answer') return 'final';
  return undefined;
}

function isBashBackgroundToolResult(
  result: BashPublicToolResult,
): result is BashBackgroundResult {
  return 'kind' in result && result.kind === 'background';
}

function toolActivityStartSummary(event: Extract<ToolStreamEvent, { type: 'tool.started' }>): string {
  if (event.toolName === 'web_fetch' || event.toolName === 'create_report') {
    return toolTitle(event.toolName, event.input);
  }
  if (
    event.toolName === 'bash' &&
    'presentation' in event &&
    event.presentation === 'terminal' &&
    'description' in event &&
    typeof event.description === 'string'
  ) {
    return event.description;
  }
  return toolInputSummary(event.toolName, event.input);
}

function bashTerminalBlockPatch(
  event: ToolStreamEvent,
): Partial<Extract<AssistantContentBlock, { type: 'tool_activity' }>> {
  if (event.toolName !== 'bash') return {};
  if (!('presentation' in event) || event.presentation !== 'terminal') return {};
  return {
    presentation: 'terminal' as const,
    ...( 'description' in event && typeof event.description === 'string'
      ? { description: event.description }
      : {}),
    ...( 'terminalView' in event && event.terminalView ? { terminalView: event.terminalView } : {}),
    ...(event.type === 'tool.completed' && 'exitCode' in event
      ? { exitCode: event.exitCode ?? null }
      : {}),
    ...(event.type === 'tool.completed' &&
    'exitSignal' in event &&
    (event.exitSignal === null || typeof event.exitSignal === 'string')
      ? { exitSignal: event.exitSignal }
      : {}),
  };
}

function toolActivityCompletedSummary(
  event: Extract<ToolStreamEvent, { type: 'tool.completed' }>,
  currentSummary: string,
): string {
  if (event.toolName === 'web_search') return currentSummary;
  if (event.toolName === 'web_fetch') {
    const succeeded = event.result.results.filter((item) => item.status === 'succeeded');
    const passageCount = succeeded.reduce((total, item) => total + item.passages.length, 0);
    return `成功 ${succeeded.length} 个，失败 ${event.result.results.length - succeeded.length} 个，提取 ${passageCount} 段原文`;
  }
  if (event.toolName === 'approval_test') return '审批测试已完成';
  if (event.toolName === 'get_current_time') return '当前时间已获取';
  if (event.toolName === 'search_file') return `找到 ${event.result.matches.length} 个文件命中`;
  if (event.toolName === 'read_file_lines') return `读取 ${event.result.lines.length} 行文件内容`;
  if (event.toolName === 'create_file') return `已生成 ${event.result.file.fileName}`;
  if (event.toolName === 'create_report') return `生成报告：${event.result.report.title}`;
  if (event.toolName === 'bash' || event.toolName === 'execute_command') {
    const commandResult = event.result;
    if (isBashBackgroundToolResult(commandResult)) {
      return `后台 job 已启动，job id：${commandResult.jobId}`;
    }
    const collected =
      commandResult.collection?.status === 'collected' ? '，已收集输出文件' : '';
    return `命令完成，退出码 ${commandResult.exitCode ?? '无'}${collected}`;
  }
  return currentSummary;
}

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
  // 将新块插入按 Round 和 Block 序号排序后应处的位置。
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
    const phase = conversationTextPhase(event.phase);
    return insertOrdered(blocks, {
      id: event.blockId,
      type: 'text',
      content: event.delta,
      ...(event.roundId ? { roundId: event.roundId } : {}),
      ...(event.roundSequence ? { roundSequence: event.roundSequence } : {}),
      ...(event.blockSequence !== undefined ? { blockSequence: event.blockSequence } : {}),
      ...(phase ? { phase } : {}),
    });
  }
  const phase = conversationTextPhase(event.phase);
  return orderAssistantBlocks(
    blocks.map((block, blockIndex) =>
      blockIndex === index
        ? {
            ...block,
            content: `${(block as AssistantTextBlock).content}${event.delta}`,
            ...(event.roundId ? { roundId: event.roundId } : {}),
            ...(event.roundSequence ? { roundSequence: event.roundSequence } : {}),
            ...(event.blockSequence !== undefined ? { blockSequence: event.blockSequence } : {}),
            ...(phase ? { phase } : {}),
          }
        : block,
    ),
  );
}

export function appendReasoningDelta(blocks: AssistantContentBlock[], event: Extract<ChatStreamEvent, { type: 'reasoning.delta' }>): AssistantContentBlock[] {
  const index = blocks.findIndex((b) => b.type === 'reasoning' && b.id === event.blockId);
  if (index < 0) return insertOrdered(blocks, { id: event.blockId, type: 'reasoning', roundId: event.roundId, roundSequence: event.roundSequence, blockSequence: event.blockSequence, content: event.delta, startedAt: new Date().toISOString() });
  return orderAssistantBlocks(blocks.map((b, i) => i === index && b.type === 'reasoning' ? { ...b, content: b.content + event.delta } : b));
}

export function completeReasoning(blocks: AssistantContentBlock[], roundSequence: number, durationMs: number): AssistantContentBlock[] {
  const completedAt = new Date().toISOString();
  return blocks.map((b) => b.type === 'reasoning' && b.roundSequence === roundSequence ? { ...b, completedAt, durationMs } : b);
}

export function completeTextPhase(
  blocks: AssistantContentBlock[],
  event: MessagePhaseCompletedEvent,
): AssistantContentBlock[] {
  const phase = event.phase === 'commentary' ? 'process' : 'final';
  return blocks.map((block) =>
    block.type === 'text' && block.id === event.blockId ? { ...block, phase } : block,
  );
}

export function discardTextBlock(
  blocks: AssistantContentBlock[],
  event: MessageDiscardedEvent,
): AssistantContentBlock[] {
  return blocks.filter((block) => !(block.type === 'text' && block.id === event.blockId));
}

export function appendUserIntervention(
  blocks: AssistantContentBlock[],
  event: Extract<ChatStreamEvent, { type: 'user.intervention' }>,
): AssistantContentBlock[] {
  if (blocks.some((block) => block.type === 'user_intervention' && block.inputId === event.inputId))
    return blocks;
  return insertOrdered(blocks, {
    id: event.blockId,
    type: 'user_intervention',
    inputId: event.inputId,
    content: event.content,
    roundId: event.roundId,
    roundSequence: event.roundSequence,
    blockSequence: event.blockSequence,
  } as AssistantUserInterventionBlock);
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
          blockIndex === index && block.type === 'tool_activity'
            ? {
                ...block,
                ...(event.roundId ? { roundId: event.roundId } : {}),
                ...(event.roundSequence ? { roundSequence: event.roundSequence } : {}),
                ...(event.blockSequence !== undefined
                  ? { blockSequence: event.blockSequence }
                  : {}),
                ...bashTerminalBlockPatch(event),
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
      summary: toolActivityStartSummary(event),
      startedAt: event.startedAt,
      ...bashTerminalBlockPatch(event),
    });
  }
  if (index < 0) return blocks;
  if (
    event.type === 'tool.completed' &&
    (event.toolName === 'bash' || event.toolName === 'execute_command') &&
    'collection' in event.result &&
    event.result.collection?.status === 'collected'
  ) {
    const updated = blocks.map((block, blockIndex) =>
      blockIndex === index && block.type === 'tool_activity'
        ? {
            ...block,
            status: 'completed' as const,
            summary: toolActivityCompletedSummary(event, block.summary ?? ''),
            completedAt: event.completedAt,
            durationMs: event.durationMs,
            ...bashTerminalBlockPatch(event),
          }
        : block,
    );
    const artifact = event.result.collection.artifact;
    if (updated.some((block) => block.type === 'artifact' && block.artifactId === artifact.artifactId))
      return orderAssistantBlocks(updated);
    return insertOrdered(updated, {
      id: event.blockId.replace(/tool-/u, 'artifact-'),
      type: 'artifact',
      ...artifact,
      roundId: event.roundId,
      roundSequence: event.roundSequence,
      blockSequence: event.blockSequence,
    });
  }
  if (
    event.type === 'tool.completed' &&
    (event.toolName === 'create_file' || event.toolName === 'create_report')
  ) {
    const updated = blocks.map((block, blockIndex) =>
      blockIndex === index && block.type === 'tool_activity'
        ? {
            ...block,
            status: 'completed' as const,
            summary: toolActivityCompletedSummary(event, block.summary ?? ''),
            completedAt: event.completedAt,
            durationMs: event.durationMs,
          }
        : block,
    );
    if (
      updated.some(
        (block) =>
          block.type === 'artifact' && block.artifactId === event.result.artifact.artifactId,
      )
    )
      return orderAssistantBlocks(updated);
    return insertOrdered(updated, {
      id: event.blockId.replace(/tool-/u, 'artifact-'),
      type: 'artifact',
      ...event.result.artifact,
      roundId: event.roundId,
      roundSequence: event.roundSequence,
      blockSequence: event.blockSequence,
    });
  }
  return blocks.map((block, blockIndex) => {
    if (blockIndex !== index || block.type !== 'tool_activity') return block;
    if (event.type === 'tool.completed') {
      return {
        ...block,
        status: 'completed',
        summary: toolActivityCompletedSummary(event, block.summary ?? ''),
        completedAt: event.completedAt,
        durationMs: event.durationMs,
        ...bashTerminalBlockPatch(event),
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
  return orderAssistantBlocks(blocks.map((block) => ({ ...block })));
}
