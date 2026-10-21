import { describe, expect, it } from 'vitest';

import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';

import { synthesizeToolActivityBlocksFromExecutions } from '../../../src/run-storage/repair-detail-blocks.utils';

describe('synthesizeToolActivityBlocksFromExecutions', () => {
  it('builds tool_activity rows from execution snapshots', () => {
    const blocks = synthesizeToolActivityBlocksFromExecutions([
      {
        toolCallId: 'call-1',
        toolName: 'web_search',
        input: { query: 'hello' },
        status: 'completed',
        startedAt: '2026-10-11T00:00:00.000Z',
        completedAt: '2026-10-11T00:00:01.000Z',
        durationMs: 1000,
        resultCount: 1,
      },
      {
        toolCallId: 'call-2',
        toolName: AGENT_TOOL_NAMES.externalTool,
        publicName: 'fetch_content',
        subKind: 'mcp',
        input: {},
        status: 'completed',
        startedAt: '2026-10-11T00:00:02.000Z',
        completedAt: '2026-10-11T00:00:03.000Z',
        durationMs: 500,
      },
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'tool_activity', toolCallId: 'call-1', title: '搜索：hello' });
    expect(blocks[1]).toMatchObject({ type: 'tool_activity', toolName: 'fetch_content' });
  });
});
