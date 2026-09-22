import type { ChatStreamEvent } from '@harness/agent-protocol';
import { describe, expect, it } from 'vitest';

import {
  appendTextDelta,
  appendUserIntervention,
  applyToolActivityEvent,
  cloneAssistantBlocks,
  flattenAssistantText,
} from './conversation-blocks';

describe('conversation blocks reducer', () => {
  it('repairs and reorders an existing text block when its round coordinates arrive later', () => {
    const finalBlock = {
      id: 'text-final',
      type: 'text' as const,
      roundId: 'round-5',
      roundSequence: 5,
      blockSequence: 0,
      content: '最终正文',
    };
    const staleFirstBlock = {
      id: 'text-first',
      type: 'text' as const,
      content: '工具前言',
    };

    const blocks = appendTextDelta([finalBlock, staleFirstBlock], {
      type: 'message.delta',
      messageId: 'message-1',
      blockId: 'text-first',
      delta: '。',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    });

    expect(blocks.map((block) => block.id)).toEqual(['text-first', 'text-final']);
    expect(blocks[0]).toMatchObject({
      content: '工具前言。',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    });
  });

  it('canonically sorts snapshot blocks before rendering', () => {
    const blocks = cloneAssistantBlocks([
      {
        id: 'final',
        type: 'text',
        content: '最终正文',
        roundId: 'round-5',
        roundSequence: 5,
        blockSequence: 0,
      },
      {
        id: 'preamble',
        type: 'text',
        content: '工具前言',
        roundId: 'round-1',
        roundSequence: 1,
        blockSequence: 0,
      },
    ]);

    expect(blocks.map((block) => block.id)).toEqual(['preamble', 'final']);
  });

  it('keeps reasoning blocks when restoring snapshots', () => {
    const blocks = cloneAssistantBlocks([
      {
        id: 'reasoning',
        type: 'reasoning',
        content: '内部推理',
        roundId: 'round-1',
        roundSequence: 1,
        blockSequence: 0,
      },
      {
        id: 'answer',
        type: 'text',
        content: '回答',
        roundId: 'round-1',
        roundSequence: 1,
        blockSequence: 1,
      },
    ]);

    expect(blocks).toEqual([
      expect.objectContaining({ id: 'reasoning', type: 'reasoning' }),
      expect.objectContaining({ id: 'answer', type: 'text' }),
    ]);
  });

  it('preserves text-tool-text order and updates one tool block in place', () => {
    let blocks = appendTextDelta([], {
      type: 'message.delta',
      messageId: 'message-1',
      blockId: 'text-1',
      delta: '先检索。',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    });
    blocks = applyToolActivityEvent(blocks, {
      type: 'tool.started',
      messageId: 'message-1',
      blockId: 'tool-1',
      toolCallId: 'call-1',
      toolName: 'web_search',
      title: '读取业务数据',
      input: { query: '市场数据' },
      startedAt: '2026-08-07T09:00:00.000Z',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 1,
    });
    blocks = applyToolActivityEvent(blocks, {
      type: 'tool.completed',
      messageId: 'message-1',
      blockId: 'tool-1',
      toolCallId: 'call-1',
      toolName: 'web_search',
      completedAt: '2026-08-07T09:00:01.000Z',
      durationMs: 1000,
      result: { query: '市场数据', provider: 'serp', results: [] },
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 1,
    });
    blocks = appendTextDelta(blocks, {
      type: 'message.delta',
      messageId: 'message-1',
      blockId: 'text-2',
      delta: '得到结论。',
      roundId: 'round-2',
      roundSequence: 2,
      blockSequence: 0,
    });

    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.type)).toEqual(['text', 'tool_activity', 'text']);
    expect(blocks[1]).toMatchObject({ id: 'tool-1', title: '读取业务数据', status: 'completed' });
    expect(flattenAssistantText(blocks)).toBe('先检索。得到结论。');
  });

  it('stores bash terminal view on started events', () => {
    const blocks = applyToolActivityEvent([], {
      type: 'tool.started',
      messageId: 'message-1',
      blockId: 'tool-bash',
      toolCallId: 'call-bash',
      toolName: 'bash',
      title: 'Bash',
      presentation: 'terminal',
      description: 'Open GitHub home page',
      terminalView: {
        description: 'Open GitHub home page',
        command: 'agent-browser open https://github.com',
      },
      input: {
        command: 'agent-browser open https://github.com',
        description: 'Open GitHub home page',
        workdir: '.',
        timeoutMs: 120_000,
      },
      startedAt: '2026-09-21T09:00:00.000Z',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    });

    expect(blocks[0]).toMatchObject({
      type: 'tool_activity',
      summary: 'Open GitHub home page',
      presentation: 'terminal',
      terminalView: {
        description: 'Open GitHub home page',
        command: 'agent-browser open https://github.com',
      },
    });
  });

  it('projects tool cancellation separately from failure', () => {
    const started = applyToolActivityEvent([], {
      type: 'tool.started',
      messageId: 'message-1',
      blockId: 'tool-1',
      toolCallId: 'call-1',
      toolName: 'web_search',
      title: '搜索网页',
      input: { query: '测试' },
      startedAt: '2026-08-07T09:00:00.000Z',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    });
    const cancelledEvent: Extract<ChatStreamEvent, { type: 'tool.cancelled' }> = {
      type: 'tool.cancelled',
      messageId: 'message-1',
      blockId: 'tool-1',
      toolCallId: 'call-1',
      toolName: 'web_search',
      completedAt: '2026-08-07T09:00:01.000Z',
      durationMs: 1000,
      code: 'SEARCH_CANCELLED',
      detail: '网页搜索已取消。',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    };

    expect(applyToolActivityEvent(started, cancelledEvent)).toEqual([
      expect.objectContaining({ id: 'tool-1', status: 'cancelled', summary: '网页搜索已取消。' }),
    ]);
  });

  it('inserts a report artifact as soon as create_report completes', () => {
    const started = applyToolActivityEvent([], {
      type: 'tool.started',
      messageId: 'message-1',
      blockId: 'tool-report',
      toolCallId: 'call-report',
      toolName: 'create_report',
      title: '生成报告：走势复盘',
      input: {
        title: '走势复盘',
        summary: '摘要',
        fileName: 'report.md',
        contentCharacterCount: 12,
        contentByteCount: 12,
      },
      startedAt: '2026-09-21T09:00:00.000Z',
      roundId: 'round-10',
      roundSequence: 10,
      blockSequence: 1,
    });
    const blocks = applyToolActivityEvent(started, {
      type: 'tool.completed',
      messageId: 'message-1',
      blockId: 'tool-report',
      toolCallId: 'call-report',
      toolName: 'create_report',
      completedAt: '2026-09-21T09:00:01.000Z',
      durationMs: 80,
      result: {
        report: {
          reportId: 'report-1',
          artifactId: 'artifact-report',
          runId: 'run-1',
          title: '走势复盘',
          summary: '摘要',
          sourceIds: [],
          fileIds: [],
          status: 'ready',
          createdAt: '2026-09-21T09:00:01.000Z',
          updatedAt: '2026-09-21T09:00:01.000Z',
        },
        artifact: {
          artifactId: 'artifact-report',
          fileId: 'file-report',
          fileName: 'report.md',
          mediaType: 'text/markdown',
          fileKind: 'markdown',
          size: 12,
          status: 'ready',
          createdAt: '2026-09-21T09:00:01.000Z',
        },
        file: {
          fileId: 'file-report',
          fileName: 'report.md',
          mediaType: 'text/markdown',
          size: 12,
          status: 'ready',
          fileKind: 'markdown',
        },
      },
      roundId: 'round-10',
      roundSequence: 10,
      blockSequence: 1,
    });

    expect(blocks.map((block) => block.type)).toEqual(['tool_activity', 'artifact']);
    expect(blocks[0]).toMatchObject({
      type: 'tool_activity',
      status: 'completed',
      summary: '生成报告：走势复盘',
    });
    expect(blocks[1]).toMatchObject({
      type: 'artifact',
      artifactId: 'artifact-report',
      fileName: 'report.md',
    });
  });

  it('projects execute_command completion and collected artifacts', () => {
    const started = applyToolActivityEvent([], {
      type: 'tool.started',
      messageId: 'message-1',
      blockId: 'tool-cmd',
      toolCallId: 'call-cmd',
      toolName: 'execute_command',
      title: '执行命令',
      input: {
        command: 'python3 summarize.py',
        description: 'run summarize script',
        workdir: '.',
        timeoutMs: 30_000,
        inputFiles: [{ fileId: 'file-1', path: 'summarize.py' }],
        output: { path: 'out.txt', fileName: 'out.txt' },
      },
      startedAt: '2026-09-21T09:00:00.000Z',
      roundId: 'round-3',
      roundSequence: 3,
      blockSequence: 1,
    });
    const blocks = applyToolActivityEvent(started, {
      type: 'tool.completed',
      messageId: 'message-1',
      blockId: 'tool-cmd',
      toolCallId: 'call-cmd',
      toolName: 'execute_command',
      completedAt: '2026-09-21T09:00:01.000Z',
      durationMs: 80,
      result: {
        exitCode: 1,
        signal: null,
        timedOut: false,
        aborted: false,
        timeoutMs: 30_000,
        durationMs: 80,
        truncated: { stdout: false, stderr: false },
        collection: {
          status: 'collected',
          artifact: {
            artifactId: 'artifact-out',
            fileId: 'file-out',
            fileName: 'out.txt',
            mediaType: 'text/plain',
            fileKind: 'text',
            size: 12,
            status: 'ready',
            createdAt: '2026-09-21T09:00:01.000Z',
          },
          file: {
            fileId: 'file-out',
            fileName: 'out.txt',
            mediaType: 'text/plain',
            size: 12,
            status: 'ready',
            fileKind: 'text',
          },
        },
      },
      roundId: 'round-3',
      roundSequence: 3,
      blockSequence: 1,
    });

    expect(blocks.map((block) => block.type)).toEqual(['tool_activity', 'artifact']);
    expect(blocks[0]).toMatchObject({
      type: 'tool_activity',
      title: '执行命令',
      status: 'completed',
      summary: '命令完成，退出码 1，已收集输出文件',
    });
    expect(blocks[1]).toMatchObject({
      type: 'artifact',
      artifactId: 'artifact-out',
      fileName: 'out.txt',
    });
  });

  it('places a consumed steer before the following model round', () => {
    const afterSteer = appendUserIntervention([], {
      type: 'user.intervention',
      messageId: 'message-1',
      blockId: 'steer-1',
      inputId: 'input-1',
      content: '特别是科技相关的',
      roundId: 'boundary',
      roundSequence: 2,
      blockSequence: 0,
    });
    const blocks = appendTextDelta(afterSteer, {
      type: 'message.delta',
      messageId: 'message-1',
      blockId: 'text-2',
      delta: '明白，我重点深挖科技板块',
      roundId: 'round-2',
      roundSequence: 2,
      blockSequence: 1,
    });
    expect(blocks.map((block) => block.type)).toEqual(['user_intervention', 'text']);
  });
});
