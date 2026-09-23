import { describe, expect, it } from 'vitest';

import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';

import { ResearchProjectionCollector } from '../../../src/projection/research-projection.collector';

describe('ResearchProjectionCollector external tools', () => {
  it('records MCP completion without search sources', () => {
    const collector = new ResearchProjectionCollector();
    collector.recordExternalCompleted({
      toolCallId: 'call-mcp',
      publicName: 'mcp__fixture__ping',
      subKind: 'mcp',
      toolInput: { message: 'hi' },
      completedAt: '2026-09-23T10:00:00.000Z',
      durationMs: 12,
      outputPreview: 'pong',
      outputCharCount: 4,
    });
    const snapshot = collector.snapshot();
    expect(snapshot.sources).toHaveLength(0);
    expect(snapshot.executions).toEqual([
      expect.objectContaining({
        toolName: AGENT_TOOL_NAMES.externalTool,
        publicName: 'mcp__fixture__ping',
        subKind: 'mcp',
        outputPreview: 'pong',
        status: 'completed',
      }),
    ]);
  });
});
