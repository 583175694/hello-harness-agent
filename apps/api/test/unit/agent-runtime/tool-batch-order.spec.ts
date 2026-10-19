import { describe, expect, it } from 'vitest';
import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import { orderToolCallsForBatch } from '../../../src/agent-runtime/tool-batch-order';

describe('orderToolCallsForBatch', () => {
  it('runs tool_search before other calls while preserving relative order', () => {
    const ordered = orderToolCallsForBatch([
      { id: '1', name: AGENT_TOOL_NAMES.webSearch },
      { id: '2', name: AGENT_TOOL_NAMES.toolSearch },
      { id: '3', name: 'mcp__demo__ping' },
      { id: '4', name: AGENT_TOOL_NAMES.toolSearch },
      { id: '5', name: AGENT_TOOL_NAMES.readFile },
    ]);
    expect(ordered.map((call) => call.id)).toEqual(['2', '4', '1', '3', '5']);
  });
});
