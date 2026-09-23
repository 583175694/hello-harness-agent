import { describe, expect, it } from 'vitest';

import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';

import {
  classifyToolPresentation,
  externalSubKind,
  isExternalPresentation,
} from '../../../src/tools/tool-presentation';

describe('tool-presentation', () => {
  it('classifies MCP and web_search separately', () => {
    expect(classifyToolPresentation(AGENT_TOOL_NAMES.webSearch)).toBe('web_search');
    expect(classifyToolPresentation('mcp__fixture__ping')).toBe('mcp');
    expect(isExternalPresentation('mcp__fixture__ping')).toBe(true);
    expect(externalSubKind('mcp__fixture__ping')).toBe('mcp');
    expect(classifyToolPresentation('unknown_model_tool')).toBe('unknown');
  });
});
