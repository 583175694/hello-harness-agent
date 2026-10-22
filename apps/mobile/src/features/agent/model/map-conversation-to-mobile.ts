import type { AssistantToolActivityBlock } from '@harness/agent-protocol';
import {
  bashCoTLabel,
  isBashTransparentTool,
  isMcpPublicToolName,
  mcpInlineActivityLabel,
  presentAssistantBlocks,
} from '@harness/agent-conversation';
import type { ConversationItem } from '@harness/agent-ui-types';

import type {
  MobileAssistantBlock,
  MobileConversationItem,
} from '../fixtures/mobile-preview.types';
import type { ToolActivityFixture, ToolActivityStatus } from '../fixtures/ui-fixtures';

function mapToolStatus(status: AssistantToolActivityBlock['status']): ToolActivityStatus {
  return status;
}

function mapToolActivityBlock(block: AssistantToolActivityBlock): ToolActivityFixture {
  const mcp = isMcpPublicToolName(block.toolName);
  const bash = isBashTransparentTool(block);
  const summaryRaw = block.summary?.trim() ?? '';
  let name: string;
  if (bash) {
    name = bashCoTLabel(block);
  } else if (mcp) {
    name = mcpInlineActivityLabel(block);
  } else if (block.toolName === 'web_search') {
    name = summaryRaw ? `搜索：${summaryRaw}` : block.title;
  } else {
    name = block.title || block.toolName;
  }
  const summary =
    summaryRaw && block.toolName !== 'web_search' && !bash && !mcp ? summaryRaw : '';
  const duration =
    block.durationMs !== undefined
      ? block.durationMs < 1000
        ? `${block.durationMs}ms`
        : `${(block.durationMs / 1000).toFixed(1)}s`
      : undefined;
  return {
    id: block.toolCallId,
    toolName: block.toolName,
    name,
    summary,
    status: mapToolStatus(block.status),
    duration,
    startedAt: block.startedAt,
    completedAt: block.completedAt,
    statusLabel:
      block.status === 'running'
        ? '执行中'
        : block.status === 'failed'
          ? '失败'
          : block.status === 'cancelled'
            ? '已取消'
            : undefined,
  };
}

function mapAssistantPresentation(item: Extract<ConversationItem, { kind: 'assistant' }>): {
  process: MobileAssistantBlock[];
  pendingText: string;
  finalText: string;
  blocks: MobileAssistantBlock[];
} {
  const presentation = presentAssistantBlocks(item.blocks);
  const process: MobileAssistantBlock[] = [];

  for (const entry of presentation.process) {
    if (entry.kind === 'text') {
      if (entry.block.content.trim()) {
        process.push({ type: 'text', content: entry.block.content });
      }
      continue;
    }
    if (entry.kind === 'reasoning') {
      process.push({
        type: 'reasoning',
        content: entry.block.content,
        durationMs: entry.block.durationMs,
        streaming: !entry.block.completedAt,
        startedAt: entry.block.startedAt,
        completedAt: entry.block.completedAt,
      });
      continue;
    }
    process.push({ type: 'tool_activity', item: mapToolActivityBlock(entry.block) });
  }

  const blocks: MobileAssistantBlock[] = [...process];
  if (presentation.pendingText.trim()) {
    blocks.push({ type: 'text', content: presentation.pendingText });
  }
  if (presentation.finalText.trim()) {
    blocks.push({ type: 'text', content: presentation.finalText });
  }

  for (const artifact of presentation.artifacts) {
    blocks.push({
      type: 'artifact',
      fileName: artifact.fileName,
      versionNumber: artifact.versionNumber,
    });
  }

  if (!blocks.length && item.blocks.length === 0) {
    blocks.push({ type: 'text', content: '' });
  }

  return {
    process,
    pendingText: presentation.pendingText,
    finalText: presentation.finalText,
    blocks,
  };
}

export function mapConversationItemToMobile(item: ConversationItem): MobileConversationItem {
  if (item.kind === 'user') {
    return {
      kind: 'user',
      content: item.content,
      pendingState: item.pendingState,
      skillNames: item.skillNames,
      attachments: item.attachments,
    };
  }

  const streaming = item.deliveryStatus === 'streaming' || item.pending === true;
  const mapped = mapAssistantPresentation(item);
  return {
    kind: 'assistant',
    deliveryStatus: item.deliveryStatus,
    streaming,
    process: mapped.process,
    pendingText: mapped.pendingText,
    finalText: mapped.finalText,
    errorDetail: item.error?.detail,
    blocks: mapped.blocks,
  };
}

export function mapConversationToMobile(items: ConversationItem[]): MobileConversationItem[] {
  return items.map(mapConversationItemToMobile);
}
